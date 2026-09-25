import {
  CURRENT_RECEIPT_CONSENT_VERSION,
  normalizeImportDate,
  type ReceiptDraft,
  type ReceiptPreferences,
} from "@zoption/shared";

import { consumeAiUsage } from "../db/billing";
import type { ReceiptRepository } from "../db/receipts";
import { HttpError } from "../errors";
import type { Bindings } from "../types";
import {
  DEFAULT_RECEIPT_VISION_MODEL,
  ReceiptVisionProviderError,
  type ReceiptVisionCandidate,
  type ReceiptVisionProvider,
} from "./vision-provider";

export interface ReceiptService {
  getPreferences(env: Bindings, tenantId: string): Promise<ReceiptPreferences>;
  grantConsent(env: Bindings, tenantId: string): Promise<ReceiptPreferences>;
  extract(env: Bindings, tenantId: string, image: File): Promise<ReceiptDraft>;
}

export interface ReceiptVisionProviderFailureEvent {
  event: "receipt_vision_provider_failure";
  provider: ReceiptVisionProviderError["provider"];
  kind: ReceiptVisionProviderError["kind"];
  providerStatus?: number;
}

export type ReceiptDiagnosticReporter = (event: ReceiptVisionProviderFailureEvent) => void;

function defaultDiagnosticReporter(event: ReceiptVisionProviderFailureEvent): void {
  console.warn(JSON.stringify(event));
}

function reportProviderFailure(
  error: ReceiptVisionProviderError,
  reporter: ReceiptDiagnosticReporter,
): void {
  const event: ReceiptVisionProviderFailureEvent = {
    event: "receipt_vision_provider_failure",
    provider: error.provider,
    kind: error.kind,
    ...(error.providerStatus === undefined ? {} : { providerStatus: error.providerStatus }),
  };
  try {
    reporter(event);
  } catch {
    // Operational diagnostics must never alter the user-facing extraction response.
  }
}

function requireEnabled(env: Bindings): void {
  if (env.RECEIPT_ENTRY_ENABLED !== "true") {
    throw new HttpError(404, "receipt_entry_not_enabled", "Receipt scanning is not available.");
  }
}

function currentDateInTimeZone(env: Bindings): string {
  const timeZone = env.ASSISTANT_TIME_ZONE?.trim() || "Asia/Manila";
  const parts = new Intl.DateTimeFormat("en", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return values.get("year") + "-" + values.get("month") + "-" + values.get("day");
}

function mapProviderError(error: unknown, reporter: ReceiptDiagnosticReporter): never {
  if (!(error instanceof ReceiptVisionProviderError)) throw error;
  reportProviderFailure(error, reporter);
  if (error.kind === "timeout") {
    throw new HttpError(
      504,
      "receipt_extraction_timeout",
      "Reading the receipt took too long. Try again.",
    );
  }
  if (error.kind === "rate_limit") {
    throw new HttpError(
      429,
      "receipt_extraction_rate_limited",
      "Receipt scanning is busy. Try again shortly.",
    );
  }
  if (error.kind === "invalid_response") {
    throw new HttpError(
      502,
      "receipt_extraction_invalid_response",
      "The receipt could not be read. Try a clearer photo.",
    );
  }
  throw new HttpError(
    503,
    "receipt_extraction_unavailable",
    "Receipt scanning is temporarily unavailable.",
  );
}

// Totals, tax breakdowns, and payment lines the model sometimes lists as items
// despite the prompt. Philippine receipts print VATable/VAT-exempt/zero-rated
// sales and the VAT amount as summaries of lines already listed above them, so
// keeping any of these would double count the purchase.
const SUMMARY_LINE_PATTERNS = [
  /^(?:sub|grand|net)?[\s-]*total\b/i,
  /^amount\s+(?:due|paid|tendered)\b/i,
  /^(?:vat(?:able)?|vat[\s-]*exempt|zero[\s-]*rated|(?:sales\s+)?tax|12%\s*vat)\b/i,
  // Payment lines are matched whole so items such as "Cash-in fee" stay.
  /^(?:cash(?:\s+tendered)?|change|tendered|payment|balance(?:\s+due)?)\s*:?\s*$/i,
];

function isSummaryLine(description: string): boolean {
  return SUMMARY_LINE_PATTERNS.some((pattern) => pattern.test(description));
}

type ReceiptDraftItem = NonNullable<ReceiptDraft["items"]>[number];

/**
 * Spreads a receipt-level discount across the purchased lines in proportion to
 * their price, so each transaction records what was actually paid and the lines
 * still add up to the receipt total. Integer largest-remainder allocation keeps
 * every centavo accounted for.
 */
function applyDiscount(items: ReceiptDraftItem[], discountMinor: number): ReceiptDraftItem[] {
  const grossMinor = items.reduce((total, item) => total + item.amountMinor, 0);
  if (discountMinor >= grossMinor || !Number.isSafeInteger(grossMinor * discountMinor)) return [];
  const shares = items.map((item, index) => {
    const exact = item.amountMinor * discountMinor;
    return { index, share: Math.floor(exact / grossMinor), remainder: exact % grossMinor };
  });
  let unallocated = discountMinor - shares.reduce((total, entry) => total + entry.share, 0);
  for (const entry of [...shares].sort((a, b) => b.remainder - a.remainder || a.index - b.index)) {
    if (unallocated === 0) break;
    entry.share += 1;
    unallocated -= 1;
  }
  return items.flatMap((item, index) => {
    const amountMinor = item.amountMinor - (shares[index]?.share ?? 0);
    // A fully discounted line cost nothing, so it has no transaction to record.
    return amountMinor > 0 ? [{ ...item, amountMinor }] : [];
  });
}

function normalizeItems(
  candidate: ReceiptVisionCandidate,
  totalMinor: number,
): ReceiptDraftItem[] | undefined {
  if (!candidate.items) return undefined;
  const lines = candidate.items.flatMap((item) => {
    const description = item.description?.trim();
    if (
      !description ||
      isSummaryLine(description) ||
      typeof item.amountMinor !== "number" ||
      !Number.isSafeInteger(item.amountMinor) ||
      item.amountMinor === 0
    ) {
      return [];
    }
    return [{ ...item, description, amountMinor: item.amountMinor }];
  });
  // The prompt asks for every deduction (discount, coupon, SC/PWD 20%, Less VAT)
  // as a negative line, so the sign decides, not the wording: a "Promo Bucket"
  // is a purchase. When no line is positive the model copied the expense sign
  // onto every price instead, so those lines are purchases too.
  const signedDeductions = lines.some((item) => item.amountMinor > 0);
  let items: ReceiptDraftItem[] = [];
  let discountMinor = 0;
  for (const item of lines) {
    if (signedDeductions && item.amountMinor < 0) {
      discountMinor -= item.amountMinor;
      continue;
    }
    items.push({
      description: item.description.slice(0, 160),
      amountMinor: Math.abs(item.amountMinor),
      ...(item.categoryName?.trim() ? { categoryName: item.categoryName.trim().slice(0, 80) } : {}),
    });
  }
  items = items.slice(0, 30);
  if (!items.length) return items;
  // The small vision model often writes line prices in pesos while the total
  // follows the centavo instruction. Only rescale when that is the exact
  // explanation, so a genuinely mismatched itemization stays visible for review.
  // Discounts rescale with the items; mixed scales never reconcile and stay as read.
  const netMinor = items.reduce((total, item) => total + item.amountMinor, 0) - discountMinor;
  if (netMinor * 100 === Math.abs(totalMinor)) {
    items = items.map((item) => ({ ...item, amountMinor: item.amountMinor * 100 }));
    discountMinor *= 100;
  }
  return discountMinor > 0 ? applyDiscount(items, discountMinor) : items;
}

export function createReceiptService(
  repository: ReceiptRepository,
  provider: ReceiptVisionProvider,
  reporter: ReceiptDiagnosticReporter = defaultDiagnosticReporter,
): ReceiptService {
  async function requireConsent(env: Bindings, tenantId: string): Promise<void> {
    requireEnabled(env);
    const consent = await repository.getConsent(env, tenantId);
    if (!consent.consentedAt || consent.consentVersion !== CURRENT_RECEIPT_CONSENT_VERSION) {
      throw new HttpError(409, "receipt_consent_required", "Accept the AI entry notice first.");
    }
  }

  async function preferences(env: Bindings, tenantId: string): Promise<ReceiptPreferences> {
    requireEnabled(env);
    const consent = await repository.getConsent(env, tenantId);
    return {
      enabled: true,
      consentedAt: consent.consentedAt,
      consentVersion: consent.consentVersion,
      visionModel: env.RECEIPT_VISION_MODEL?.trim() || DEFAULT_RECEIPT_VISION_MODEL,
    };
  }

  function normalizeDraft(env: Bindings, candidate: ReceiptVisionCandidate): ReceiptDraft {
    const merchant = candidate.merchant?.trim() ?? "";
    if (!merchant) {
      throw new HttpError(
        422,
        "receipt_merchant_unreadable",
        "Could not read the merchant name from this photo. Try a clearer photo.",
      );
    }
    const amountMinor = candidate.amountMinor;
    if (
      typeof amountMinor !== "number" ||
      !Number.isSafeInteger(amountMinor) ||
      amountMinor === 0
    ) {
      throw new HttpError(
        422,
        "receipt_amount_unreadable",
        "Could not read the total amount from this photo. Try a clearer photo.",
      );
    }
    const kind = candidate.kind ?? (amountMinor < 0 ? "expense" : "income");
    const items = normalizeItems(candidate, amountMinor);
    return {
      merchant,
      date: normalizeImportDate(candidate.date?.trim() ?? "") ?? currentDateInTimeZone(env),
      amountMinor,
      currency: "PHP",
      kind,
      ...(candidate.categoryName?.trim()
        ? { categoryName: candidate.categoryName.trim().slice(0, 80) }
        : {}),
      ...(items ? { items } : {}),
      rawText: candidate.rawText?.trim().slice(0, 6_000) ?? "",
    };
  }

  return {
    getPreferences: preferences,
    async grantConsent(env, tenantId) {
      requireEnabled(env);
      await repository.grantConsent(env, tenantId);
      return preferences(env, tenantId);
    },
    async extract(env, tenantId, image) {
      await requireConsent(env, tenantId);
      // Receipt vision spends one billable provider call, drawn from the shared monthly pool.
      await consumeAiUsage(env, tenantId);
      try {
        const candidate = await provider.extract(env, image);
        return normalizeDraft(env, candidate);
      } catch (error) {
        return mapProviderError(error, reporter);
      }
    },
  };
}
