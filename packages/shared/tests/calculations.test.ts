import { describe, expect, it } from "vitest";

import { buildDashboardSummary } from "../src/calculations";
import type { BudgetRecord, TransactionRecord } from "../src/types";

const baseTransaction: Omit<TransactionRecord, "id" | "kind" | "amountMinor"> = {
  date: "2026-07-10",
  description: "Fixture",
  currency: "PHP",
  categoryId: "food",
  categoryName: "Food",
  categoryColor: "#a56f39",
  accountName: "Test",
};

describe("dashboard calculations", () => {
  it("excludes transfers and keeps over-budget values visible", () => {
    const transactions: TransactionRecord[] = [
      { ...baseTransaction, id: "income", kind: "income", amountMinor: 100_000 },
      { ...baseTransaction, id: "expense", kind: "expense", amountMinor: -70_000 },
      { ...baseTransaction, id: "transfer", kind: "transfer", amountMinor: -50_000 },
    ];
    const budgets: BudgetRecord[] = [
      {
        categoryId: "food",
        categoryName: "Food",
        categoryColor: "#a56f39",
        month: "2026-07-01",
        limitMinor: 60_000,
      },
    ];

    const result = buildDashboardSummary(transactions, budgets, {
      from: "2026-07-01",
      to: "2026-07-31",
    });

    expect(result.metrics.moneyInMinor).toBe(100_000);
    expect(result.metrics.moneyOutMinor).toBe(70_000);
    expect(result.metrics.netMinor).toBe(30_000);
    expect(result.insights.savingsMinor).toBe(30_000);
    expect(result.insights.savingsRatePercent).toBe(30);
    expect(result.metrics.remainingBudgetMinor).toBe(-10_000);
    expect(result.budgetProgress[0]?.usedPercent).toBe(116.7);
  });

  it("returns stable empty-state totals", () => {
    const result = buildDashboardSummary([], [], {
      from: "2026-07-01",
      to: "2026-07-31",
    });
    expect(result.metrics.budgetUsedPercent).toBe(0);
    expect(result.spendingByCategory).toEqual([]);
    expect(result.monthlyTrend).toEqual([]);
    expect(result.insights).toEqual({
      savingsMinor: 0,
      savingsRatePercent: null,
      recurringExpenses: [],
    });
  });

  it("identifies recurring expenses across at least three distinct months", () => {
    const transactions: TransactionRecord[] = [
      {
        ...baseTransaction,
        id: "rent-1",
        date: "2026-05-03",
        description: "Rent",
        kind: "expense",
        amountMinor: -80_000,
      },
      {
        ...baseTransaction,
        id: "rent-2",
        date: "2026-06-03",
        description: " rent ",
        kind: "expense",
        amountMinor: -81_000,
      },
      {
        ...baseTransaction,
        id: "rent-3",
        date: "2026-07-03",
        description: "RENT",
        kind: "expense",
        amountMinor: -82_000,
      },
      {
        ...baseTransaction,
        id: "one-off",
        date: "2026-07-04",
        description: "Repairs",
        kind: "expense",
        amountMinor: -10_000,
      },
    ];

    const result = buildDashboardSummary(transactions, [], {
      from: "2026-07-01",
      to: "2026-07-31",
    });

    expect(result.insights.recurringExpenses).toEqual([
      {
        description: "Rent",
        categoryName: "Food",
        averageMinor: 81_000,
        occurrenceCount: 3,
        latestMonth: "2026-07",
      },
    ]);
  });
});
