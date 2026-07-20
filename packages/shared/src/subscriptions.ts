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
