import type { LocalCalendarDay } from "@/db/view-models";
import {
  calendarCellsFromDays,
  dayTotals,
  dayTotalsByCurrency,
  monthTotals,
  monthTotalsByCurrency,
} from "./calendar-day-summary";

const day: LocalCalendarDay = {
  date: "2026-08-24",
  events: [],
  subscriptionBills: [],
  transactions: [
    { id: "a", description: "Salary", amountMinor: 500_000, currency: "PHP", kind: "income" },
    { id: "b", description: "Lunch", amountMinor: -45_000, currency: "PHP", kind: "expense" },
    { id: "c", description: "Move", amountMinor: -100_000, currency: "PHP", kind: "transfer" },
  ],
};

describe("calendar day summary", () => {
  it("counts income and spending, and ignores transfers", () => {
    expect(dayTotals(day)).toEqual({ incomeMinor: 500_000, expenseMinor: 45_000 });
    expect(monthTotals([day, day])).toEqual({ incomeMinor: 1_000_000, expenseMinor: 90_000 });
    expect(dayTotals(undefined)).toEqual({ incomeMinor: 0, expenseMinor: 0 });
  });

  it("keeps currencies separate in totals and marks mixed-currency calendar cells", () => {
    const mixedDay: LocalCalendarDay = {
      date: "2026-08-25",
      events: [],
      subscriptionBills: [],
      transactions: [
        {
          id: "d",
          description: "PHP Coffee",
          amountMinor: -18_000,
          currency: "PHP",
          kind: "expense",
        },
        {
          id: "e",
          description: "USD Cloud",
          amountMinor: -2_000,
          currency: "USD",
          kind: "expense",
        },
      ],
    };
    expect(dayTotalsByCurrency(mixedDay)).toEqual({
      PHP: { incomeMinor: 0, expenseMinor: 18_000 },
      USD: { incomeMinor: 0, expenseMinor: 2_000 },
    });
    expect(monthTotalsByCurrency([day, mixedDay])).toEqual({
      PHP: { incomeMinor: 500_000, expenseMinor: 63_000 },
      USD: { incomeMinor: 0, expenseMinor: 2_000 },
    });

    const cells = calendarCellsFromDays([day, mixedDay], []);
    expect(cells.get("2026-08-24")).toMatchObject({
      incomeMinor: 500_000,
      expenseMinor: 45_000,
      mixedCurrency: false,
    });
    expect(cells.get("2026-08-25")).toMatchObject({
      incomeMinor: 0,
      expenseMinor: 0,
      mixedCurrency: true,
    });
  });
});
