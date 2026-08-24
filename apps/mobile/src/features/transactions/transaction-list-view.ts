import type { Currency } from "@zoption/shared";

import type { LocalTransactionItem } from "@/db/repository";

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
    if (transaction.kind === "income") {
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
