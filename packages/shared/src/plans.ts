// The paid plan catalog: which tier each plan grants, what each tier allows, and what each plan
// costs. The Worker enforces these limits; the web app, the phone, and the pricing page read the
// same numbers so a price or limit changes in one place.

import type { BillingFeature, BillingInterval } from "./billing";

/** What a workspace or person is entitled to. Also the plan name the billing summary reports. */
export const billingTiers = ["free", "zoption_budget", "zoption_pro"] as const;
export type BillingTier = (typeof billingTiers)[number];

/** A plan someone can buy. Family plans cover a family and give each member the matching tier. */
export const billingPlanKeys = ["budget", "pro", "family_budget", "family_pro"] as const;
export type BillingPlanKey = (typeof billingPlanKeys)[number];

export const personalBillingPlans = ["budget", "pro"] as const;
export type PersonalBillingPlan = (typeof personalBillingPlans)[number];

export const familyBillingPlans = ["family_budget", "family_pro"] as const;
export type FamilyBillingPlan = (typeof familyBillingPlans)[number];

/**
 * A family is `unpaid` until its first plan (owner only, Free limits, no invitations), `active`
 * while a plan covers it, and `lapsed` once that ends (read only for everyone).
 */
export const familyPlanStates = ["unpaid", "active", "lapsed"] as const;
export type FamilyPlanState = (typeof familyPlanStates)[number];

export const PLAN_TIER: Record<BillingPlanKey, BillingTier> = {
  budget: "zoption_budget",
  pro: "zoption_pro",
  family_budget: "zoption_budget",
  family_pro: "zoption_pro",
};

export const PLAN_NAMES: Record<BillingPlanKey, string> = {
  budget: "Zoption Budget",
  pro: "Zoption Pro",
  family_budget: "Family Budget",
  family_pro: "Family Pro",
};

export const TIER_NAMES: Record<BillingTier, string> = {
  free: "Free",
  zoption_budget: "Zoption Budget",
  zoption_pro: "Zoption Pro",
};

/** Prices in centavos. A year costs ten months. */
export const PLAN_PRICES_MINOR: Record<BillingPlanKey, Record<BillingInterval, number>> = {
  budget: { month: 14_900, year: 149_000 },
  pro: { month: 24_900, year: 249_000 },
  family_budget: { month: 49_900, year: 499_000 },
  family_pro: { month: 79_900, year: 799_000 },
};

export interface TierLimits {
  /** Monthly pools, reset on the first of each Manila month. */
  monthly: Record<BillingFeature, number>;
  /** Active custom categories; null is unlimited. */
  customCategories: number | null;
}

export const TIER_LIMITS: Record<BillingTier, TierLimits> = {
  free: { monthly: { ai_usage: 500, file_import: 1 }, customCategories: 4 },
  zoption_budget: { monthly: { ai_usage: 1_000, file_import: 5 }, customCategories: 10 },
  zoption_pro: { monthly: { ai_usage: 2_000, file_import: 10 }, customCategories: null },
};

/** Free 0, Budget 1, Pro 2. Higher always includes everything below it. */
export function tierRank(tier: BillingTier): number {
  return billingTiers.indexOf(tier);
}

export function isPaidTier(tier: BillingTier): boolean {
  return tier !== "free";
}

export function isFamilyPlan(plan: BillingPlanKey): plan is FamilyBillingPlan {
  return plan === "family_budget" || plan === "family_pro";
}

/**
 * Whether moving between two plans of the same kind is an upgrade (applies now) or a downgrade
 * (applies when the paid period ends). A higher tier wins; at the same tier, yearly is the upgrade.
 */
export function planChangeDirection(
  from: { plan: BillingPlanKey; interval: BillingInterval },
  to: { plan: BillingPlanKey; interval: BillingInterval },
): "upgrade" | "downgrade" | "same" {
  const tierDifference = tierRank(PLAN_TIER[to.plan]) - tierRank(PLAN_TIER[from.plan]);
  if (tierDifference > 0) return "upgrade";
  if (tierDifference < 0) return "downgrade";
  if (from.interval === to.interval) return "same";
  return to.interval === "year" ? "upgrade" : "downgrade";
}
