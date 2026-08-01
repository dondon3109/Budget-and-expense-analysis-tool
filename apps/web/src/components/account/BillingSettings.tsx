import type {
  BillingSubscriptionStatus,
  BillingSummary,
  ProEntitlementSource,
} from "@zoption/shared";
import type { User } from "@supabase/supabase-js";
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { useBillingSummary } from "../../hooks/useBillingSummary";
import { cancelBillingSubscription } from "../../lib/api";
import { planFeatures } from "../billing/billingPlans";
import { PlanUsageIndicator } from "../billing/PlanUsageIndicator";
import { ProCheckoutDialog } from "../billing/ProCheckoutDialog";
import { userWorkspace } from "../../lib/workspace";
import { CancelSubscriptionDialog } from "./CancelSubscriptionDialog";
import { SponsoredProSeatsSettings } from "./SponsoredProSeatsSettings";
import "./BillingSettings.css";

const CONFIRMATION_ATTEMPTS = 10;
const CONFIRMATION_INTERVAL_MS = 2_000;

function formatPlanDate(value: string): string {
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "Asia/Manila",
  }).format(new Date(value));
}

function statusCopy(
  status: BillingSubscriptionStatus | null | undefined,
  plan: BillingSummary["plan"] | undefined,
  entitlementSource: ProEntitlementSource | null | undefined,
  confirmingPayment: boolean,
  confirmingCancellation: boolean,
): { label: string; heading: string; description: string; tone: string } {
  if (confirmingPayment) {
    return {
      label: "Confirming payment",
      heading: "Confirming your payment",
      description:
        "PayPal is confirming your subscription. Paid access begins only after Zoption receives a verified provider notification.",
      tone: "pending",
    };
  }

  if (confirmingCancellation) {
    return {
      label: "Confirming cancellation",
      heading: "Confirming your cancellation",
      description:
        "PayPal has received your cancellation request. Renewal stops after Zoption receives its verified provider notification.",
      tone: "pending",
    };
  }

  if (entitlementSource === "platform_admin") {
    return {
      label: "Permanent Pro",
      heading: "Your permanent complimentary Pro access is active",
      description:
        "Platform administration includes Pro limits and capabilities until trusted operations disable it.",
      tone: "success",
    };
  }
  if (entitlementSource === "sponsored") {
    return {
      label: "Sponsored Pro",
      heading: "Your sponsored Pro access is active",
      description:
        "Your sponsor currently includes Pro limits and capabilities for this personal workspace.",
      tone: "success",
    };
  }

  switch (status) {
    case "active":
      return {
        label: "Zoption Pro",
        heading: "Zoption Pro is active",
        description: "Your paid access is confirmed. Pro limits and capabilities are available.",
        tone: "success",
      };
    case "trialing":
      return {
        label: "Pro trial",
        heading: "Your Zoption Pro trial is active",
        description: "Your trial currently includes Pro access and limits.",
        tone: "success",
      };
    case "past_due":
      return {
        label: "Payment issue",
        heading: "Your payment needs attention",
        description:
          "PayPal has reported a payment issue. Review your PayPal subscription to restore confirmed paid access.",
        tone: "warning",
      };
    case "paused":
      return {
        label: "Subscription paused",
        heading: "Your subscription is paused",
        description:
          "Pro access is not active while the subscription is paused. Review the subscription in PayPal.",
        tone: "warning",
      };
    case "canceled":
      return plan === "zoption_pro"
        ? {
            label: "Renewal canceled",
            heading: "Your Pro access remains available until the paid period ends",
            description:
              "Renewal is canceled. No automatic refund is issued for the current paid period.",
            tone: "success",
          }
        : {
            label: "Subscription ended",
            heading: "Your previous subscription has ended",
            description:
              "You can continue on the Free plan or start a new Pro subscription when eligible.",
            tone: "neutral",
          };
    default:
      return plan === "zoption_pro"
        ? {
            label: "Zoption Pro",
            heading: "Zoption Pro access is available",
            description: "Your current plan includes Pro limits and capabilities.",
            tone: "success",
          }
        : {
            label: "Free plan",
            heading: "You’re using the Free plan",
            description:
              "Core tracking stays free, with one custom category. Pro adds higher AI and import limits plus advanced management and analytics.",
            tone: "neutral",
          };
  }
}

function periodLabel(summary: BillingSummary): string | undefined {
  if (summary.entitlementSource === "platform_admin" || summary.entitlementSource === "sponsored") {
    return undefined;
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

export function BillingSettings({ user }: { user: User }) {
  const workspace = userWorkspace(user);
  const {
    data: summary,
    error: billingError,
    refetch: refetchBilling,
  } = useBillingSummary(workspace);
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const checkoutCompleted = searchParams.get("checkout") === "completed";
  const checkoutCancelled = searchParams.get("checkout") === "cancelled";
  const [error, setError] = useState<string>();
  const [isProCheckoutOpen, setIsProCheckoutOpen] = useState(false);
  const checkoutTriggerRef = useRef<HTMLButtonElement>(null);
  const cancellationTriggerRef = useRef<HTMLButtonElement>(null);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [confirmingPayment, setConfirmingPayment] = useState(checkoutCompleted);
  const [paymentConfirmationDelayed, setPaymentConfirmationDelayed] = useState(false);
  const [confirmingCancellation, setConfirmingCancellation] = useState(false);
  const [cancellationConfirmationDelayed, setCancellationConfirmationDelayed] = useState(false);
  const [checkoutCancelledNotice, setCheckoutCancelledNotice] = useState(false);

  useEffect(() => {
    if (!checkoutCompleted) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;

    setConfirmingPayment(true);
    setPaymentConfirmationDelayed(false);
    setError(undefined);

    async function confirmPayment() {
      attempts += 1;
      try {
        const result = await refetchBilling();
        if (cancelled) return;
        if (result.error) throw result.error;
        const nextSummary = result.data;
        if (!nextSummary) throw new Error("Your plan could not be refreshed.");
        if (
          nextSummary.plan === "zoption_pro" &&
          (nextSummary.status === "active" || nextSummary.status === "trialing")
        ) {
          setConfirmingPayment(false);
          const nextSearch = new URLSearchParams(location.search);
          nextSearch.delete("checkout");
          void navigate(
            {
              pathname: location.pathname,
              search: nextSearch.size ? `?${nextSearch.toString()}` : "",
              hash: location.hash,
            },
            { replace: true },
          );
          return;
        }
      } catch (cause) {
        if (cancelled) return;
        if (attempts >= CONFIRMATION_ATTEMPTS) {
          setError(cause instanceof Error ? cause.message : "Your plan could not be refreshed.");
        }
      }

      if (attempts >= CONFIRMATION_ATTEMPTS) {
        setConfirmingPayment(false);
        setPaymentConfirmationDelayed(true);
        return;
      }
      timer = setTimeout(() => void confirmPayment(), CONFIRMATION_INTERVAL_MS);
    }

    void confirmPayment();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [
    checkoutCompleted,
    location.hash,
    location.pathname,
    location.search,
    navigate,
    refetchBilling,
    user.id,
  ]);

  useEffect(() => {
    if (!checkoutCancelled) return;

    setCheckoutCancelledNotice(true);
    const nextSearch = new URLSearchParams(location.search);
    nextSearch.delete("checkout");
    void navigate(
      {
        pathname: location.pathname,
        search: nextSearch.size ? `?${nextSearch.toString()}` : "",
        hash: location.hash,
      },
      { replace: true },
    );
  }, [checkoutCancelled, location.hash, location.pathname, location.search, navigate]);

  useEffect(() => {
    if (!checkoutCancelledNotice) return;
    const timer = setTimeout(() => setCheckoutCancelledNotice(false), 7_000);
    return () => clearTimeout(timer);
  }, [checkoutCancelledNotice]);

  useEffect(() => {
    if (!confirmingCancellation) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;

    async function confirmCancellation() {
      attempts += 1;
      try {
        const result = await refetchBilling();
        if (cancelled) return;
        if (result.error) throw result.error;
        if (result.data?.cancelAtPeriodEnd) {
          setConfirmingCancellation(false);
          setCancellationConfirmationDelayed(false);
          return;
        }
      } catch (cause) {
        if (cancelled) return;
        if (attempts >= CONFIRMATION_ATTEMPTS) {
          setError(
            cause instanceof Error ? cause.message : "Your cancellation could not be confirmed.",
          );
        }
      }

      if (attempts >= CONFIRMATION_ATTEMPTS) {
        setConfirmingCancellation(false);
        setCancellationConfirmationDelayed(true);
        return;
      }
      timer = setTimeout(() => void confirmCancellation(), CONFIRMATION_INTERVAL_MS);
    }

    void confirmCancellation();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [confirmingCancellation, refetchBilling]);

  async function requestCancellation() {
    setCancelBusy(true);
    setError(undefined);
    try {
      await cancelBillingSubscription(workspace);
      setCancelDialogOpen(false);
      setCancellationConfirmationDelayed(false);
      setConfirmingCancellation(true);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "The cancellation request could not be sent.",
      );
    } finally {
      setCancelBusy(false);
    }
  }

  const visibleError = error ?? (billingError instanceof Error ? billingError.message : undefined);
  const presentation = statusCopy(
    summary?.status,
    summary?.plan,
    summary?.entitlementSource,
    confirmingPayment,
    confirmingCancellation,
  );
  const isPro = summary?.plan === "zoption_pro";
  const duplicateSubscriptions = (summary?.nonTerminalSubscriptionCount ?? 0) > 1;
  const assistantUsage = summary?.usages.find((usage) => usage.feature === "assistant_question");
  const importUsage = summary?.usages.find((usage) => usage.feature === "file_import");
  const categoryAllowance = summary?.allowances.find(
    (allowance) => allowance.resource === "custom_category",
  );
  const canCheckout = summary?.canCheckout === true;
  const canManageBilling = summary?.canManageBilling === true;
  const billingPeriodLabel = summary ? periodLabel(summary) : undefined;

  return (
    <>
      {summary && (
        <section id="plan-comparison" className="settings-section billing-plan-comparison-section">
          <div className="billing-plan-comparison-wrap">
            <div className="billing-plan-comparison-heading">
              <div>
                <h2 id="billing-plan-comparison-title">Free and Pro, side by side</h2>
                <p id="billing-plan-comparison-description">
                  Transactions, budgets, recurring-expense tracking, calendar tools, and included
                  starter data remain available on both plans.
                </p>
              </div>
            </div>
            <p id="billing-plan-scroll-hint" className="billing-plan-scroll-hint">
              On narrow screens, scroll horizontally to compare both plans.
            </p>
            <div
              className="billing-plan-table-wrap"
              role="region"
              aria-labelledby="billing-plan-comparison-title"
              aria-describedby="billing-plan-comparison-description billing-plan-scroll-hint"
              tabIndex={0}
            >
              <table className="billing-plan-comparison">
                <caption className="sr-only">Free and Zoption Pro plan feature comparison</caption>
                <thead>
                  <tr>
                    <th className="billing-plan-feature-heading" scope="col">
                      Feature
                    </th>
                    <th
                      scope="col"
                      data-plan="free"
                      data-current={!isPro || undefined}
                      aria-current={!isPro ? "true" : undefined}
                    >
                      <span className="billing-plan-name">Free</span>
                      {!isPro && <span className="billing-plan-current">Current plan</span>}
                    </th>
                    <th
                      scope="col"
                      data-plan="pro"
                      data-current={isPro || undefined}
                      aria-current={isPro ? "true" : undefined}
                    >
                      <span className="billing-plan-name">Zoption Pro</span>
                      {isPro && <span className="billing-plan-current">Current plan</span>}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {planFeatures.map((item) => (
                    <tr key={item.feature}>
                      <th scope="row">{item.feature}</th>
                      <td data-plan="free" data-current={!isPro || undefined}>
                        {item.free}
                      </td>
                      <td data-plan="pro" data-current={isPro || undefined}>
                        {item.pro}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}
      <section
        id="plan-and-billing"
        className="settings-section billing-settings"
        aria-labelledby="billing-settings-title"
        tabIndex={-1}
      >
        <div className="settings-section-heading">
          <div>
            <h2 id="billing-settings-title">Plan and billing</h2>
            <p>Review your limits and upgrade only when Zoption Pro is useful for your workflow.</p>
          </div>
          <span>{presentation.label}</span>
        </div>
        <div
          className="billing-settings-overview"
          data-tone={presentation.tone}
          aria-busy={(!summary && !visibleError) || confirmingPayment || confirmingCancellation}
          aria-live="polite"
        >
          <div>
            <strong>
              {summary || confirmingPayment || confirmingCancellation
                ? presentation.heading
                : "Loading your plan"}
            </strong>
            <p>
              {summary || confirmingPayment || confirmingCancellation
                ? presentation.description
                : visibleError
                  ? "Your current billing state is temporarily unavailable."
                  : "Checking your plan and monthly usage."}
            </p>
          </div>
          {billingPeriodLabel && <small>{billingPeriodLabel}</small>}
        </div>
        {summary && (
          <div className="billing-usage-grid" aria-label="Current plan usage and allowances">
            {assistantUsage && (
              <PlanUsageIndicator
                label="AI questions this month"
                used={assistantUsage.used}
                limit={assistantUsage.limit}
                resetsAt={assistantUsage.resetsAt}
              />
            )}
            {importUsage && (
              <PlanUsageIndicator
                label="Committed imports this month"
                used={importUsage.used}
                limit={importUsage.limit}
                resetsAt={importUsage.resetsAt}
              />
            )}
            {categoryAllowance && (
              <PlanUsageIndicator
                label="Active custom categories"
                used={categoryAllowance.used}
                limit={categoryAllowance.limit}
                detail="Included starter and protected Uncategorized categories do not count."
              />
            )}
          </div>
        )}
        {duplicateSubscriptions && (
          <p className="billing-settings-warning" role="alert">
            More than one ongoing subscription is linked to this account. Resolve billing before
            starting another checkout or deleting your Zoption account.
          </p>
        )}
        {(canCheckout || canManageBilling) && (
          <div className="billing-settings-actions">
            {canCheckout && (
              <button
                ref={checkoutTriggerRef}
                className="button primary compact"
                type="button"
                disabled={confirmingPayment || confirmingCancellation}
                onClick={() => setIsProCheckoutOpen(true)}
              >
                Choose a Pro plan
              </button>
            )}
            {canManageBilling &&
              summary?.provider === "paypal" &&
              summary.status === "active" &&
              !summary.cancelAtPeriodEnd && (
                <button
                  ref={cancellationTriggerRef}
                  className="button secondary compact"
                  type="button"
                  disabled={cancelBusy || confirmingCancellation || summary.status !== "active"}
                  onClick={() => setCancelDialogOpen(true)}
                >
                  Cancel renewal
                </button>
              )}
            <small>
              {canCheckout
                ? "Prices are charged in Philippine pesos. PayPal securely hosts checkout. Taxes if applicable may apply."
                : "PayPal processes subscription payments. Cancellation stops future renewal; no automatic refund is issued."}
            </small>
          </div>
        )}
        {summary && !isPro && !canCheckout && canManageBilling && (
          <p className="settings-helper">
            A new checkout is unavailable while this subscription state is being resolved. Review
            the subscription in PayPal if action is needed.
          </p>
        )}
        {summary && !isPro && !canCheckout && !canManageBilling && (
          <p className="settings-helper">
            Upgrade and billing management are temporarily unavailable. Refresh the page or contact
            support if this continues.
          </p>
        )}
        {paymentConfirmationDelayed && (
          <p className="settings-helper" role="status">
            Payment confirmation is taking longer than expected. You can safely refresh this page in
            a moment—Zoption updates your plan after receiving PayPal’s verified notification.
          </p>
        )}
        {cancellationConfirmationDelayed && (
          <p className="settings-helper" role="status">
            Cancellation confirmation is taking longer than expected. Your renewal request remains
            pending until Zoption receives PayPal’s verified notification. You can safely refresh
            this page in a moment.
          </p>
        )}
        {checkoutCancelledNotice && (
          <p className="settings-helper" role="status">
            Checkout was canceled. No payment was made.
          </p>
        )}
        {visibleError && (
          <p className="form-error" role="alert">
            {visibleError}
          </p>
        )}
        {summary && (
          <ProCheckoutDialog
            open={isProCheckoutOpen}
            summary={summary}
            workspace={workspace}
            returnFocus={checkoutTriggerRef.current}
            onClose={() => setIsProCheckoutOpen(false)}
          />
        )}
      </section>
      <CancelSubscriptionDialog
        open={cancelDialogOpen}
        busy={cancelBusy}
        periodEndsAt={summary?.currentPeriodEndsAt ?? null}
        returnFocus={cancellationTriggerRef.current}
        onClose={() => setCancelDialogOpen(false)}
        onConfirm={() => void requestCancellation()}
      />
      {summary?.canManageSponsoredSeats && <SponsoredProSeatsSettings workspace={workspace} />}
    </>
  );
}
