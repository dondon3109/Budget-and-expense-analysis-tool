import type { DashboardSummary } from "@zoption/shared";
import { describe, expect, it } from "vitest";

import { calculatePercentageChange, isDashboardEmpty } from "../src/pages/DashboardPage";

const emptyDashboard: DashboardSummary = {
  period: { from: "2026-07-01", to: "2026-07-31" },
  currency: "PHP",
  metrics: {
    moneyInMinor: 0,
    moneyOutMinor: 0,
    netMinor: 0,
    incomeByCurrency: { PHP: 0, USD: 0 },
    expenseByCurrency: { PHP: 0, USD: 0 },
    budgetLimitMinor: 0,
    remainingBudgetMinor: 0,
    budgetUsedPercent: 0,
  },
  spendingByCategory: [],
  monthlyTrend: [],
  budgetProgress: [],
  insights: { savingsMinor: 0, savingsRatePercent: null, recurringExpenses: [] },
};

describe("dashboard percentage changes", () => {
  it("calculates signed month-over-month changes", () => {
    expect(calculatePercentageChange(125, 100)).toBe(25);
    expect(calculatePercentageChange(75, 100)).toBe(-25);
    expect(calculatePercentageChange(0, 0)).toBe(0);
    expect(calculatePercentageChange(100, 0)).toBe(100);
    expect(calculatePercentageChange(-100, 0)).toBe(-100);
  });
});

describe("dashboard empty state", () => {
  it("recognizes a newly bootstrapped workspace after all-time history loads empty", () => {
    expect(isDashboardEmpty(emptyDashboard, undefined, 0)).toBe(true);
  });

  it("does not hide historical transactions when the current month is quiet", () => {
    expect(isDashboardEmpty(emptyDashboard, undefined, 1)).toBe(false);
  });

  it("shows the normal dashboard after financial activity exists", () => {
    expect(
      isDashboardEmpty(emptyDashboard, {
        view: "sixMonth",
        granularity: "month",
        range: { from: "2026-02-01", to: "2026-07-31" },
        points: [{ date: "2026-07-01", incomeMinor: 10_000, expenseMinor: 0 }],
      }),
    ).toBe(false);
  });
});
