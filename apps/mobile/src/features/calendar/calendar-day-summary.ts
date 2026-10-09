import type { LocalCalendarDay } from "@/db/view-models";

export interface DayTotals {
  incomeMinor: number;
  expenseMinor: number;
}

/** Income and spending of one day; a transfer moves money between accounts and counts as neither. */
export function dayTotals(day: LocalCalendarDay | undefined): DayTotals {
  let incomeMinor = 0;
  let expenseMinor = 0;
  for (const transaction of day?.transactions ?? []) {
    if (transaction.kind === "income") incomeMinor += Math.abs(transaction.amountMinor);
    else if (transaction.kind === "expense") expenseMinor += Math.abs(transaction.amountMinor);
  }
  return { incomeMinor, expenseMinor };
}

export function monthTotals(days: readonly LocalCalendarDay[]): DayTotals {
  return days.reduce<DayTotals>(
    (sum, day) => {
      const totals = dayTotals(day);
      return {
        incomeMinor: sum.incomeMinor + totals.incomeMinor,
        expenseMinor: sum.expenseMinor + totals.expenseMinor,
      };
    },
    { incomeMinor: 0, expenseMinor: 0 },
  );
}
