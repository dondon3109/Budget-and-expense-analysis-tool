import { describe, expect, it } from "vitest";

import {
  calculateDebtPayoff,
  calculateSavingsGoal,
  detectRecurringCharges,
  detectSpendingAnomalies,
} from "../src/planning";

describe("debt payoff planning", () => {
  const debts = [
    {
      name: "Card A",
      balanceMinor: 100_000,
      aprBasisPoints: 2_400,
      minimumPaymentMinor: 5_000,
    },
    {
      name: "Loan B",
      balanceMinor: 50_000,
      aprBasisPoints: 1_000,
      minimumPaymentMinor: 4_000,
    },
  ];

  it("uses deterministic avalanche and snowball ordering", () => {
    const avalanche = calculateDebtPayoff(debts, "avalanche", 10_000, "2026-08-01");
    const snowball = calculateDebtPayoff(debts, "snowball", 10_000, "2026-08-01");

    expect(avalanche.status).toBe("paid_off");
    expect(avalanche.payoffOrder[0]).toBe("Card A");
    expect(snowball.payoffOrder[0]).toBe("Loan B");
    expect(avalanche.totalInterestMinor).toBeLessThan(snowball.totalInterestMinor);
    expect(avalanche.schedule.at(-1)?.remainingMinor).toBe(0);
  });

  it("flags a projection that cannot amortize", () => {
    const result = calculateDebtPayoff(
      [
        {
          name: "High interest",
          balanceMinor: 100_000,
          aprBasisPoints: 10_000,
          minimumPaymentMinor: 100,
        },
      ],
      "avalanche",
      0,
      "2026-08-01",
    );

    expect(result.status).toBe("non_amortizing");
    expect(result.payoffDate).toBeNull();
  });
});

describe("savings goal planning", () => {
  it("uses ceiling division across future contribution months", () => {
    expect(calculateSavingsGoal(100_000, 10_001, "2026-12-15", "2026-08-02")).toMatchObject({
      status: "on_track",
      contributionMonths: 4,
      remainingMinor: 89_999,
      requiredMonthlyMinor: 22_500,
    });
  });

  it("handles met, current-month, and past-due goals", () => {
    expect(calculateSavingsGoal(10_000, 10_000, "2026-12-01", "2026-08-02").status).toBe("met");
    expect(calculateSavingsGoal(10_000, 0, "2026-08-31", "2026-08-02")).toMatchObject({
      status: "due_now",
      amountDueNowMinor: 10_000,
    });
    expect(calculateSavingsGoal(10_000, 0, "2026-07-31", "2026-08-02").status).toBe("past_due");
  });
});

describe("recurring charge detection", () => {
  it("reports cadence and backend-calculated price changes", () => {
    const result = detectRecurringCharges([
      {
        date: "2026-05-03",
        description: "Stream Co",
        categoryName: "Subscriptions",
        amountMinor: -1_000,
      },
      {
        date: "2026-06-03",
        description: " stream co ",
        categoryName: "Subscriptions",
        amountMinor: -1_000,
      },
      {
        date: "2026-07-03",
        description: "STREAM CO",
        categoryName: "Subscriptions",
        amountMinor: -1_200,
      },
    ]);

    expect(result).toEqual([
      expect.objectContaining({
        occurrenceCount: 3,
        cadence: "monthly",
        typicalAmountMinor: 1_000,
        latestAmountMinor: 1_200,
        priceChangeMinor: 200,
        priceChangePercent: 20,
        confidence: "medium",
      }),
    ]);
  });
});

describe("spending anomaly detection", () => {
  it("flags large transactions and category spikes against prior windows", () => {
    const baselineWindows = [0, 1, 2, 3].map((index) => ({
      from: `2026-0${index + 1}-01`,
      to: `2026-0${index + 1}-28`,
      transactions: [
        {
          id: `food-${index}-a`,
          date: `2026-0${index + 1}-05`,
          description: "Grocer",
          categoryName: "Food",
          amountMinor: -1_000,
        },
        {
          id: `food-${index}-b`,
          date: `2026-0${index + 1}-12`,
          description: "Grocer",
          categoryName: "Food",
          amountMinor: -1_100,
        },
      ],
    }));
    const result = detectSpendingAnomalies(
      [
        {
          id: "large",
          date: "2026-05-10",
          description: "Grocer",
          categoryName: "Food",
          amountMinor: -10_000,
        },
      ],
      baselineWindows,
    );

    expect(result.status).toBe("reliable");
    expect(result.unusualTransactions).toHaveLength(1);
    expect(result.categorySpikes).toHaveLength(1);
  });

  it("returns an insufficient result instead of guessing with thin history", () => {
    const result = detectSpendingAnomalies([], []);
    expect(result.status).toBe("insufficient");
    expect(result.limitations.length).toBeGreaterThan(0);
  });
});
