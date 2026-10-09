import type { LocalBudgetOccasion, LocalCalendarDay } from "@/db/view-models";

import type { CalendarCell } from "./calendar-month-grid";

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

/** Grid cells for the Calendar screen: activity, bills, events, and occasion budgets per day. */
export function calendarCellsFromDays(
  days: readonly LocalCalendarDay[],
  occasions: readonly LocalBudgetOccasion[],
): Map<string, CalendarCell> {
  const cells = new Map<string, CalendarCell>();
  const cellFor = (date: string): CalendarCell => {
    const existing = cells.get(date);
    if (existing) return existing;
    const created: CalendarCell = { incomeMinor: 0, expenseMinor: 0, summary: [] };
    cells.set(date, created);
    return created;
  };
  for (const occasion of occasions) {
    const cell = cellFor(occasion.date);
    cells.set(occasion.date, {
      ...cell,
      tag: cell.tag ?? occasion.title,
      summary: [...cell.summary, `occasion budget ${occasion.title}`],
    });
  }
  const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;
  for (const day of days) {
    const cell = cellFor(day.date);
    const summary = [...cell.summary];
    if (day.events.length) summary.push(plural(day.events.length, "event"));
    if (day.subscriptionBills.length) summary.push(plural(day.subscriptionBills.length, "bill"));
    if (day.transactions.length) summary.push(plural(day.transactions.length, "transaction"));
    cells.set(day.date, {
      ...cell,
      ...dayTotals(day),
      hasEvent: day.events.length > 0,
      hasBill: day.subscriptionBills.length > 0,
      summary,
    });
  }
  return cells;
}
