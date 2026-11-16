import { CANCELLATION_GUIDES } from "./cancellationGuides";
import {
  addToCurrencyTotal,
  type Currency,
  type CurrencyTotals,
  type SubscriptionBillingCycle,
  type SubscriptionStatus,
} from "./types";

export function monthlySubscriptionCost(
  amountMinor: number,
  billingCycle: SubscriptionBillingCycle,
): number {
  return billingCycle === "monthly" ? amountMinor : Math.round(amountMinor / 12);
}

/** Active plans' monthly cost per billing currency. Plans in different currencies never add up. */
export function activeMonthlyCostByCurrency(
  subscriptions: readonly {
    status: SubscriptionStatus;
    currency: Currency;
    amountMinor: number;
    billingCycle: SubscriptionBillingCycle;
  }[],
): CurrencyTotals {
  const totals: CurrencyTotals = {};
  for (const subscription of subscriptions) {
    if (subscription.status !== "active") continue;
    addToCurrencyTotal(
      totals,
      subscription.currency,
      monthlySubscriptionCost(subscription.amountMinor, subscription.billingCycle),
    );
  }
  return totals;
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

// Services people use rather than just pay for: the streaming, software, and gaming entries of
// the cancellation guide catalog, plus gyms. Utilities, rent, phone plans, and payment channels
// stay out, so they never get a "Used it" button unless someone turns it on.
const USAGE_TRACKED_GUIDE_CATEGORIES = new Set(["streaming", "software", "gaming"]);
const USAGE_TRACKED_KEYWORDS = [
  ...CANCELLATION_GUIDES.filter((guide) =>
    USAGE_TRACKED_GUIDE_CATEGORIES.has(guide.category),
  ).flatMap((guide) => guide.aliases),
  "gym",
  "fitness",
];

/**
 * Whether a subscription starts with usage tracking on, before anyone flips its switch. Matches
 * whole words of the name, so "Electric bill" or "Monthly rent" never match a service.
 */
export function isUsageTrackedByDefault(subscriptionName: string): boolean {
  const name = ` ${subscriptionName
    .toLowerCase()
    .replace(/[^a-z0-9+]+/g, " ")
    .trim()} `;
  return USAGE_TRACKED_KEYWORDS.some((keyword) => name.includes(` ${keyword} `));
}

/** The person's own choice wins; without one, the default by name. */
export function isSubscriptionUsageTracked(
  subscriptionName: string,
  explicit: boolean | undefined,
): boolean {
  return explicit ?? isUsageTrackedByDefault(subscriptionName);
}

/** No check-in for this many days makes a tracked subscription idle. */
export const SUBSCRIPTION_IDLE_DAYS = 30;
/** How many days before a renewal the idle nudge goes out. */
export const SUBSCRIPTION_NUDGE_LEAD_DAYS = 3;
/** How far back the usage log is read: one yearly cycle, plus a day for a leap year. */
export const SUBSCRIPTION_USAGE_WINDOW_DAYS = 366;

const DAY_MS = 24 * 60 * 60 * 1000;

function dayNumber(isoDate: string): number {
  return Math.floor(Date.parse(`${isoDate}T00:00:00Z`) / DAY_MS);
}

/** `isoDate` moved by `days` (negative goes back). */
export function addDaysToIsoDate(isoDate: string, days: number): string {
  return new Date((dayNumber(isoDate) + days) * DAY_MS).toISOString().slice(0, 10);
}

/**
 * The billing date one cycle before `nextBillingDate`, which starts the cycle being paid for now.
 * Clamped to the month's last day like `nextSubscriptionBillingDate`.
 */
export function previousSubscriptionBillingDate(
  nextBillingDate: string,
  billingCycle: SubscriptionBillingCycle,
): string {
  const year = Number(nextBillingDate.slice(0, 4));
  const month = Number(nextBillingDate.slice(5, 7));
  const day = Number(nextBillingDate.slice(8, 10));
  const target = new Date(Date.UTC(year, month - 1 - (billingCycle === "monthly" ? 1 : 12), 1));
  const targetYear = target.getUTCFullYear();
  const targetMonth = target.getUTCMonth() + 1;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
  return `${targetYear}-${String(targetMonth).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
}

/**
 * `untracked`: never checked in, so there is nothing to judge. `idle`: tracked, but no check-in
 * for `SUBSCRIPTION_IDLE_DAYS`. `active`: used within that window.
 */
export type SubscriptionUsageStatus = "untracked" | "idle" | "active";

export interface SubscriptionRoi {
  status: SubscriptionUsageStatus;
  usedToday: boolean;
  lastUsedOn: string | null;
  daysSinceLastUse: number | null;
  /** Check-ins since the current cycle began (the previous billing date). */
  usesThisCycle: number;
  /** The cycle's charge spread over its check-ins; null before the first one. */
  costPerUseMinor: number | null;
  /** Consecutive weeks (Monday start) with a check-in, ending this week or last. */
  weekStreak: number;
}

/**
 * How much a subscription is being used for what it costs. `usedOn` holds one ISO date per
 * check-in day, in any order; dates after `today` are ignored.
 */
export function subscriptionRoi(
  subscription: {
    amountMinor: number;
    billingCycle: SubscriptionBillingCycle;
    nextBillingDate: string;
  },
  usedOn: readonly string[],
  today: string,
): SubscriptionRoi {
  const days = [...new Set(usedOn)].filter((date) => date <= today).sort();
  const lastUsedOn = days.at(-1) ?? null;
  const daysSinceLastUse = lastUsedOn === null ? null : dayNumber(today) - dayNumber(lastUsedOn);
  // A billing date already passed (the renewal sweep has not rolled it yet) began the cycle.
  const cycleStart =
    subscription.nextBillingDate > today
      ? previousSubscriptionBillingDate(subscription.nextBillingDate, subscription.billingCycle)
      : latestDueSubscriptionBillingDate(
          subscription.nextBillingDate,
          subscription.billingCycle,
          today,
        );
  const usesThisCycle = days.filter((date) => date >= cycleStart).length;
  const status: SubscriptionUsageStatus =
    daysSinceLastUse === null
      ? "untracked"
      : daysSinceLastUse >= SUBSCRIPTION_IDLE_DAYS
        ? "idle"
        : "active";
  return {
    status,
    usedToday: lastUsedOn === today,
    lastUsedOn,
    daysSinceLastUse,
    usesThisCycle,
    // Integer minor units in, integer minor units out.
    costPerUseMinor:
      usesThisCycle > 0 ? Math.round(subscription.amountMinor / usesThisCycle) : null,
    weekStreak: weekStreak(days, today),
  };
}

/** Day 0 of the Unix epoch was a Thursday, so shifting by 3 makes weeks start on Monday. */
function weekNumber(isoDate: string): number {
  return Math.floor((dayNumber(isoDate) + 3) / 7);
}

function weekStreak(sortedDays: readonly string[], today: string): number {
  const weeks = new Set(sortedDays.map(weekNumber));
  // This week still counts as unbroken until it ends, so the streak may end last week.
  let week = weekNumber(today);
  if (!weeks.has(week)) week -= 1;
  let streak = 0;
  while (weeks.has(week)) {
    streak += 1;
    week -= 1;
  }
  return streak;
}
