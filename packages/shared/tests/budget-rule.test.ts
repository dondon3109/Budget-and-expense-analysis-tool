import { describe, expect, it } from "vitest";

import {
  accountSplitBalance,
  allocateBudget,
  DEFAULT_BUDGET_RULE_PERCENTAGES,
  distributeBucketLimits,
} from "../src/budgetRule";

describe("allocateBudget", () => {
  it("splits a clean amount into the standard buckets", () => {
    expect(allocateBudget(3_000_000)).toEqual({
      needs: 1_500_000,
      wants: 900_000,
      savings: 600_000,
      total: 3_000_000,
    });
  });

  it("never loses or invents a centavo, for every amount up to one peso step", () => {
    // The whole point of centavo arithmetic: naive per-bucket rounding leaks a centavo
    // or two, so the three buckets would not reconcile with the income.
    //
    // Collect offenders and assert once. Calling expect() 200,000 times inside the loop
    // made this the slowest test in the suite by two orders of magnitude, and it timed out
    // under CPU contention. This keeps the same coverage, names the failing amounts, and
    // runs in a few milliseconds.
    const offenders: number[] = [];
    for (let minor = 0; minor <= 100_000; minor += 1) {
      const result = allocateBudget(minor);
      if (result.needs + result.wants + result.savings !== minor || result.total !== minor) {
        offenders.push(minor);
        if (offenders.length === 5) break;
      }
    }
    expect(offenders).toEqual([]);
  });

  it("gives leftover centavos to the buckets that lost the most to flooring", () => {
    // 0.01 splits as 50%=0.005, 30%=0.003, 20%=0.002, so all three floor to 0 and the
    // single centavo goes to needs, which lost the largest fraction.
    expect(allocateBudget(1)).toEqual({
      needs: 1,
      wants: 0,
      savings: 0,
      total: 1,
    });
  });

  it("honours custom percentages", () => {
    const result = allocateBudget(1_000_00, { needs: 70, wants: 20, savings: 10 });
    expect(result).toEqual({ needs: 700_00, wants: 200_00, savings: 100_00, total: 1_000_00 });
  });

  it("rejects percentages that do not sum to 100", () => {
    expect(() => allocateBudget(1000, { needs: 50, wants: 30, savings: 19 })).toThrow(/sum to 100/);
  });

  it("rejects non-integer or negative input", () => {
    expect(() => allocateBudget(-1)).toThrow(RangeError);
    expect(() => allocateBudget(1.5)).toThrow(RangeError);
    expect(() => allocateBudget(1000, { needs: -10, wants: 60, savings: 50 })).toThrow(RangeError);
  });

  it("leaves the shared defaults at 50/30/20", () => {
    expect(DEFAULT_BUDGET_RULE_PERCENTAGES).toEqual({ needs: 50, wants: 30, savings: 20 });
  });
});

describe("accountSplitBalance", () => {
  it("prefers the native currency entry from balancesByCurrency", () => {
    expect(
      accountSplitBalance({
        currency: "USD",
        balanceMinor: 100_00,
        balancesByCurrency: { PHP: 500_000, USD: 250_00 },
      }),
    ).toEqual({ balanceMinor: 250_00, currency: "USD" });
  });

  it("falls back to balanceMinor and then zero when balancesByCurrency lacks the currency", () => {
    expect(accountSplitBalance({ currency: "PHP", balanceMinor: 42_50 })).toEqual({
      balanceMinor: 42_50,
      currency: "PHP",
    });
    expect(accountSplitBalance({ currency: "PHP", balanceMinor: null })).toEqual({
      balanceMinor: 0,
      currency: "PHP",
    });
  });
});

describe("distributeBucketLimits", () => {
  it("splits each bucket evenly in exact minor units without losing leftover centavos", () => {
    const allocation = allocateBudget(10_000); // needs 5000, wants 3000, savings 2000
    const limits = distributeBucketLimits(allocation, {
      needs: ["housing", "food", "utilities"], // 5000 / 3 = 1667, 1667, 1666
      wants: ["leisure"],
      savings: [],
    });

    expect(limits).toEqual([
      { categoryId: "housing", limitMinor: 1667, bucket: "needs" },
      { categoryId: "food", limitMinor: 1667, bucket: "needs" },
      { categoryId: "utilities", limitMinor: 1666, bucket: "needs" },
      { categoryId: "leisure", limitMinor: 3000, bucket: "wants" },
    ]);
    const needsSum = limits
      .filter((item) => item.bucket === "needs")
      .reduce((sum, item) => sum + item.limitMinor, 0);
    expect(needsSum).toBe(allocation.needs);
  });

  it("deduplicates category ids across buckets in needs/wants/savings order", () => {
    const allocation = allocateBudget(100_00);
    expect(
      distributeBucketLimits(allocation, {
        needs: ["food", "food"],
        wants: ["food", "leisure"],
        savings: ["debt"],
      }),
    ).toEqual([
      { categoryId: "food", limitMinor: 50_00, bucket: "needs" },
      { categoryId: "leisure", limitMinor: 30_00, bucket: "wants" },
      { categoryId: "debt", limitMinor: 20_00, bucket: "savings" },
    ]);
  });
});
