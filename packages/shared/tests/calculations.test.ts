import { describe, expect, it } from "vitest";

import {
  buildCashflowTrend,
  buildDashboardSummary,
  buildTransferFeeInsight,
  summarizeAccountBalances,
  type TransferFeeInsightInput,
} from "../src/calculations";
import type { AccountRecord, BudgetRecord, TransactionRecord } from "../src/types";

const baseTransaction: Omit<TransactionRecord, "id" | "kind" | "amountMinor"> = {
  date: "2026-07-10",
  description: "Fixture",
  currency: "PHP",
  categoryId: "food",
  categoryName: "Food",
  categoryColor: "#a56f39",
  accountName: "Test",
};

describe("account balance calculations", () => {
  it("sums transaction-derived account balances including removed accounts", () => {
    const accounts: AccountRecord[] = [
      {
        id: "cash",
        name: "Cash",
        type: "cash",
        currency: "PHP",
        balanceMinor: 250_000,
        archived: false,
        system: true,
      },
      {
        id: "bank",
        name: "Bank",
        type: "checking",
        currency: "PHP",
        balanceMinor: 75_000,
        archived: false,
        system: true,
      },
      {
        id: "old",
        name: "Old wallet",
        type: "other",
        currency: "PHP",
        balanceMinor: -5_000,
        archived: true,
        system: false,
      },
    ];
    expect(summarizeAccountBalances(accounts)).toMatchObject({ overallBalanceMinor: 320_000 });
  });

  it("tracks overall balances separately per currency", () => {
    const accounts: AccountRecord[] = [
      {
        id: "cash",
        name: "Cash",
        type: "cash",
        currency: "PHP",
        balanceMinor: 100_000,
        archived: false,
        system: true,
      },
      {
        id: "usd-wallet",
        name: "USD wallet",
        type: "other",
        currency: "USD",
        balanceMinor: 50_000,
        archived: false,
        system: false,
      },
    ];
    expect(summarizeAccountBalances(accounts)).toMatchObject({
      overallBalanceMinor: 100_000,
      balancesByCurrency: { PHP: 100_000, USD: 50_000 },
    });
  });
});

describe("cashflow trend calculations", () => {
  it("returns seven zero-filled daily buckets for the week ending on the anchor date", () => {
    const trend = buildCashflowTrend(
      [
        { date: "2026-07-27", kind: "income", amountMinor: 8_000 },
        { date: "2026-07-23", kind: "expense", amountMinor: -2_500 },
        { date: "2026-07-25", kind: "transfer", amountMinor: -7_000 },
      ],
      "weekly",
      "2026-07-27",
    );

    expect(trend).toMatchObject({
      view: "weekly",
      granularity: "day",
      range: { from: "2026-07-21", to: "2026-07-27" },
    });
    expect(trend.points).toHaveLength(7);
    expect(trend.points).toContainEqual({
      date: "2026-07-23",
      incomeMinor: 0,
      expenseMinor: 2_500,
    });
    expect(trend.points.at(-1)).toEqual({
      date: "2026-07-27",
      incomeMinor: 8_000,
      expenseMinor: 0,
    });
    expect(trend.points.find((point) => point.date === "2026-07-25")).toEqual({
      date: "2026-07-25",
      incomeMinor: 0,
      expenseMinor: 0,
    });
  });

  it("returns every day in leap February and six full month buckets across a year boundary", () => {
    const monthly = buildCashflowTrend([], "monthly", "2024-02-12");
    const sixMonth = buildCashflowTrend([], "sixMonth", "2026-02-12");

    expect(monthly.range).toEqual({ from: "2024-02-01", to: "2024-02-29" });
    expect(monthly.points).toHaveLength(29);
    expect(monthly.points.at(-1)?.date).toBe("2024-02-29");
    expect(sixMonth.range).toEqual({ from: "2025-09-01", to: "2026-02-28" });
    expect(sixMonth.points.map((point) => point.date)).toEqual([
      "2025-09-01",
      "2025-10-01",
      "2025-11-01",
      "2025-12-01",
      "2026-01-01",
      "2026-02-01",
    ]);
  });
});

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

  it("reports income and expenses per currency alongside aggregate totals", () => {
    const transactions: TransactionRecord[] = [
      { ...baseTransaction, id: "php-income", kind: "income", amountMinor: 100_000 },
      {
        ...baseTransaction,
        id: "usd-income",
        currency: "USD",
        kind: "income",
        amountMinor: 20_000,
      },
      { ...baseTransaction, id: "php-expense", kind: "expense", amountMinor: -40_000 },
      {
        ...baseTransaction,
        id: "usd-expense",
        currency: "USD",
        kind: "expense",
        amountMinor: -5_000,
      },
    ];
    const result = buildDashboardSummary(transactions, [], {
      from: "2026-07-01",
      to: "2026-07-31",
    });
    expect(result.metrics.moneyInMinor).toBe(120_000);
    expect(result.metrics.moneyOutMinor).toBe(45_000);
    expect(result.metrics.incomeByCurrency).toEqual({ PHP: 100_000, USD: 20_000 });
    expect(result.metrics.expenseByCurrency).toEqual({ PHP: 40_000, USD: 5_000 });
  });

  it("returns stable empty-state totals", () => {
    const result = buildDashboardSummary([], [], { from: "2026-07-01", to: "2026-07-31" });
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

describe("transfer fee insight calculations", () => {
  it("returns a zeroed insight when there are no transfers", () => {
    const insight = buildTransferFeeInsight({ totals: [], recent: [] });
    expect(insight).toMatchObject({
      hasFees: false,
      totalTransfers: 0,
      totalFeeChargedTransfers: 0,
      feesByCurrency: { PHP: 0, USD: 0 },
      weekly: [],
      recentWeekCount: 0,
      recentAverageTransfersPerWeek: 0,
      recentAverageFeeChargedTransfersPerWeek: 0,
    });
  });

  it("combines all-time totals and recent weekly activity by week", () => {
    const input: TransferFeeInsightInput = {
      totals: [
        { currency: "PHP", transfers: 5, feeChargedTransfers: 3, feesMinor: 150 },
        { currency: "USD", transfers: 2, feeChargedTransfers: 1, feesMinor: 40 },
      ],
      recent: [
        // The 2026-07-06 week (Monday 2026-07-06).
        { date: "2026-07-07", currency: "PHP", transferFeeMinor: 50 },
        { date: "2026-07-08", currency: "PHP", transferFeeMinor: null },
        { date: "2026-07-09", currency: "USD", transferFeeMinor: 40 },
        // The following week (Monday 2026-07-13).
        { date: "2026-07-14", currency: "PHP", transferFeeMinor: 100 },
      ],
    };
    const insight = buildTransferFeeInsight(input);
    expect(insight).toMatchObject({
      hasFees: true,
      totalTransfers: 7,
      totalFeeChargedTransfers: 4,
      feesByCurrency: { PHP: 150, USD: 40 },
      recentWeekCount: 2,
      recentAverageTransfersPerWeek: 2,
      recentAverageFeeChargedTransfersPerWeek: 1.5,
    });
    expect(insight.weekly).toEqual([
      {
        weekStart: "2026-07-06",
        weekEnd: "2026-07-12",
        transfers: 3,
        feeChargedTransfers: 2,
        feesByCurrency: { PHP: 50, USD: 40 },
      },
      {
        weekStart: "2026-07-13",
        weekEnd: "2026-07-19",
        transfers: 1,
        feeChargedTransfers: 1,
        feesByCurrency: { PHP: 100, USD: 0 },
      },
    ]);
  });

  it("groups a Sunday into the Monday-starting week and ignores zero fees", () => {
    const input: TransferFeeInsightInput = {
      totals: [{ currency: "PHP", transfers: 1, feeChargedTransfers: 0, feesMinor: 0 }],
      recent: [
        // 2026-07-12 is a Sunday; its week starts Monday 2026-07-06.
        { date: "2026-07-12", currency: "PHP", transferFeeMinor: null },
        { date: "2026-07-13", currency: "PHP", transferFeeMinor: 0 },
      ],
    };
    const insight = buildTransferFeeInsight(input);
    expect(insight.weekly).toEqual([
      {
        weekStart: "2026-07-06",
        weekEnd: "2026-07-12",
        transfers: 1,
        feeChargedTransfers: 0,
        feesByCurrency: { PHP: 0, USD: 0 },
      },
      {
        weekStart: "2026-07-13",
        weekEnd: "2026-07-19",
        transfers: 1,
        feeChargedTransfers: 0,
        feesByCurrency: { PHP: 0, USD: 0 },
      },
    ]);
  });
});
