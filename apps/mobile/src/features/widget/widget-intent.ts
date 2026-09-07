import { MoneyParseError, parseAmountToMinor } from "@zoption/shared";
import { z } from "zod";

// Intent JSON produced by the native Android mic widget (tap-to-talk without
// opening the app) and delivered via the widget-intent deep link. Amounts are
// integer minor units (PHP centavos) per repo convention. The app never trusts
// the native payload blindly: it is re-validated here before anything renders.

export const widgetExpenseIntentSchema = z
  .object({
    type: z.literal("expense"),
    amountMinor: z.number().int().positive(),
    merchant: z.string().trim().min(1).max(240),
    category: z.string().trim().min(1).max(80).optional(),
    account: z.string().trim().min(1).max(120).optional(),
  })
  .strict();

export const widgetReconcileIntentSchema = z
  .object({
    type: z.literal("reconcile"),
    account: z.string().trim().min(1).max(120),
    newBalanceMinor: z.number().int().safe(),
  })
  .strict();

export const widgetIntentSchema = z.discriminatedUnion("type", [
  widgetExpenseIntentSchema,
  widgetReconcileIntentSchema,
]);

export type WidgetExpenseIntent = z.infer<typeof widgetExpenseIntentSchema>;
export type WidgetReconcileIntent = z.infer<typeof widgetReconcileIntentSchema>;
export type WidgetIntent = z.infer<typeof widgetIntentSchema>;

export type WidgetIntentParseResult =
  | { ok: true; intent: WidgetIntent }
  | { ok: false; error: string };

const WIDGET_INTENT_FAILURE = "That voice note could not be understood as an expense or a balance update.";

/** Validates raw intent JSON from the widget deep-link payload. Garbage fails closed. */
export function parseWidgetIntentPayload(value: unknown): WidgetIntentParseResult {
  let decoded: unknown = value;
  if (typeof decoded === "string") {
    try {
      decoded = JSON.parse(decoded) as unknown;
    } catch {
      return { ok: false, error: WIDGET_INTENT_FAILURE };
    }
  }
  const parsed = widgetIntentSchema.safeParse(decoded);
  if (!parsed.success) return { ok: false, error: WIDGET_INTENT_FAILURE };
  return { ok: true, intent: parsed.data };
}

const RECONCILE_KEYWORDS =
  /\b(reconcile|reconciliation|adjust(ment|ed)?( the balance)?|set( the)? balance|update( the)? balance|correct( the)? balance|true up)\b/i;

const EXPENSE_LEADERS =
  /^(spent|spend|paid|pay|log|logged|add|added|bought|buy|purchase|purchased|record|recorded)\b\s*/i;

const CURRENCY_WORDS = /\b(pesos?|php)\b|₱/gi;

const AMOUNT_TOKEN = /₱?\s*(\d[\d,]*(?:\.\d{1,2})?)\s*(pesos?|php|₱)?/i;

const FILLER_WORDS =
  /\b(my|the|a|an|account|balance|is|to|at|of|on|for|now|current|please|today|yesterday)\b/gi;

function extractMinorUnits(transcript: string): number | null {
  const match = AMOUNT_TOKEN.exec(transcript);
  if (!match) return null;
  // Require an explicit currency marker so dates ("march 5") never parse as money.
  const marker = (match[2] ?? "") || (/₱/.test(match[0] ?? "") ? "₱" : "");
  if (!marker) return null;
  try {
    const minor = parseAmountToMinor(match[1] ?? "");
    return minor > 0 ? minor : null;
  } catch (error) {
    if (error instanceof MoneyParseError) return null;
    throw error;
  }
}

function stripAmount(transcript: string): string {
  return transcript.replace(AMOUNT_TOKEN, " ");
}

/**
 * Canonical transcript-to-intent parser. The native widget builds best-effort
 * JSON with a mirrored subset of these rules; the app falls back to this
 * parser when the native payload is missing or unparseable, so behavior stays
 * consistent and jest-testable in one place.
 */
export function parseWidgetTranscriptToIntent(transcript: string): WidgetIntent | null {
  const text = transcript.trim();
  if (!text) return null;
  const lowered = text.toLocaleLowerCase("en");
  const amountMinor = extractMinorUnits(text);
  if (amountMinor == null) return null;

  if (RECONCILE_KEYWORDS.test(lowered)) {
    const account = stripAmount(text)
      .replace(RECONCILE_KEYWORDS, " ")
      .replace(CURRENCY_WORDS, " ")
      .replace(FILLER_WORDS, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!account) return null;
    return { type: "reconcile", account, newBalanceMinor: amountMinor };
  }

  const merchant = stripAmount(text)
    .replace(CURRENCY_WORDS, " ")
    .replace(EXPENSE_LEADERS, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!merchant) return null;
  return { type: "expense", amountMinor, merchant: merchant.slice(0, 240) };
}

export interface WidgetAccountOption {
  id: string;
  name: string;
}

export interface WidgetCategoryOption {
  id: string;
  name: string;
  kind: "income" | "expense" | "transfer";
}

function normalizeName(value: string): string {
  return value.trim().toLocaleLowerCase("en");
}

/** Resolves an intent account name to a local account id; null means ask the user. */
export function resolveWidgetAccount(
  accounts: readonly WidgetAccountOption[],
  name: string | undefined,
): string | null {
  if (name) {
    const wanted = normalizeName(name);
    const exact = accounts.find((account) => normalizeName(account.name) === wanted);
    if (exact) return exact.id;
  }
  return null;
}

/**
 * Resolves an intent category name to a local category id, mirroring the
 * receipt-review fallback: suggested name, then "Uncategorized", then the
 * first usable category of that kind.
 */
export function resolveWidgetCategory(
  categories: readonly WidgetCategoryOption[],
  kind: "income" | "expense",
  suggestedName?: string,
): string | null {
  const usable = categories.filter((category) => category.kind === kind);
  if (usable.length === 0) return null;
  const wanted = suggestedName?.trim().toLocaleLowerCase("en");
  return (
    usable.find((category) => category.name.toLocaleLowerCase("en") === wanted)?.id ??
    usable.find((category) => category.name.toLocaleLowerCase("en") === "uncategorized")?.id ??
    usable[0]?.id ??
    null
  );
}
