import {
  CURRENT_RECEIPT_CONSENT_VERSION,
  normalizeImportDate,
  type ReceiptDraft,
  type ReceiptPreferences,
} from "@zoption/shared";

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

export function createReceiptService(
  repository: ReceiptRepository,
  provider: ReceiptVisionProvider,
  reporter: ReceiptDiagnosticReporter = defaultDiagnosticReporter,
): ReceiptService {
  async function requireConsent(env: Bindings, tenantId: string): Promise<void> {
    requireEnabled(env);
    const consent = await repository.getConsent(env, tenantId);
    if (!consent.consentedAt || consent.consentVersion !== CURRENT_RECEIPT_CONSENT_VERSION) {
      throw new HttpError(
        409,
        "receipt_consent_required",
        "Accept the receipt photo notice first.",
      );
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
    return {
      merchant,
      date: normalizeImportDate(candidate.date?.trim() ?? "") ?? currentDateInTimeZone(env),
      amountMinor,
      currency: "PHP",
      kind,
      ...(candidate.categoryName?.trim()
        ? { categoryName: candidate.categoryName.trim().slice(0, 80) }
        : {}),
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
      try {
        const candidate = await provider.extract(env, image);
        return normalizeDraft(env, candidate);
      } catch (error) {
        return mapProviderError(error, reporter);
      }
    },
  };
}
