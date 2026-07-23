import type { DashboardSummary } from "@zoption/shared";
import { describe, expect, it } from "vitest";

import { isDashboardEmpty } from "../src/pages/DashboardPage";

const emptyDashboard: DashboardSummary = {
  period: { from: "2026-07-01", to: "2026-07-31" },
  currency: "PHP",
  metrics: {
    moneyInMinor: 0,
    moneyOutMinor: 0,
    netMinor: 0,
    budgetLimitMinor: 0,
    remainingBudgetMinor: 0,
    budgetUsedPercent: 0,
  },
  spendingByCategory: [],
  monthlyTrend: [],
  budgetProgress: [],
  insights: { savingsMinor: 0, savingsRatePercent: null, recurringExpenses: [] },
};

describe("dashboard empty state", () => {
  it("recognizes a newly bootstrapped workspace", () => {
    expect(isDashboardEmpty(emptyDashboard)).toBe(true);
  });

  it("shows the normal dashboard after financial activity exists", () => {
    expect(
      isDashboardEmpty({
        ...emptyDashboard,
        monthlyTrend: [{ month: "2026-07", incomeMinor: 10_000, expenseMinor: 0 }],
      }),
    ).toBe(false);
  });
});
