import {
  billingIntervals,
  billingPlanKeys,
  GOOGLE_PLAY_BASE_PLAN_IDS,
  GOOGLE_PLAY_PRODUCT_IDS,
  googlePlayPlan,
  type BillingCheckoutProvider,
  type BillingInterval,
  type BillingPlanKey,
  type BillingProvider,
} from "@zoption/shared";

import { HttpError } from "../errors";
import type { Bindings } from "../types";

type PlanIdVariable = {
  [Key in keyof Bindings]-?: Bindings[Key] extends string | undefined ? Key : never;
}[keyof Bindings];

/** The Worker variable holding each PayPal plan id and Dodo product id. */
const PLAN_ID_VARIABLES: Record<
  BillingCheckoutProvider,
  Record<BillingPlanKey, Record<BillingInterval, PlanIdVariable>>
> = {
  paypal: {
    budget: { month: "PAYPAL_BUDGET_MONTHLY_PLAN_ID", year: "PAYPAL_BUDGET_ANNUAL_PLAN_ID" },
    pro: { month: "PAYPAL_PRO_MONTHLY_PLAN_ID", year: "PAYPAL_PRO_ANNUAL_PLAN_ID" },
    family_budget: {
      month: "PAYPAL_FAMILY_BUDGET_MONTHLY_PLAN_ID",
      year: "PAYPAL_FAMILY_BUDGET_ANNUAL_PLAN_ID",
    },
    family_pro: {
      month: "PAYPAL_FAMILY_PRO_MONTHLY_PLAN_ID",
      year: "PAYPAL_FAMILY_PRO_ANNUAL_PLAN_ID",
    },
  },
  dodo: {
    budget: { month: "DODO_BUDGET_MONTHLY_PRODUCT_ID", year: "DODO_BUDGET_ANNUAL_PRODUCT_ID" },
    pro: { month: "DODO_PRO_MONTHLY_PRODUCT_ID", year: "DODO_PRO_ANNUAL_PRODUCT_ID" },
    family_budget: {
      month: "DODO_FAMILY_BUDGET_MONTHLY_PRODUCT_ID",
      year: "DODO_FAMILY_BUDGET_ANNUAL_PRODUCT_ID",
    },
    family_pro: {
      month: "DODO_FAMILY_PRO_MONTHLY_PRODUCT_ID",
      year: "DODO_FAMILY_PRO_ANNUAL_PRODUCT_ID",
    },
  },
};

const PLAN_ID_PREFIX: Record<BillingCheckoutProvider, string> = { paypal: "P-", dodo: "pdt_" };

/** A Play subscription row's plan id: `<product id>:<base plan id>`, fixed in `@zoption/shared`. */
export function googlePlayPlanId(plan: BillingPlanKey, interval: BillingInterval): string {
  return `${GOOGLE_PLAY_PRODUCT_IDS[plan]}:${GOOGLE_PLAY_BASE_PLAN_IDS[interval]}`;
}

export function configuredPlanId(
  env: Bindings,
  provider: BillingProvider,
  plan: BillingPlanKey,
  interval: BillingInterval,
): string {
  if (provider === "google_play") return googlePlayPlanId(plan, interval);
  const value = env[PLAN_ID_VARIABLES[provider][plan][interval]];
  if (typeof value !== "string" || !value.startsWith(PLAN_ID_PREFIX[provider])) {
    throw new HttpError(503, "billing_not_configured", "Billing is not configured yet.");
  }
  return value;
}

/** The plan and interval a provider plan id sells, or null when it is not one of ours. */
export function configuredPlan(
  env: Bindings,
  provider: BillingProvider,
  providerPlanId: string,
): { plan: BillingPlanKey; interval: BillingInterval } | null {
  if (provider === "google_play") {
    const [productId = "", basePlanId = "", ...rest] = providerPlanId.split(":");
    return rest.length === 0 ? googlePlayPlan(productId, basePlanId) : null;
  }
  for (const plan of billingPlanKeys) {
    for (const interval of billingIntervals) {
      const value = env[PLAN_ID_VARIABLES[provider][plan][interval]];
      if (typeof value === "string" && value === providerPlanId) return { plan, interval };
    }
  }
  return null;
}
