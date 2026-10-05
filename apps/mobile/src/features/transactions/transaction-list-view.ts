import { countsAsIncome, type Currency } from "@zoption/shared";

import type { LocalTransactionItem, TransactionKindFilter } from "@/db/view-models";

export interface TransactionTotals {
  incomeMinor: number;
  expenseMinor: number;
  netMinor: number;
}

export type TransactionTotalsByCurrency = Partial<Record<Currency, TransactionTotals>>;

export interface TransactionDateGroup {
  date: string;
  items: LocalTransactionItem[];
  totals: TransactionTotalsByCurrency;
}

function emptyTotals(): TransactionTotals {
  return { incomeMinor: 0, expenseMinor: 0, netMinor: 0 };
}

export function summarizeTransactions(
  items: readonly LocalTransactionItem[],
): TransactionTotalsByCurrency {
  const totals: TransactionTotalsByCurrency = {};
  for (const item of items) {
    const { transaction } = item;
    const currencyTotals = totals[transaction.currency] ?? emptyTotals();
    if (countsAsIncome(transaction)) {
      currencyTotals.incomeMinor += Math.abs(transaction.amountMinor);
    } else if (transaction.kind === "expense") {
      currencyTotals.expenseMinor += Math.abs(transaction.amountMinor);
    }
    currencyTotals.netMinor = currencyTotals.incomeMinor - currencyTotals.expenseMinor;
    totals[transaction.currency] = currencyTotals;
  }
  return totals;
}

export function groupTransactionsByDate(
  items: readonly LocalTransactionItem[],
): TransactionDateGroup[] {
  const groups = new Map<string, LocalTransactionItem[]>();
  for (const item of items) {
    const dateItems = groups.get(item.transaction.date) ?? [];
    dateItems.push(item);
    groups.set(item.transaction.date, dateItems);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => right.localeCompare(left))
    .map(([date, dateItems]) => ({
      date,
      items: dateItems,
      totals: summarizeTransactions(dateItems),
    }));
}

/** Short whole-unit label for a tight calendar cell, e.g. 850, 2.1k, 12k, 1.5M. Display only. */
export function compactAmountLabel(amountMinor: number): string {
  const whole = Math.trunc(Math.abs(amountMinor) / 100);
  if (whole < 1000) return String(whole);
  const [divisor, suffix] = whole >= 1_000_000 ? [1_000_000, "M"] : [1000, "k"];
  const tenths = Math.trunc((whole * 10) / divisor);
  const value = tenths >= 100 ? String(Math.trunc(tenths / 10)) : (tenths / 10).toFixed(1);
  return value.replace(/\.0$/, "") + suffix;
}

export function shiftMonthStart(month: string, delta: number): string {
  const date = new Date(month + "T00:00:00Z");
  date.setUTCMonth(date.getUTCMonth() + delta);
  return date.toISOString().slice(0, 10);
}

export function monthStartForDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${date.getFullYear()}-${month}-01`;
}

export function transactionDayLabel(date: string): { day: string; weekday: string } {
  const parsed = new Date(date + "T00:00:00Z");
  return {
    day: String(parsed.getUTCDate()),
    weekday: parsed.toLocaleDateString(undefined, { weekday: "short", timeZone: "UTC" }),
  };
}

export const kindLabels: Record<TransactionKindFilter, string> = {
  all: "All",
  income: "Income",
  expense: "Expenses",
  transfer: "Transfers",
};

export interface CategorySummaryItem {
  key: string;
  name: string;
  color: string;
  iconEmoji: string | null;
  currency: Currency;
  incomeMinor: number;
  expenseMinor: number;
  transferMinor: number;
}

export function categorySummary(items: readonly LocalTransactionItem[]): CategorySummaryItem[] {
  const rows = new Map<string, CategorySummaryItem>();
  for (const item of items) {
    const { transaction } = item;
    const key = `${transaction.categoryId}:${transaction.currency}`;
    const row = rows.get(key) ?? {
      key,
      name: transaction.categoryName,
      color: transaction.categoryColor,
      iconEmoji: transaction.categoryIconEmoji ?? null,
      currency: transaction.currency,
      incomeMinor: 0,
      expenseMinor: 0,
      transferMinor: 0,
    };
    if (countsAsIncome(transaction)) row.incomeMinor += Math.abs(transaction.amountMinor);
    if (transaction.kind === "expense") row.expenseMinor += Math.abs(transaction.amountMinor);
    if (transaction.kind === "transfer") row.transferMinor += Math.abs(transaction.amountMinor);
    rows.set(key, row);
  }
  return [...rows.values()].sort(
    (left, right) =>
      right.expenseMinor +
        right.incomeMinor +
        right.transferMinor -
        (left.expenseMinor + left.incomeMinor + left.transferMinor) ||
      left.name.localeCompare(right.name),
  );
}
