/**
 * Centavo-exact 50/30/20 allocation.
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
type Bucket = (typeof BUCKET_ORDER)[number];

export const DEFAULT_PERCENTAGES: BudgetRulePercentages = {
  needs: 50,
  wants: 30,
  savings: 20,
};

export function allocateBudget(
  incomeMinor: number,
  percentages: BudgetRulePercentages = DEFAULT_PERCENTAGES,
): BudgetAllocation {
  if (!Number.isSafeInteger(incomeMinor) || incomeMinor < 0) {
    throw new RangeError("Income must be a non-negative integer in centavos.");
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
      b.remainder - a.remainder ||
      BUCKET_ORDER.indexOf(a.bucket) - BUCKET_ORDER.indexOf(b.bucket),
  );

  for (const entry of byLargestRemainder) {
    if (leftover <= 0) break;
    entry.value += 1;
    leftover -= 1;
  }

  const allocated = {} as Record<Bucket, number>;
  for (const entry of entries) {
    allocated[entry.bucket] = entry.value;
  }

  return {
    ...allocated,
    total: allocated.needs + allocated.wants + allocated.savings,
  };
}
