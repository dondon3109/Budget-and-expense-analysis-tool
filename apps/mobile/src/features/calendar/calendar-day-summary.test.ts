import type { LocalCalendarDay } from "@/db/view-models";
import { dayTotals, monthTotals } from "./calendar-day-summary";

const day: LocalCalendarDay = {
  date: "2026-08-24",
  events: [],
  subscriptionBills: [],
  transactions: [
    { id: "a", description: "Salary", amountMinor: 500_000, kind: "income" },
    { id: "b", description: "Lunch", amountMinor: -45_000, kind: "expense" },
    { id: "c", description: "Move", amountMinor: -100_000, kind: "transfer" },
  ],
};

describe("calendar day summary", () => {
  it("counts income and spending, and ignores transfers", () => {
    expect(dayTotals(day)).toEqual({ incomeMinor: 500_000, expenseMinor: 45_000 });
    expect(monthTotals([day, day])).toEqual({ incomeMinor: 1_000_000, expenseMinor: 90_000 });
    expect(dayTotals(undefined)).toEqual({ incomeMinor: 0, expenseMinor: 0 });
  });
});
