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
 * the final calendar day so a subscription billed on the 31st lands on the 28th in February.
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
