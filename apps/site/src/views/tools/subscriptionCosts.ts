/**
 * Yearly and monthly subscription totals in whole centavos.
 *
 * Every charge is converted to a yearly amount first, because that is exact for
 * every billing cycle: a weekly charge runs 52 times, a monthly one 12, a
 * quarterly one 4. The monthly figure is that year spread over 12 months,
 * rounded half up to the centavo, so it is labelled an average.
 */

export const BILLING_CYCLES = ["weekly", "monthly", "quarterly", "yearly"] as const;
export type BillingCycle = (typeof BILLING_CYCLES)[number];

export const CHARGES_PER_YEAR: Record<BillingCycle, number> = {
  weekly: 52,
  monthly: 12,
  quarterly: 4,
  yearly: 1,
};

export function isBillingCycle(value: string): value is BillingCycle {
  return BILLING_CYCLES.some((cycle) => cycle === value);
}

export function yearlyCostMinor(amountMinor: number, cycle: BillingCycle): number {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) {
    throw new RangeError("Amount must be a non-negative integer in centavos.");
  }
  return amountMinor * CHARGES_PER_YEAR[cycle];
}

/** A yearly amount as an average month, rounded half up without leaving integers. */
export function averageMonthlyMinor(yearlyMinor: number): number {
  return Math.floor((yearlyMinor + 6) / 12);
}

export type SubscriptionCharge = { amountMinor: number; cycle: BillingCycle };

export function subscriptionTotals(charges: readonly SubscriptionCharge[]): {
  yearlyMinor: number;
  monthlyMinor: number;
} {
  const yearlyMinor = charges.reduce(
    (sum, charge) => sum + yearlyCostMinor(charge.amountMinor, charge.cycle),
    0,
  );
  return { yearlyMinor, monthlyMinor: averageMonthlyMinor(yearlyMinor) };
}
