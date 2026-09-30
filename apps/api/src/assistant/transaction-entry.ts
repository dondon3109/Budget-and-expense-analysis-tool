import {
  matchCategory,
  parseAmountToMinor,
  type AccountRecord,
  type AssistantDataQualitySignal,
  type AssistantToolResultEnvelope,
  type AssistantTransactionDraft,
  type CategoryRecord,
  type Currency,
} from "@zoption/shared";

import type { Bindings } from "../types";
import {
  compactDescription,
  findAccountByName,
  formatMoney,
  normalizedName,
} from "./record-format";

type EntryKind = "income" | "expense";

export interface TransactionSuggestionInput {
  through: string;
  place?: string;
  kind: EntryKind;
}

export interface TransactionDraftInput {
  kind: EntryKind;
  description: string;
  categoryName: string;
  accountName: string;
  date: string;
  amount?: string;
  balanceAfter?: string;
  balanceBefore?: string;
  /** Read by the orchestrator, which knows which earlier reply the correction replaces. */
  replacesPreviousDraft?: boolean;
  currentDate: string;
}

export interface EntryHistoryRow {
  date: string;
  description: string;
  amountMinor: number;
  currency: Currency;
  categoryName: string;
  /** Null when the transaction has no account or its account was removed. */
  accountName: string | null;
}

export type EntryHistoryLoader = (
  context: { env: Bindings; tenantId: string },
  kind: EntryKind,
  from: string,
  to: string,
) => Promise<EntryHistoryRow[]>;

/**
 * The model sees only the envelope. The draft carries the tenant's record ids for the
 * confirm route and travels in response metadata, never in a tool result.
 */
export interface TransactionDraftResult {
  envelope: AssistantToolResultEnvelope<unknown>;
  draft?: AssistantTransactionDraft;
}

const HISTORY_MONTHS = 12;
const MAX_HISTORY_ROWS = 1_000;
const MAX_SUGGESTIONS = 5;
const MAX_DRAFT_AGE_DAYS = 366;
const STOP_WORDS = new Set(["the", "at", "in", "on", "from", "to", "sa", "ng", "nang", "and"]);
const LEDGER_BALANCE_SIGNAL: AssistantDataQualitySignal = {
  code: "ledger_balance_no_opening_snapshot",
  message:
    "Balances are sums of recorded transactions and may omit money held before tracking began.",
};

/** Suggestions learn from this trailing window of the user's entries. */
export function entryHistoryFrom(through: string): string {
  return shiftIsoMonths(through, -HISTORY_MONTHS);
}

export async function loadEntryHistory(
  context: { env: Bindings; tenantId: string },
  kind: EntryKind,
  from: string,
  to: string,
): Promise<EntryHistoryRow[]> {
  const rows = await context.env.DB.prepare(
    `SELECT t.date, t.description, t.amount_minor AS amountMinor, t.currency,
            c.name AS categoryName,
            CASE WHEN a.archived = 0 THEN a.name END AS accountName
     FROM transactions t
     INNER JOIN categories c ON c.id = t.category_id AND c.tenant_id = t.tenant_id
     LEFT JOIN accounts a ON a.id = t.account_id AND a.tenant_id = t.tenant_id
     WHERE t.tenant_id = ? AND t.kind = ? AND t.date >= ? AND t.date <= ? AND c.archived = 0
     ORDER BY t.date DESC, t.id DESC
     LIMIT ?`,
  )
    .bind(context.tenantId, kind, from, to, MAX_HISTORY_ROWS)
    .all<EntryHistoryRow>();
  return rows.results;
}

function envelope<T extends object>(
  data: T,
  sourceType: "transactions" | "accounts",
  options: { recordCount?: number; signals?: AssistantDataQualitySignal[] } = {},
): AssistantToolResultEnvelope<T> {
  const signals = options.signals ?? [];
  return {
    data,
    source: {
      sourceType,
      ...(options.recordCount === undefined ? {} : { recordCount: options.recordCount }),
    },
    dataQuality: { status: signals.length > 0 ? "limited" : "reliable", signals },
  };
}

function shiftIsoDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function shiftIsoMonths(value: string, months: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 10);
}

function descriptionKey(value: string): string {
  return value
    .toLocaleLowerCase("en")
    .replace(/[^\p{L}\p{N}&'\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function keyTokens(value: string): string[] {
  return descriptionKey(value)
    .split(" ")
    .filter((token) => token.length >= 2 && !STOP_WORDS.has(token));
}

function tokensMatch(a: string, b: string): boolean {
  if (a === b) return true;
  // Short tokens such as "sm" must match exactly, or "sm" would also match "smart".
  if (a.length < 4 || b.length < 4) return false;
  return a.startsWith(b) || b.startsWith(a);
}

/** Every token of the shorter side appears in the other: "Jollibee" matches "Jollibee SM North". */
function placeMatches(placeTokens: readonly string[], description: string): boolean {
  const descriptionTokens = keyTokens(description);
  if (placeTokens.length === 0 || descriptionTokens.length === 0) return false;
  const [shorter, longer] =
    placeTokens.length <= descriptionTokens.length
      ? [placeTokens, descriptionTokens]
      : [descriptionTokens, placeTokens];
  return shorter.every((token) => longer.some((other) => tokensMatch(token, other)));
}

function mostCommon(values: readonly (string | null)[]): string | null {
  const counts = new Map<string, number>();
  for (const value of values) {
    if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  // Rows arrive newest first, so a tie keeps the most recently used value.
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

function medianMinor(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]!
    : Math.round((sorted[middle - 1]! + sorted[middle]!) / 2);
}

interface HistoryGroup {
  rows: EntryHistoryRow[];
}

function groupHistory(rows: readonly EntryHistoryRow[]): HistoryGroup[] {
  const groups = new Map<string, HistoryGroup>();
  for (const row of rows) {
    const description = descriptionKey(row.description);
    if (!description) continue;
    // A typical amount only means something within one currency.
    const key = `${row.currency}:${description}`;
    const group = groups.get(key) ?? { rows: [] };
    group.rows.push(row);
    groups.set(key, group);
  }
  return [...groups.values()];
}

function describeGroup(group: HistoryGroup) {
  const latest = group.rows[0]!;
  return {
    description: compactDescription(latest.description),
    categoryName: mostCommon(group.rows.map((row) => row.categoryName)),
    accountName: mostCommon(group.rows.map((row) => row.accountName)),
    typicalAmount: formatMoney(
      medianMinor(group.rows.map((row) => Math.abs(row.amountMinor))),
      latest.currency,
    ),
    lastAmount: formatMoney(Math.abs(latest.amountMinor), latest.currency),
    lastDate: latest.date,
    timesRecorded: group.rows.length,
  };
}

function eligibleCategories(categories: readonly CategoryRecord[], kind: EntryKind) {
  return categories.filter((item) => !item.archived && !item.locked && item.kind === kind);
}

function accountChoices(accounts: readonly AccountRecord[]) {
  return accounts
    .filter((account) => !account.archived)
    .map((account) => ({
      name: account.name,
      balance: formatMoney(account.balanceMinor ?? 0, account.currency),
    }));
}

/**
 * Suggests what to enter from the user's own history: past entries at a named place first,
 * otherwise the entries they record most often, plus the category, account, and typical
 * amount those entries used.
 */
export function suggestTransactionDetails(
  input: TransactionSuggestionInput,
  history: readonly EntryHistoryRow[],
  accounts: readonly AccountRecord[],
  categories: readonly CategoryRecord[],
) {
  const from = entryHistoryFrom(input.through);
  const groups = groupHistory(history);
  const placeTokens = input.place ? keyTokens(input.place) : [];
  const placeGroups =
    placeTokens.length > 0
      ? groups.filter((group) => placeMatches(placeTokens, group.rows[0]!.description))
      : [];
  const placeMatched = placeGroups.length > 0;
  const ranked = (placeMatched ? placeGroups : groups).sort(
    (a, b) => b.rows.length - a.rows.length || b.rows[0]!.date.localeCompare(a.rows[0]!.date),
  );
  const suggestions = ranked.slice(0, MAX_SUGGESTIONS).map(describeGroup);
  const kindCategories = eligibleCategories(categories, input.kind);
  const nameMatch =
    !placeMatched && input.place
      ? matchCategory(kindCategories, null, { kind: input.kind, contextText: input.place })
      : undefined;
  const suggestedCategory = placeMatched
    ? (suggestions[0]?.categoryName ?? null)
    : (nameMatch?.name ?? null);
  const signals: AssistantDataQualitySignal[] = [LEDGER_BALANCE_SIGNAL];
  if (history.length === 0) {
    signals.push({
      code: "no_entry_history",
      message: `No ${input.kind} entries were recorded in the history window to learn from.`,
    });
  }

  return envelope(
    {
      kind: input.kind,
      historyWindow: { from, to: input.through },
      ...(input.place ? { place: input.place, placeMatched } : {}),
      suggestionBasis: placeMatched ? "past_entries_at_place" : "most_frequent_entries",
      suggestions,
      suggestedCategory,
      ...(suggestedCategory
        ? { categorySuggestionBasis: placeMatched ? "past_entries" : "place_name" }
        : {}),
      mostUsedAccount: mostCommon(history.map((row) => row.accountName)),
      categories: kindCategories.map((item) => item.name),
      accounts: accountChoices(accounts),
    },
    "transactions",
    { recordCount: history.length, signals },
  );
}

function amountFromBalances(
  input: TransactionDraftInput,
  account: AccountRecord,
): { amountMinor: number; calculation: Record<string, string> } {
  const afterMinor = parseAmountToMinor(input.balanceAfter!);
  const beforeMinor = parseAmountToMinor(input.balanceBefore!);
  return {
    amountMinor: input.kind === "expense" ? beforeMinor - afterMinor : afterMinor - beforeMinor,
    calculation: {
      balanceBefore: formatMoney(beforeMinor, account.currency),
      balanceAfter: formatMoney(afterMinor, account.currency),
    },
  };
}

/**
 * Resolves a draft against the tenant's active records. It never writes: the returned draft
 * waits in the reply for the user to confirm, and the create path re-validates it on save.
 */
export function draftTransaction(
  input: TransactionDraftInput,
  accounts: readonly AccountRecord[],
  categories: readonly CategoryRecord[],
): TransactionDraftResult {
  const activeAccounts = accounts.filter((account) => !account.archived);
  const account = findAccountByName(activeAccounts, input.accountName);
  if (!account) {
    return {
      envelope: envelope(
        {
          status: "account_not_found",
          accountName: input.accountName,
          availableAccounts: activeAccounts.map((item) => item.name),
        },
        "accounts",
      ),
    };
  }
  const kindCategories = eligibleCategories(categories, input.kind);
  const category =
    kindCategories.find(
      (item) => normalizedName(item.name) === normalizedName(input.categoryName),
    ) ?? matchCategory(kindCategories, input.categoryName, { kind: input.kind });
  if (!category) {
    return {
      envelope: envelope(
        {
          status: "category_not_found",
          categoryName: input.categoryName,
          availableCategories: kindCategories.map((item) => item.name),
        },
        "transactions",
      ),
    };
  }
  if (
    input.date > input.currentDate ||
    input.date < shiftIsoDays(input.currentDate, -MAX_DRAFT_AGE_DAYS)
  ) {
    return {
      envelope: envelope(
        { status: "date_out_of_range", date: input.date, latestAllowedDate: input.currentDate },
        "transactions",
      ),
    };
  }

  // The recorded balance has no opening snapshot and may miss unrecorded activity, so it is
  // never used silently: the user confirms (or corrects) it as the balance before.
  if (input.amount === undefined && input.balanceBefore === undefined) {
    return {
      envelope: envelope(
        {
          status: "confirm_balance_before",
          accountName: account.name,
          recordedBalance: formatMoney(account.balanceMinor ?? 0, account.currency),
          balanceAfter: formatMoney(parseAmountToMinor(input.balanceAfter!), account.currency),
          nextStep:
            "Ask whether the recorded balance is what the account held before, then pass the confirmed figure as balanceBefore.",
        },
        "accounts",
        { signals: [LEDGER_BALANCE_SIGNAL] },
      ),
    };
  }
  const derived = input.amount === undefined ? amountFromBalances(input, account) : undefined;
  const amountMinor = derived ? derived.amountMinor : parseAmountToMinor(input.amount!);
  if (amountMinor <= 0) {
    return {
      envelope: envelope(
        {
          status: derived ? "balances_do_not_imply_amount" : "invalid_amount",
          ...(derived ? { calculation: derived.calculation } : {}),
        },
        "accounts",
      ),
    };
  }

  const draft: AssistantTransactionDraft = {
    status: "pending",
    kind: input.kind,
    date: input.date,
    description: input.description.trim(),
    amountMinor,
    currency: account.currency,
    categoryId: category.id,
    categoryName: category.name,
    accountId: account.id,
    accountName: account.name,
  };
  const amount = formatMoney(amountMinor, account.currency);
  return {
    draft,
    envelope: envelope(
      {
        status: "ready",
        saved: false,
        draft: {
          kind: draft.kind,
          date: draft.date,
          description: draft.description,
          amount,
          categoryName: draft.categoryName,
          accountName: draft.accountName,
        },
        ...(derived ? { calculation: { ...derived.calculation, amount } } : {}),
        nextStep: "Not saved yet. Ask the user to review the draft and tap Save transaction.",
      },
      "transactions",
    ),
  };
}
