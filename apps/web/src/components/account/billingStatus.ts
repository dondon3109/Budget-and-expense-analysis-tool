import { PLAN_NAMES, TIER_NAMES, type BillingProvider, type BillingSummary } from "@zoption/shared";

// What Plan and billing says about the person's plan: the status headline, the period line, and
// when a checkout counts as paid.

export function formatPlanDate(value: string): string {
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "Asia/Manila",
  }).format(new Date(value));
}

export function paymentProviderLabel(provider: BillingProvider | null | undefined): string {
  return provider === "dodo" ? "Dodo Payments" : "PayPal";
}

/** A personal plan the provider has confirmed, with no checkout still waiting on it. */
export function isConfirmedPaidSummary(summary: BillingSummary | undefined): boolean {
  return Boolean(
    summary?.subscriptionPlan &&
    (summary.status === "active" || summary.status === "trialing") &&
    summary.pendingCheckout === null,
  );
}

interface StatusFlags {
  paymentPending: boolean;
  paymentReviewRequired: boolean;
  confirmingCancellation: boolean;
  providerLabel: string;
}

export interface StatusCopy {
  label: string;
  heading: string;
  description: string;
  tone: string;
}

export function statusCopy(
  summary: BillingSummary | undefined,
  { paymentPending, paymentReviewRequired, confirmingCancellation, providerLabel }: StatusFlags,
): StatusCopy {
  if (paymentPending) {
    return paymentReviewRequired
      ? {
          label: "Payment review",
          heading: `${providerLabel} confirmation needs more time`,
          description: `No paid access has been granted yet. Zoption will continue checking ${providerLabel} securely, and a second checkout is blocked to prevent duplicate subscriptions.`,
          tone: "warning",
        }
      : {
          label: "Confirming payment",
          heading: "Confirming your payment",
          description: `${providerLabel} is confirming your subscription. Paid access begins only after Zoption receives a verified provider notification.`,
          tone: "pending",
        };
  }

  if (confirmingCancellation) {
    return {
      label: "Confirming cancellation",
      heading: "Confirming your cancellation",
      description: `${providerLabel} has received your cancellation request. Renewal stops after Zoption receives its verified provider notification.`,
      tone: "pending",
    };
  }

  const tier = summary?.plan ?? "free";
  const tierName = TIER_NAMES[tier];

  if (summary?.entitlementSource === "platform_admin") {
    return {
      label: "Permanent Pro",
      heading: "Your permanent complimentary Pro access is active",
      description:
        "Platform administration includes Pro limits and capabilities until trusted operations disable it.",
      tone: "success",
    };
  }
  if (summary?.entitlementSource === "sponsored") {
    return {
      label: "Sponsored Pro",
      heading: "Your sponsored Pro access is active",
      description:
        "Your sponsor currently includes Pro limits and capabilities for this personal workspace.",
      tone: "success",
    };
  }
  if (summary?.coveredBy) {
    return {
      label: tierName,
      heading: `Covered by ${summary.coveredBy.familyName}`,
      description: `${PLAN_NAMES[summary.coveredBy.plan]} gives you ${tierName} limits and features. The family owner manages the plan on the Family page.`,
      tone: "success",
    };
  }

  switch (summary?.status) {
    case "active":
      return {
        label: tierName,
        heading: `${tierName} is active`,
        description: `Your paid access is confirmed. ${tierName} limits and capabilities are available.`,
        tone: "success",
      };
    case "trialing":
      return {
        label: "Pro trial",
        heading: "Your Zoption Pro trial is active",
        // No entitlement source means Zoption's own no-card trial rather than a provider trial.
        description:
          summary.entitlementSource === null
            ? "Your free trial includes Pro access and limits. No card is needed, and you move to the Free plan when it ends unless you choose a plan."
            : "Your trial currently includes Pro access and limits.",
        tone: "success",
      };
    case "past_due":
      return {
        label: "Payment issue",
        heading: "Your payment needs attention",
        description: `${providerLabel} has reported a payment issue. Review your ${providerLabel} subscription to restore confirmed paid access.`,
        tone: "warning",
      };
    case "paused":
      return {
        label: "Subscription paused",
        heading: "Your subscription is paused",
        description: `Paid access is not active while the subscription is paused. Review the subscription in ${providerLabel}.`,
        tone: "warning",
      };
    case "canceled":
      return tier !== "free"
        ? {
            label: "Renewal canceled",
            heading: `Your ${tierName} access remains available until the paid period ends`,
            description:
              "Renewal is canceled. No automatic refund is issued for the current paid period.",
            tone: "success",
          }
        : {
            label: "Subscription ended",
            heading: "Your previous subscription has ended",
            description:
              "You can continue on the Free plan or choose a new plan whenever you like.",
            tone: "neutral",
          };
    default:
      return tier !== "free"
        ? {
            label: tierName,
            heading: `${tierName} access is available`,
            description: `Your current plan includes ${tierName} limits and capabilities.`,
            tone: "success",
          }
        : {
            label: "Free plan",
            heading: "You’re using the Free plan",
            description:
              "Core tracking stays free, with four custom categories. Budget unlocks every paid feature, and Pro adds bigger allowances and priority support.",
            tone: "neutral",
          };
  }
}

export function periodLabel(summary: BillingSummary): string | undefined {
  const source = summary.entitlementSource;
  if (source === "platform_admin" || source === "sponsored" || summary.coveredBy) {
    return undefined;
  }
  if (summary.pendingChange) {
    return `Moves to ${PLAN_NAMES[summary.pendingChange.plan]} ${formatPlanDate(summary.pendingChange.effectiveAt)}`;
  }
  if (summary.scheduledChangeAt) {
    return `Change scheduled ${formatPlanDate(summary.scheduledChangeAt)}`;
  }
  if (!summary.currentPeriodEndsAt) return undefined;
  if (summary.status === "trialing")
    return `Trial ends ${formatPlanDate(summary.currentPeriodEndsAt)}`;
  if (summary.status === "active") return `Renews ${formatPlanDate(summary.currentPeriodEndsAt)}`;
  return `Period ends ${formatPlanDate(summary.currentPeriodEndsAt)}`;
}
