import type { SubscriptionBillingCycle } from "./types";

export function monthlySubscriptionCost(
  amountMinor: number,
  billingCycle: SubscriptionBillingCycle,
): number {
  return billingCycle === "monthly" ? amountMinor : Math.round(amountMinor / 12);
}

export function subscriptionBillingDateForMonth(
  nextBillingDate: string,
  billingCycle: SubscriptionBillingCycle,
  monthStart: string,
): string | null {
  const targetYear = Number(monthStart.slice(0, 4));
  const targetMonth = Number(monthStart.slice(5, 7));
  const anchorMonth = Number(nextBillingDate.slice(5, 7));
  const anchorDay = Number(nextBillingDate.slice(8, 10));

  if (billingCycle === "yearly" && anchorMonth !== targetMonth) return null;

  const lastDay = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
  const day = Math.min(anchorDay, lastDay);
  return `${targetYear}-${String(targetMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * The billing date one cycle after `nextBillingDate`. The renewals sweep uses it to roll a
 * subscription forward after each charge, and like the month projection it clamps the day to
 * the final calendar day.
 *
 * The clamp is permanent by design. A plan billed on the 31st rolls to the 28th in February
 * and stays on the 28th afterwards, because the sweep persists this date and the next step
 * reads it back. Do not turn this into a jump forward to the 31st: a shorter month removing
 * the day is expected, and reclaiming it later would move a billing date a subscriber already
 * saw, for no gain.
 */
export function nextSubscriptionBillingDate(
  nextBillingDate: string,
  billingCycle: SubscriptionBillingCycle,
): string {
  const year = Number(nextBillingDate.slice(0, 4));
  const month = Number(nextBillingDate.slice(5, 7));
  const day = Number(nextBillingDate.slice(8, 10));
  const target = new Date(Date.UTC(year, month - 1 + (billingCycle === "monthly" ? 1 : 12), 1));
  const targetYear = target.getUTCFullYear();
  const targetMonth = target.getUTCMonth() + 1;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
  const billingDay = Math.min(day, lastDay);
  return `${targetYear}-${String(targetMonth).padStart(2, "0")}-${String(billingDay).padStart(2, "0")}`;
}

/**
 * The most recent billing date on or before `today`, stepping forward from `nextBillingDate`.
 * Reactivating a canceled subscription starts from here, so the cycles that passed while it was
 * canceled are skipped and only the one already due is charged. A future date is returned as is.
 */
export function latestDueSubscriptionBillingDate(
  nextBillingDate: string,
  billingCycle: SubscriptionBillingCycle,
  today: string,
): string {
  let due = nextBillingDate;
  for (;;) {
    const following = nextSubscriptionBillingDate(due, billingCycle);
    if (following > today) return due;
    due = following;
  }
}
