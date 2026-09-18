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
  { ok: true; intent: WidgetIntent } | { ok: false; error: string };

const WIDGET_INTENT_FAILURE =
  "That voice note could not be understood as an expense or a balance update.";

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
 * Shortens a raw spoken description into a concise transaction label.
 *
 * Strips speech noise:
 * - Conversational prefixes ("I spent", "I have spent", "Please log", etc.)
 * - Payment/account references ("using cash", "with GCash", "via Maya", or known account names)
 * - Temporal words ("today", "yesterday", "tonight", "this morning", etc.)
 * - Leading prepositions & articles ("for dinner" -> "Dinner", "on groceries" -> "Groceries")
 * - Dangling trailing prepositions
 *
 * Capitalizes the first letter and falls back to "Expense" if empty.
 */
export function summarizeWidgetDescription(raw: string, accountNames?: readonly string[]): string {
  let text = raw.trim();
  if (!text) return "Expense";

  // 1. Strip speech prefixes
  text = text.replace(
    /^(?:i(?:'ve| have)?|we(?:'ve| have)?|please|kindly)?\s*(?:just\s+)?(?:spent|spend|paid|pay|log|logged|add|added|bought|buy|purchase|purchased|record|recorded|have\s+spent|had)\b\s*/i,
    "",
  );

  // 2. Strip payment/account phrases matching user account names
  if (accountNames && accountNames.length > 0) {
    const sorted = [...accountNames]
      .map((n) => n.trim())
      .filter((n) => n.length > 1)
      .sort((a, b) => b.length - a.length);
    for (const name of sorted) {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const withPrep = new RegExp(
        `\\b(?:using|with|via|through|from|on|by|paid\\s+with|paid\\s+via|charged\\s+to)\\s+(?:my\\s+)?${escaped}\\b`,
        "gi",
      );
      text = text.replace(withPrep, " ");
      const trailing = new RegExp(`\\s+${escaped}\\s*$`, "i");
      text = text.replace(trailing, " ");
    }
  }

  // 3. Strip generic payment method phrases
  text = text.replace(
    /\b(?:using|with|via|through|from|on|by|paid\s+with|paid\s+via|charged\s+to)\s+(?:my\s+)?(?:cash|gcash|maya|paymaya|card|credit\s+card|debit\s+card|bank|bank\s+transfer|wallet|checking|savings|pocket\s+money)\b/gi,
    " ",
  );
  text = text.replace(/\b(?:in\s+cash|by\s+card)\b/gi, " ");

  // 4. Strip date and temporal phrases
  text = text.replace(
    /\b(?:today|yesterday|tonight|this\s+morning|this\s+afternoon|this\s+evening|just\s+now|earlier(?:\s+today)?|last\s+night)\b/gi,
    " ",
  );

  // 5. Repeatedly strip leading prepositions and articles
  let prev = "";
  while (prev !== text) {
    prev = text;
    text = text.replace(/^(?:for|on|at|in|to|about|around|a|an|the|my|our|some)\b\s*/i, "");
  }

  // 6. Strip trailing dangling prepositions and conjunctions
  text = text.replace(/\s+\b(?:for|on|at|in|to|using|with|via|from|by|and)\s*$/i, "");

  // 7. Normalize whitespace and trailing punctuation
  text = text
    .replace(/\s+/g, " ")
    .replace(/[,.;:]+$/, "")
    .trim();

  if (!text) return "Expense";

  // 8. Sentence case (capitalize first letter)
  return text.charAt(0).toUpperCase() + text.slice(1);
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

  const rawMerchant = stripAmount(text)
    .replace(CURRENCY_WORDS, " ")
    .replace(EXPENSE_LEADERS, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!rawMerchant) return null;
  const merchant = summarizeWidgetDescription(rawMerchant).slice(0, 240);
  return { type: "expense", amountMinor, merchant };
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

/** Lowercased word tokens, so punctuation and spacing never block a phrase match. */
function matchTokens(value: string): string[] {
  return normalizeName(value)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

function includesTokenPhrase(haystack: readonly string[], phrase: readonly string[]): boolean {
  if (phrase.length === 0 || phrase.length > haystack.length) return false;
  return haystack.some((_, index) =>
    phrase.every((token, offset) => haystack[index + offset] === token),
  );
}

/**
 * Resolves an account the speaker named out loud ("... dinner today using cash").
 *
 * The native widget only extracts the amount and merchant, so its intent JSON
 * never carries an account. Matching the speaker's own account names against
 * the transcript recovers it without a hardcoded alias list. Longest names are
 * tried first so "GCash Wallet" wins over "GCash", and whole-token matching
 * keeps "Cash" from matching "cashier" or the "cash" inside "GCash".
 */
export function resolveWidgetAccountFromTranscript(
  accounts: readonly WidgetAccountOption[],
  transcript: string | null | undefined,
): string | null {
  if (!transcript?.trim()) return null;
  const haystack = matchTokens(transcript);
  const byLongestName = [...accounts].sort(
    (a, b) => matchTokens(b.name).length - matchTokens(a.name).length,
  );
  for (const account of byLongestName) {
    if (includesTokenPhrase(haystack, matchTokens(account.name))) return account.id;
  }
  return null;
}

export interface WidgetAccountBalance {
  id: string;
  /** Null when the account has no computed balance yet. */
  balanceMinor: number | null;
}

/**
 * Current balance for the account a reconcile voice note targets.
 *
 * The dashboard read is the only source of that number and settles after the
 * lighter accounts query, so an unknown balance stays null instead of
 * defaulting to zero: a placeholder zero would book the whole target balance as
 * an adjustment.
 */
export function resolveKnownBalanceMinor(
  accounts: readonly WidgetAccountBalance[] | null | undefined,
  accountId: string,
): number | null {
  if (!accountId || !accounts) return null;
  const account = accounts.find((item) => item.id === accountId);
  return account?.balanceMinor ?? null;
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
