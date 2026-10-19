import {
  PLAN_PRICES_MINOR,
  TIER_LIMITS,
  type BillingInterval,
  type BillingPlanKey,
  type BillingTier,
  type TierLimits,
} from "@zoption/shared";

import { formatMoney } from "../../lib/formatters";

function aiActions({ monthly }: TierLimits): string {
  return `${monthly.ai_usage.toLocaleString("en-PH")} per month, shared across every AI feature`;
}

function imports({ monthly }: TierLimits): string {
  const count = monthly.file_import;
  return `${count} committed import${count === 1 ? "" : "s"} per month`;
}

function categories({ customCategories }: TierLimits): string {
  return customCategories === null
    ? "Unlimited active custom categories"
    : `${customCategories} active custom categories, plus included starters`;
}

const free = TIER_LIMITS.free;
const budget = TIER_LIMITS.zoption_budget;
const pro = TIER_LIMITS.zoption_pro;

/** One row per feature with what each tier gets, read by the comparison table and plan cards. */
export const planFeatures: ReadonlyArray<{ feature: string } & Record<BillingTier, string>> = [
  {
    feature: "AI actions",
    free: aiActions(free),
    zoption_budget: aiActions(budget),
    zoption_pro: aiActions(pro),
  },
  {
    feature: "Live voice chat",
    free: "Not included",
    zoption_budget: "Included",
    zoption_pro: "Included",
  },
  {
    feature: "File imports",
    free: imports(free),
    zoption_budget: imports(budget),
    zoption_pro: imports(pro),
  },
  {
    feature: "Custom categories",
    free: categories(free),
    zoption_budget: categories(budget),
    zoption_pro: categories(pro),
  },
  {
    feature: "Savings interest",
    free: "Manual entry",
    zoption_budget: "Automatic interest on savings accounts",
    zoption_pro: "Automatic interest on savings accounts",
  },
  {
    feature: "Cashflow analytics",
    free: "Weekly cashflow view",
    zoption_budget: "Adds monthly and six-month cashflow views",
    zoption_pro: "Adds monthly and six-month cashflow views",
  },
  {
    feature: "Transaction export",
    free: "Not included",
    zoption_budget: "Filtered CSV export",
    zoption_pro: "Filtered CSV export",
  },
  {
    feature: "Renewal calendar",
    free: "Basic list",
    zoption_budget: "Interactive monthly grid",
    zoption_pro: "Interactive monthly grid",
  },
  {
    feature: "Streak pet",
    free: "Grows to Baby",
    zoption_budget: "Grows to Juvenile, Adult, and Legend",
    zoption_pro: "Grows to Juvenile, Adult, and Legend",
  },
  {
    feature: "Support",
    free: "Help center and AI support assistant",
    zoption_budget: "Direct support, replies within 48 hours",
    zoption_pro: "Priority support, replies within 24 hours",
  },
];

/** "₱149" or "₱1,490": whole pesos, because every plan price is. */
export function planPrice(plan: BillingPlanKey, interval: BillingInterval): string {
  return formatMoney(PLAN_PRICES_MINOR[plan][interval], "PHP");
}

export function planPriceLabel(plan: BillingPlanKey, interval: BillingInterval): string {
  return `${planPrice(plan, interval)}/${interval === "month" ? "month" : "year"}`;
}

/** Yearly costs ten months, so the saving is the same for every plan. */
export const YEARLY_SAVING_LABEL = "2 months free";

export const paymentDisclosure =
  "Prices are charged in Philippine pesos. PayPal or Dodo Payments securely handles card details and subscription approval; available payment methods can vary by customer. Taxes if applicable may apply.";
