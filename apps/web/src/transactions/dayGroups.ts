import type { Currency, TransactionListItem } from "@zoption/shared";

export interface TransactionDayTotals {
  incomeMinor: number;
  expenseMinor: number;
}

export interface TransactionDayGroup {
  date: string;
  items: TransactionListItem[];
  totals: Partial<Record<Currency, TransactionDayTotals>>;
}

/**
 * Splits a date-sorted ledger into one group per day, keeping the list's order so both
 * newest-first and oldest-first reads group the same way. Totals cover the loaded rows.
 */
export function groupTransactionsByDay(
  items: readonly TransactionListItem[],
): TransactionDayGroup[] {
  const groups: TransactionDayGroup[] = [];
  for (const item of items) {
    let group = groups[groups.length - 1];
    if (!group || group.date !== item.date) {
      group = { date: item.date, items: [], totals: {} };
      groups.push(group);
    }
    group.items.push(item);
    const totals = group.totals[item.currency] ?? { incomeMinor: 0, expenseMinor: 0 };
    if (item.kind === "income") totals.incomeMinor += Math.abs(item.amountMinor);
    if (item.kind === "expense") totals.expenseMinor += Math.abs(item.amountMinor);
    group.totals[item.currency] = totals;
  }
  return groups;
}
