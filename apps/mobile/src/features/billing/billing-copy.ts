import type { BillingSummary, BillingUsage } from "@zoption/shared";

// Plan pricing shown next to checkout choices. The Worker remains the source
// of truth for what a user can actually purchase; this copy is display-only.
export const PLAN_PRICES: { interval: "month" | "year"; label: string; priceLabel: string }[] = [
  { interval: "month", label: "Monthly", priceLabel: "₱149 / month" },
  { interval: "year", label: "Yearly", priceLabel: "₱1,299 / year" },
];

export function planName(summary: BillingSummary | null): string {
  if (summary === null) return "Free plan";
  if (summary.plan === "zoption_pro") return "Zoption Pro";
  return "Free plan";
}

export function planStatusCopy(summary: BillingSummary): string | null {
  if (summary.plan !== "zoption_pro") return null;
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
  if (summary.plan !== "zoption_pro" || summary.currentPeriodEndsAt === null) return null;
  if (summary.cancelAtPeriodEnd) {
    return "Renewal is off. Pro access remains until " + manilaDate(summary.currentPeriodEndsAt) + ".";
  }
  return "Renews on " + manilaDate(summary.currentPeriodEndsAt) + ".";
}

export function usageTitle(usage: BillingUsage): string {
  switch (usage.feature) {
    case "assistant_question":
      return usage.periodKind === "anchored_14_day"
        ? "AI questions this 14-day cycle"
        : "AI questions this month";
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

export function allowanceCopy(
  allowance: { resource: string; used: number; limit: number | null },
): string {
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
    summary.pendingCheckout.interval +
    " checkout is awaiting payment approval. If you already approved it, check payment status."
  );
}
