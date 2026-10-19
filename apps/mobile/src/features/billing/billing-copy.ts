import {
  PLAN_NAMES,
  PLAN_PRICES_MINOR,
  TIER_NAMES,
  type BillingInterval,
  type BillingPlanKey,
  type BillingSummary,
  type BillingUsage,
} from "@zoption/shared";

// Plan names and prices shown next to checkout choices. The Worker remains the source of truth
// for what a user can actually purchase; this copy is display-only.

export const INTERVAL_LABELS: Record<BillingInterval, string> = {
  month: "Monthly",
  year: "Yearly",
};

const wholePesos = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  maximumFractionDigits: 0,
});

/** "₱149 / month" or "₱1,490 / year". Plan prices are whole pesos, so the division is exact. */
export function planPriceLabel(plan: BillingPlanKey, interval: BillingInterval): string {
  return wholePesos.format(PLAN_PRICES_MINOR[plan][interval] / 100) + " / " + interval;
}

/** What a personal plan adds, in one line under its name. */
export const PLAN_PITCH: Record<BillingPlanKey, string> = {
  budget:
    "1,000 AI actions a month, live voice, 5 imports a month, 10 custom categories, and every paid feature.",
  pro: "2,000 AI actions a month, 10 imports a month, unlimited custom categories, and priority support.",
  family_budget: "Up to 6 people, each with Zoption Budget, in one shared family space.",
  family_pro: "Up to 6 people, each with Zoption Pro, in one shared family space.",
};

export function planName(summary: BillingSummary | null): string {
  if (summary === null || summary.plan === "free") return "Free plan";
  return TIER_NAMES[summary.plan];
}

export function planStatusCopy(summary: BillingSummary): string | null {
  if (summary.plan === "free") return null;
  if (summary.coveredBy) return "Covered by " + summary.coveredBy.familyName;
  switch (summary.status) {
    case "trialing":
      return "Pro trial";
    case "past_due":
      return "Payment issue";
    case "paused":
      return "Subscription paused";
    case "canceled":
      return "Renewal canceled";
    default:
      return null;
  }
}

export function entitlementCopy(summary: BillingSummary): string | null {
  if (summary.entitlementSource === "sponsored") return "Sponsored Pro";
  if (summary.entitlementSource === "platform_admin") return "Permanent Pro";
  return null;
}

export function periodEndsCopy(summary: BillingSummary): string | null {
  if (summary.coveredBy) {
    return (
      PLAN_NAMES[summary.coveredBy.plan] +
      " gives you " +
      TIER_NAMES[summary.plan] +
      ". The family owner manages the plan."
    );
  }
  if (summary.pendingChange) {
    return (
      "Moves to " +
      PLAN_NAMES[summary.pendingChange.plan] +
      " on " +
      manilaDate(summary.pendingChange.effectiveAt) +
      "."
    );
  }
  if (summary.plan === "free" || summary.currentPeriodEndsAt === null) return null;
  if (summary.status === "trialing") {
    return "Trial ends on " + manilaDate(summary.currentPeriodEndsAt) + ".";
  }
  if (summary.cancelAtPeriodEnd) {
    return (
      "Renewal is off. " +
      TIER_NAMES[summary.plan] +
      " access remains until " +
      manilaDate(summary.currentPeriodEndsAt) +
      "."
    );
  }
  return "Renews on " + manilaDate(summary.currentPeriodEndsAt) + ".";
}

export function usageTitle(usage: BillingUsage): string {
  switch (usage.feature) {
    case "ai_usage":
      return "AI actions this month";
    case "file_import":
      return "Committed imports this month";
    default:
      return "Usage";
  }
}

export function usageResetsCopy(usage: BillingUsage): string | null {
  if (usage.resetsAt === null) return null;
  return "Resets " + manilaDate(usage.resetsAt) + ".";
}

export function allowanceCopy(allowance: {
  resource: string;
  used: number;
  limit: number | null;
}): string {
  switch (allowance.resource) {
    case "custom_category":
      return allowance.limit === null
        ? allowance.used + " active custom categories (unlimited)"
        : allowance.used + " of " + allowance.limit + " custom categories";
    default:
      return allowance.used + " used";
  }
}

export function manilaDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, {
    timeZone: "Asia/Manila",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function pendingCheckoutCopy(summary: BillingSummary): string | null {
  if (summary.pendingCheckout === null) return null;
  return (
    "A " +
    PLAN_NAMES[summary.pendingCheckout.plan] +
    " checkout is awaiting payment approval. If you already approved it, check payment status."
  );
}
