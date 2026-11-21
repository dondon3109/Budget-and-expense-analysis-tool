import { currencies, type Currency } from "@zoption/shared";

import type { LocalBudgetOccasion, LocalCalendarDay } from "@/db/view-models";

import type { CalendarCell } from "./calendar-month-grid";

export interface DayTotals {
  incomeMinor: number;
  expenseMinor: number;
}

export type DayTotalsByCurrency = Partial<Record<Currency, DayTotals>>;

/** Per-currency income and spending of one day; transfers move money between accounts and count as neither. */
export function dayTotalsByCurrency(day: LocalCalendarDay | undefined): DayTotalsByCurrency {
  const totals: DayTotalsByCurrency = {};
  for (const transaction of day?.transactions ?? []) {
    if (transaction.kind !== "income" && transaction.kind !== "expense") continue;
    const entry = totals[transaction.currency] ?? { incomeMinor: 0, expenseMinor: 0 };
    if (transaction.kind === "income") entry.incomeMinor += Math.abs(transaction.amountMinor);
    else entry.expenseMinor += Math.abs(transaction.amountMinor);
    totals[transaction.currency] = entry;
  }
  return totals;
}

/** Per-currency income and spending across the month without ever adding different currencies together. */
export function monthTotalsByCurrency(days: readonly LocalCalendarDay[]): DayTotalsByCurrency {
  const totals: DayTotalsByCurrency = {};
  for (const day of days) {
    const perCurrency = dayTotalsByCurrency(day);
    for (const currency of currencies) {
      const entry = perCurrency[currency];
      if (!entry) continue;
      const sum = totals[currency] ?? { incomeMinor: 0, expenseMinor: 0 };
      sum.incomeMinor += entry.incomeMinor;
      sum.expenseMinor += entry.expenseMinor;
      totals[currency] = sum;
    }
  }
  return totals;
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
    const byCurrency = dayTotalsByCurrency(day);
    const populated = currencies.filter((currency) => byCurrency[currency] !== undefined);
    const singleTotals = populated.length === 1 ? byCurrency[populated[0]!] : undefined;
    cells.set(day.date, {
      ...cell,
      incomeMinor: singleTotals?.incomeMinor ?? 0,
      expenseMinor: singleTotals?.expenseMinor ?? 0,
      mixedCurrency: populated.length > 1,
      hasEvent: day.events.length > 0,
      hasBill: day.subscriptionBills.length > 0,
      summary,
    });
  }
  return cells;
}
