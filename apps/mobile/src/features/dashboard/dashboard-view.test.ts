import type { LocalDashboardData } from "@/db/repository";

import { buildDashboardView } from "./dashboard-view";

const account = {
  id: "account-1",
  name: "Wallet",
  type: "cash" as const,
  currency: "PHP" as const,
  balanceMinor: 30_000,
  balancesByCurrency: { PHP: 30_000, USD: 0 },
  archived: false,
  system: false,
};

const income = {
  id: "t-income",
  date: "2026-08-10",
  description: "Salary",
  amountMinor: 50_000,
  currency: "PHP" as const,
  kind: "income" as const,
  categoryId: "cat-income",
  categoryName: "Income",
  categoryColor: "#08776d",
  accountName: "Wallet",
};

const expense = {
  id: "t-expense",
  date: "2026-08-11",
  description: "Lunch",
  amountMinor: -20_000,
  currency: "PHP" as const,
  kind: "expense" as const,
  categoryId: "cat-food",
  categoryName: "Food",
  categoryColor: "#a0441f",
  accountName: "Wallet",
};

function data(overrides: Partial<LocalDashboardData> = {}): LocalDashboardData {
  return { transactions: [income, expense], accounts: [account], budgets: [], ...overrides };
}

describe("buildDashboardView", () => {
  it("computes the current-month summary from local rows", () => {
    const view = buildDashboardView(data(), "2026-08-14");
    expect(view.summary.period).toEqual({ from: "2026-08-01", to: "2026-08-31" });
    expect(view.summary.metrics.moneyInMinor).toBe(50_000);
    expect(view.summary.metrics.moneyOutMinor).toBe(20_000);
    expect(view.summary.metrics.netMinor).toBe(30_000);
    expect(view.summary.insights.savingsRatePercent).toBe(60);
    expect(view.summary.spendingByCategory).toEqual([
      expect.objectContaining({ categoryId: "cat-food", amountMinor: 20_000, sharePercent: 100 }),
    ]);
    expect(view.summary.budgetProgress).toEqual([]);
  });

  it("passes the precomputed ledger balances through untouched", () => {
    const view = buildDashboardView(data(), "2026-08-14");
    expect(view.accountBalances.overallBalanceMinor).toBe(30_000);
    expect(view.accountBalances.items[0]).toMatchObject({ name: "Wallet", balanceMinor: 30_000 });
  });

  it("builds a seven-point weekly cash flow", () => {
    const view = buildDashboardView(data(), "2026-08-14");
    expect(view.cashflow.view).toBe("weekly");
    expect(view.cashflow.points).toHaveLength(7);
    const day = view.cashflow.points.find((point) => point.date === "2026-08-10");
    expect(day).toMatchObject({ incomeMinor: 50_000, expenseMinor: 0 });
  });

  it("scopes the summary period to the anchor month", () => {
    const view = buildDashboardView(
      data({ transactions: [income, { ...expense, date: "2026-07-15" }] }),
      "2026-08-14",
    );
    expect(view.summary.metrics.moneyOutMinor).toBe(0);
    expect(view.summary.monthlyTrend.map((point) => point.month)).toEqual(["2026-07", "2026-08"]);
  });
});
