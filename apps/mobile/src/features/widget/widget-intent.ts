import { MoneyParseError, parseAmountToMinor } from "@zoption/shared";

// Intents parsed from the transcript the native Android mic widget
// (tap-to-talk without opening the app) delivers via the widget-intent deep
// link. The native side only captures speech; every parsing rule lives here so
// it stays in one jest-tested place. Amounts are integer minor units (PHP
// centavos) per repo convention.

export interface WidgetTransactionIntent {
  type: "expense" | "income";
  amountMinor: number;
  merchant: string;
}

export interface WidgetReconcileIntent {
  type: "reconcile";
  account: string;
  newBalanceMinor: number;
}

export type WidgetIntent = WidgetTransactionIntent | WidgetReconcileIntent;

const RECONCILE_KEYWORDS =
  /\b(reconcile|reconciliation|adjust(ment|ed)?( the balance)?|set( the)? balance|update( the)? balance|correct( the)? balance|true up)\b/i;

// Money coming in. Checked after reconcile and only when the note does not open
// with a spending verb, so "paid the helper's salary" stays an expense.
const INCOME_KEYWORDS =
  /\b(income|salary|sahod|sweldo|payday|paycheck|payroll|wages?|bonus|commission|allowance|refund(ed)?|reimburse(d|ment)?|cash\s?back|dividends?|earn(ed|ings)?|receive[ds]?|got\s+paid|get\s+paid|sold)\b/i;

const SPEECH_OPENER = String.raw`^(?:i(?:'ve| have)?|we(?:'ve| have)?|please|kindly)?\s*(?:just\s+)?`;

const EXPENSE_OPENER = new RegExp(
  `${SPEECH_OPENER}(?:spent|spend|paid|pay|bought|buy|purchased?|have\\s+spent)\\b`,
  "i",
);

// Verbs that only frame the note ("I received ...", "log ...") and never belong
// in the description. "sold" stays: "Sold old phone" is the useful label.
const LEADING_VERBS = new RegExp(
  `${SPEECH_OPENER}(?:spent|spend|paid|pay|log|logged|add|added|bought|buy|purchase|purchased|record|recorded|have\\s+spent|had|received|receive|got\\s+paid|got|earned|earn|made)\\b\\s*(?:(?:an?\\s+)?income(?:\\s+of)?\\b\\s*)?`,
  "i",
);

const CURRENCY_WORDS = /\b(pesos?|php)\b|₱/gi;

// Digits with optional thousands separators and centavos, an optional spoken
// "k" (thousand), and an optional currency marker on either side.
const AMOUNT_TOKEN =
  /(₱\s*)?(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)(\s*k\b)?(\s*(?:pesos?\b|php\b|₱))?/gi;

const MONTH_BEFORE =
  /\b(jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|june?|july?|aug(ust)?|sep(t(ember)?)?|oct(ober)?|nov(ember)?|dec(ember)?)\s*$/i;

// A trailing hyphen covers names like "7-Eleven".
const DATE_OR_TIME_AFTER = /^(-|st|nd|rd|th\b|:\d|\s*(am|pm|a\.m\.|p\.m\.|o'?clock)\b)/i;

const FILLER_WORDS =
  /\b(my|the|a|an|account|balance|is|to|at|of|on|for|now|current|please|today|yesterday)\b/gi;

interface SpokenAmount {
  minor: number;
  start: number;
  end: number;
}

function toMinor(digits: string, thousands: boolean): number | null {
  try {
    const minor = parseAmountToMinor(digits) * (thousands ? 1000 : 1);
    return minor > 0 && Number.isSafeInteger(minor) ? minor : null;
  } catch (error) {
    if (error instanceof MoneyParseError) return null;
    throw error;
  }
}

/**
 * The spoken amount: the first currency-marked number ("500 pesos", "₱500"),
 * else the first bare number that is not part of a date or time, so
 * "salary 20,000" works while "march 5" and "5 pm" never parse as money.
 */
function extractSpokenAmount(transcript: string): SpokenAmount | null {
  let bare: SpokenAmount | null = null;
  for (const match of transcript.matchAll(AMOUNT_TOKEN)) {
    const [token, prefix, digits = "", thousands, suffix] = match;
    const start = match.index;
    const end = start + token.length;
    const minor = toMinor(digits, Boolean(thousands));
    if (minor == null) continue;
    if (prefix || suffix) return { minor, start, end };
    if (bare) continue;
    if (MONTH_BEFORE.test(transcript.slice(0, start))) continue;
    if (DATE_OR_TIME_AFTER.test(transcript.slice(end))) continue;
    bare = { minor, start, end };
  }
  return bare;
}

/**
 * Shortens a raw spoken description into a concise transaction label.
 *
 * Strips speech noise:
 * - Conversational prefixes ("I spent", "I received", "Please log", etc.)
 * - Payment/account references ("using cash", "with GCash", "into BDO", or known account names)
 * - Temporal words ("today", "yesterday", "tonight", "this morning", etc.)
 * - Leading prepositions & articles ("for dinner" -> "Dinner", "on groceries" -> "Groceries")
 * - Dangling trailing prepositions
 *
 * Capitalizes the first letter and falls back to `fallback` if empty.
 */
export function summarizeWidgetDescription(
  raw: string,
  accountNames?: readonly string[],
  fallback = "Expense",
): string {
  let text = raw.trim();
  if (!text) return fallback;

  // 1. Strip speech prefixes
  text = text.replace(LEADING_VERBS, "");

  // 2. Strip payment/account phrases matching user account names
  if (accountNames && accountNames.length > 0) {
    const sorted = [...accountNames]
      .map((n) => n.trim())
      .filter((n) => n.length > 1)
      .sort((a, b) => b.length - a.length);
    for (const name of sorted) {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const withPrep = new RegExp(
        `\\b(?:using|with|via|through|from|on|by|into|to|paid\\s+with|paid\\s+via|charged\\s+to)\\s+(?:my\\s+)?${escaped}\\b`,
        "gi",
      );
      text = text.replace(withPrep, " ");
      const trailing = new RegExp(`\\s+${escaped}\\s*$`, "i");
      text = text.replace(trailing, " ");
    }
  }

  // 3. Strip generic payment method phrases
  text = text.replace(
    /\b(?:using|with|via|through|from|on|by|into|to|paid\s+with|paid\s+via|charged\s+to)\s+(?:my\s+)?(?:cash|gcash|maya|paymaya|card|credit\s+card|debit\s+card|bank|bank\s+transfer|wallet|checking|savings|pocket\s+money)\b/gi,
    " ",
  );
  text = text.replace(/\b(?:in\s+cash|by\s+card)\b/gi, " ");

  // 4. Strip date and temporal phrases
  text = text.replace(
    /\b(?:today|yesterday|kahapon|tonight|this\s+morning|this\s+afternoon|this\s+evening|just\s+now|earlier(?:\s+today)?|last\s+night)\b/gi,
    " ",
  );

  // 5. Repeatedly strip leading prepositions and articles
  let prev = "";
  while (prev !== text) {
    prev = text;
    text = text.replace(/^(?:for|on|at|in|to|from|about|around|a|an|the|my|our|some)\b\s*/i, "");
  }

  // 6. Strip trailing dangling prepositions and conjunctions
  text = text.replace(/\s+\b(?:for|on|at|in|to|using|with|via|from|by|into|and)\s*$/i, "");

  // 7. Normalize whitespace and trailing punctuation
  text = text
    .replace(/\s+/g, " ")
    .replace(/[,.;:]+$/, "")
    .trim();

  if (!text) return fallback;

  // 8. Sentence case (capitalize first letter)
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Canonical transcript-to-intent parser for the mic widget. Null means ask the user. */
export function parseWidgetTranscriptToIntent(transcript: string): WidgetIntent | null {
  const text = transcript.trim();
  if (!text) return null;
  const amount = extractSpokenAmount(text);
  if (!amount) return null;
  const withoutAmount = `${text.slice(0, amount.start)} ${text.slice(amount.end)}`;

  if (RECONCILE_KEYWORDS.test(text)) {
    const account = withoutAmount
      .replace(RECONCILE_KEYWORDS, " ")
      .replace(CURRENCY_WORDS, " ")
      .replace(FILLER_WORDS, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!account) return null;
    return { type: "reconcile", account, newBalanceMinor: amount.minor };
  }

  const type = INCOME_KEYWORDS.test(text) && !EXPENSE_OPENER.test(text) ? "income" : "expense";
  const rawMerchant = withoutAmount.replace(CURRENCY_WORDS, " ").replace(/\s+/g, " ").trim();
  const merchant = summarizeWidgetDescription(
    rawMerchant,
    undefined,
    type === "income" ? "Income" : "Expense",
  ).slice(0, 240);
  return { type, amountMinor: amount.minor, merchant };
}

/** Spoken "yesterday" dates the entry a day back; anything else is today. */
export function widgetTransactionDate(transcript: string | null, now = new Date()): Date {
  if (!transcript || !/\b(yesterday|kahapon|last\s+night)\b/i.test(transcript)) return now;
  const date = new Date(now);
  date.setDate(date.getDate() - 1);
  return date;
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
