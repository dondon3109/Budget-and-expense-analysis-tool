// Billing enums and the billing summary contract: providers, intervals, metered features, and
// what a workspace's plan looks like to the web app and the phone. Plan prices and limits live in
// `plans.ts`.

import type { BillingPlanKey, BillingTier, FamilyBillingPlan, PersonalBillingPlan } from "./plans";

export const billingIntervals = ["month", "year"] as const;
export type BillingInterval = (typeof billingIntervals)[number];

/** Where a subscription is paid. `google_play` is bought only inside the Play build of the app. */
export const billingProviders = ["paypal", "dodo", "google_play"] as const;
export type BillingProvider = (typeof billingProviders)[number];

/** The providers a web or sideloaded-app checkout can open; Google Play sells only in its app. */
export const billingCheckoutProviders = ["paypal", "dodo"] as const;
export type BillingCheckoutProvider = (typeof billingCheckoutProviders)[number];

export const billingSubscriptionStatuses = [
  "active",
  "trialing",
  "past_due",
  "paused",
  "canceled",
] as const;
export type BillingSubscriptionStatus = (typeof billingSubscriptionStatuses)[number];

/** Metered monthly allowances. `ai_usage` is the single pool every billable AI request draws on. */
export const billingFeatures = ["ai_usage", "file_import"] as const;
export type BillingFeature = (typeof billingFeatures)[number];
export type BillingResource = "custom_category";
export type BillingCapability =
  | BillingFeature
  | "category_management"
  | "account_interest"
  | "cashflow_analytics"
  | "transaction_export";

export const billingUsagePeriodKinds = ["calendar_month"] as const;
export type BillingUsagePeriodKind = (typeof billingUsagePeriodKinds)[number];

export interface BillingUsage {
  feature: BillingFeature;
  used: number;
  limit: number;
  periodKind: BillingUsagePeriodKind;
  periodStartedAt: string | null;
  resetsAt: string | null;
}

export interface BillingResourceAllowance {
  resource: BillingResource;
  used: number;
  limit: number | null;
}

/** Where a paid tier comes from. `family` is a family plan covering one of its members. */
export const proEntitlementSources = [
  "paypal",
  "dodo",
  "google_play",
  "platform_admin",
  "sponsored",
  "family",
] as const;
export type ProEntitlementSource = (typeof proEntitlementSources)[number];

export type SponsoredProSeatState = "pending" | "active";

export interface SponsoredProSeat {
  slotNumber: number;
  state: SponsoredProSeatState;
  beneficiaryUserId: string | null;
  invitedAt: string | null;
  assignedAt: string | null;
  canResendInvitation: boolean;
}

export interface SponsoredProSeatSummary {
  capacity: 5;
  activeCount: number;
  pendingCount: number;
  availableCount: number;
  seats: SponsoredProSeat[];
}

export interface BillingPendingCheckout {
  provider: BillingCheckoutProvider;
  plan: BillingPlanKey;
  interval: BillingInterval;
  createdAt: string;
  expiresAt: string;
}

/** A downgrade that takes effect when the paid period ends. */
export interface BillingPendingChange {
  plan: BillingPlanKey;
  interval: BillingInterval;
  effectiveAt: string;
}

export interface BillingSummary {
  /** The tier in effect: the best of the person's own plan, a family plan, a grant, or a trial. */
  plan: BillingTier;
  entitlementSource: ProEntitlementSource | null;
  /** The personal plan being paid for, if any. */
  subscriptionPlan: PersonalBillingPlan | null;
  provider: BillingProvider | null;
  status: BillingSubscriptionStatus | null;
  interval: BillingInterval | null;
  currentPeriodEndsAt: string | null;
  scheduledChangeAt: string | null;
  cancelAtPeriodEnd: boolean;
  pendingChange: BillingPendingChange | null;
  pendingCheckout: BillingPendingCheckout | null;
  /** The family whose plan covers this person, when that is where their tier comes from. */
  coveredBy: { familyId: string; familyName: string; plan: FamilyBillingPlan } | null;
  canCheckout: boolean;
  canChangePlan: boolean;
  canManageBilling: boolean;
  canManageSponsoredSeats: boolean;
  nonTerminalSubscriptionCount: number;
  usages: BillingUsage[];
  allowances: BillingResourceAllowance[];
}

export type BillingCheckoutReconciliationOutcome =
  "confirmed" | "pending" | "review_required" | "closed" | "none";

export interface BillingCheckoutReconciliation {
  outcome: BillingCheckoutReconciliationOutcome;
  summary: BillingSummary;
}

/**
 * Google Play sells each plan as one subscription product with a monthly and a yearly base plan.
 * These ids are created once in Play Console (Monetize > Subscriptions) and can never be reused,
 * so they are fixed here rather than configured. The app buys with them; the API maps a verified
 * purchase back to a plan with `googlePlayPlan`.
 */
export const GOOGLE_PLAY_PRODUCT_IDS = {
  budget: "zoption_budget",
  pro: "zoption_pro",
  family_budget: "zoption_family_budget",
  family_pro: "zoption_family_pro",
} as const satisfies Record<BillingPlanKey, string>;

export const GOOGLE_PLAY_BASE_PLAN_IDS = {
  month: "monthly",
  year: "yearly",
} as const satisfies Record<BillingInterval, string>;

/** The plan and interval a Play product and base plan sell, or null when they are not ours. */
export function googlePlayPlan(
  productId: string,
  basePlanId: string,
): { plan: BillingPlanKey; interval: BillingInterval } | null {
  const plan = (Object.keys(GOOGLE_PLAY_PRODUCT_IDS) as BillingPlanKey[]).find(
    (key) => GOOGLE_PLAY_PRODUCT_IDS[key] === productId,
  );
  const interval = billingIntervals.find((key) => GOOGLE_PLAY_BASE_PLAN_IDS[key] === basePlanId);
  return plan && interval ? { plan, interval } : null;
}
