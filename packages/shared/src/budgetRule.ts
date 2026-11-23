import type { Currency, CurrencyTotals } from "./currencies";

/**
 * Minor-unit exact 50/30/20 allocation, shared by the public calculator and the signed-in app.
 *
 * Money is integer minor units (centavos) end to end, which is what makes the three
 * buckets sum to the income *exactly*. Naive percentage arithmetic rounds each bucket
 * independently and leaks or invents a centavo or two, which is precisely the error a
 * budgeting tool must not make.
 *
 * Leftover centavos are handed out by the largest-remainder method, so the bucket that
 * lost the most to flooring gets the extra centavo first. Ties break in a fixed order
 * (needs, wants, savings) to keep the result deterministic.
 */

export type BudgetRulePercentages = {
  needs: number;
  wants: number;
  savings: number;
};

export type BudgetAllocation = BudgetRulePercentages & {
  /** Total actually distributed. Always exactly equal to the income passed in. */
  total: number;
};

const BUCKET_ORDER = ["needs", "wants", "savings"] as const;
export type BudgetRuleBucket = (typeof BUCKET_ORDER)[number];

export const DEFAULT_BUDGET_RULE_PERCENTAGES: BudgetRulePercentages = {
  needs: 50,
  wants: 30,
  savings: 20,
};

export interface BudgetCategoryLimitAllocation {
  categoryId: string;
  limitMinor: number;
  bucket: BudgetRuleBucket;
}

/** Reads the balance to split from an account in its own native currency (integer minor units). */
export function accountSplitBalance(account: {
  currency: Currency;
  balanceMinor: number | null;
  balancesByCurrency?: CurrencyTotals;
}): { balanceMinor: number; currency: Currency } {
  const nativeBalance = account.balancesByCurrency?.[account.currency];
  return {
    balanceMinor: nativeBalance ?? account.balanceMinor ?? 0,
    currency: account.currency,
  };
}

/**
 * Distributes each bucket's allocated amount evenly across the expense categories assigned to it,
 * using exact integer minor units so the category limits sum to the bucket total to the centavo.
 * Unassigned buckets and categories are skipped; if an id appears in more than one bucket, the
 * first bucket in needs/wants/savings order wins.
 */
export function distributeBucketLimits(
  allocation: BudgetAllocation,
  assignments: Record<BudgetRuleBucket, readonly string[]>,
): BudgetCategoryLimitAllocation[] {
  const seen = new Set<string>();
  const result: BudgetCategoryLimitAllocation[] = [];

  for (const bucket of BUCKET_ORDER) {
    const categoryIds: string[] = [];
    for (const id of assignments[bucket]) {
      if (!id || seen.has(id)) continue;
      seen.add(id);
      categoryIds.push(id);
    }
    if (categoryIds.length === 0) continue;

    const bucketTotal = allocation[bucket];
    if (!Number.isSafeInteger(bucketTotal) || bucketTotal < 0) {
      throw new RangeError("Bucket total must be a non-negative integer in minor units.");
    }
    const base = Math.floor(bucketTotal / categoryIds.length);
    const remainder = bucketTotal % categoryIds.length;

    categoryIds.forEach((categoryId, index) => {
      result.push({
        categoryId,
        limitMinor: base + (index < remainder ? 1 : 0),
        bucket,
      });
    });
  }

  return result;
}

export function allocateBudget(
  incomeMinor: number,
  percentages: BudgetRulePercentages = DEFAULT_BUDGET_RULE_PERCENTAGES,
): BudgetAllocation {
  if (!Number.isSafeInteger(incomeMinor) || incomeMinor < 0) {
    throw new RangeError("Income must be a non-negative integer in minor units.");
  }

  const values = BUCKET_ORDER.map((bucket) => percentages[bucket]);
  if (values.some((value) => !Number.isInteger(value) || value < 0)) {
    throw new RangeError("Percentages must be non-negative integers.");
  }

  const percentageTotal = values.reduce((sum, value) => sum + value, 0);
  if (percentageTotal !== 100) {
    throw new RangeError(`Percentages must sum to 100, received ${percentageTotal}.`);
  }

  // Scale by 100 before dividing so no floating point is involved at any point.
  const entries = BUCKET_ORDER.map((bucket) => {
    const scaled = incomeMinor * percentages[bucket];
    return {
      bucket,
      value: Math.floor(scaled / 100),
      remainder: scaled % 100,
    };
  });

  let leftover = incomeMinor - entries.reduce((sum, entry) => sum + entry.value, 0);
  const byLargestRemainder = [...entries].sort(
    (a, b) =>
      b.remainder - a.remainder || BUCKET_ORDER.indexOf(a.bucket) - BUCKET_ORDER.indexOf(b.bucket),
  );

  for (const entry of byLargestRemainder) {
    if (leftover <= 0) break;
    entry.value += 1;
    leftover -= 1;
  }

  const allocated = {} as Record<BudgetRuleBucket, number>;
  for (const entry of entries) {
    allocated[entry.bucket] = entry.value;
  }

  return {
    ...allocated,
    total: allocated.needs + allocated.wants + allocated.savings,
  };
}
