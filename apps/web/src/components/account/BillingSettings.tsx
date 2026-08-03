import type {
  BillingSubscriptionStatus,
  BillingSummary,
  ProEntitlementSource,
} from "@zoption/shared";
import type { User } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { useBillingSummary } from "../../hooks/useBillingSummary";
import { cancelBillingSubscription, reconcileBillingCheckout } from "../../lib/api";
import { queryKeys } from "../../lib/queryKeys";
import { planFeatures } from "../billing/billingPlans";
import { PlanUsageIndicator } from "../billing/PlanUsageIndicator";
import { ProCheckoutDialog } from "../billing/ProCheckoutDialog";
import { userWorkspace } from "../../lib/workspace";
import { CancelSubscriptionDialog } from "./CancelSubscriptionDialog";
import { SponsoredProSeatsSettings } from "./SponsoredProSeatsSettings";
import "./BillingSettings.css";

const PAYMENT_FAST_CONFIRMATION_ATTEMPTS = 10;
const PAYMENT_TOTAL_CONFIRMATION_ATTEMPTS = 21;
const PAYMENT_FAST_CONFIRMATION_INTERVAL_MS = 2_000;
const PAYMENT_SLOW_CONFIRMATION_INTERVAL_MS = 10_000;
const PAYMENT_RECONCILIATION_INTERVAL_MS = 10_000;
const CANCELLATION_CONFIRMATION_ATTEMPTS = 10;
const CANCELLATION_CONFIRMATION_INTERVAL_MS = 2_000;

function formatPlanDate(value: string): string {
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "Asia/Manila",
  }).format(new Date(value));
}

function isConfirmedPayPalSummary(summary: BillingSummary | undefined): boolean {
  return Boolean(
    summary?.plan === "zoption_pro" &&
    summary.entitlementSource === "paypal" &&
    summary.provider === "paypal" &&
    (summary.status === "active" || summary.status === "trialing") &&
    summary.pendingCheckout === null,
  );
}

function statusCopy(
  status: BillingSubscriptionStatus | null | undefined,
  plan: BillingSummary["plan"] | undefined,
  entitlementSource: ProEntitlementSource | null | undefined,
  paymentPending: boolean,
  paymentReviewRequired: boolean,
  confirmingCancellation: boolean,
): { label: string; heading: string; description: string; tone: string } {
  if (paymentPending) {
    return paymentReviewRequired
      ? {
          label: "Payment review",
          heading: "PayPal confirmation needs more time",
          description:
            "No paid access has been granted yet. Zoption will continue checking PayPal securely, and a second checkout is blocked to prevent duplicate subscriptions.",
          tone: "warning",
        }
      : {
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
  const workspace = useMemo(() => userWorkspace(user), [user]);
  const queryClient = useQueryClient();
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
  const reconciliationAttemptRef = useRef<{ checkoutKey: string; attemptedAt: number } | undefined>(
    undefined,
  );
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [paymentRefreshBusy, setPaymentRefreshBusy] = useState(false);
  const [paymentConfirmationDelayed, setPaymentConfirmationDelayed] = useState(false);
  const [paymentPollingExhausted, setPaymentPollingExhausted] = useState(false);
  const [paymentReviewRequired, setPaymentReviewRequired] = useState(false);
  const [paymentStatusNotice, setPaymentStatusNotice] = useState<string>();
  const [confirmingCancellation, setConfirmingCancellation] = useState(false);
  const [cancellationConfirmationDelayed, setCancellationConfirmationDelayed] = useState(false);
  const [checkoutCancelledNotice, setCheckoutCancelledNotice] = useState(false);

  useEffect(() => {
    const pendingCheckoutKey = summary?.pendingCheckout?.createdAt;
    if (!checkoutCompleted && !pendingCheckoutKey) return;
    if (isConfirmedPayPalSummary(summary)) {
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

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    let lastError: unknown;

    setPaymentConfirmationDelayed(false);
    setPaymentPollingExhausted(false);
    setPaymentReviewRequired(
      Boolean(
        summary?.pendingCheckout?.expiresAt &&
        new Date(summary.pendingCheckout.expiresAt).getTime() <= Date.now(),
      ),
    );
    setPaymentStatusNotice(undefined);
    setError(undefined);

    function completePaymentConfirmation() {
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
    }

    async function confirmPayment() {
      attempts += 1;
      setPaymentRefreshBusy(true);
      try {
        let nextSummary: BillingSummary | undefined;
        const reconciliationKey = pendingCheckoutKey ?? "checkout-return";
        const previousAttempt = reconciliationAttemptRef.current;
        const attemptedAt = Date.now();
        const shouldReconcile =
          !previousAttempt ||
          previousAttempt.checkoutKey !== reconciliationKey ||
          attemptedAt - previousAttempt.attemptedAt >= PAYMENT_RECONCILIATION_INTERVAL_MS;

        if (shouldReconcile) {
          reconciliationAttemptRef.current = {
            checkoutKey: reconciliationKey,
            attemptedAt,
          };
          const reconciliation = await reconcileBillingCheckout(workspace);
          if (cancelled) return;
          if (reconciliation.summary.pendingCheckout) {
            reconciliationAttemptRef.current = {
              checkoutKey: reconciliation.summary.pendingCheckout.createdAt,
              attemptedAt,
            };
          }
          if (isConfirmedPayPalSummary(reconciliation.summary)) {
            queryClient.setQueryData(queryKeys.billing(workspace), reconciliation.summary);
            setPaymentConfirmationDelayed(false);
            setPaymentPollingExhausted(false);
            setPaymentReviewRequired(false);
            completePaymentConfirmation();
            return;
          }
          if (reconciliation.outcome === "review_required") {
            setPaymentReviewRequired(true);
            setPaymentConfirmationDelayed(true);
          }
          if (reconciliation.outcome === "closed" || reconciliation.outcome === "none") {
            setPaymentConfirmationDelayed(false);
            setPaymentPollingExhausted(false);
            setPaymentReviewRequired(false);
            setPaymentStatusNotice(
              reconciliation.outcome === "closed"
                ? "PayPal reports that this checkout is no longer active. No Pro access was started, and you can begin a new checkout."
                : "Zoption could not find a payment awaiting confirmation. If PayPal shows a completed charge, contact support with the PayPal transaction details.",
            );
            await refetchBilling();
            if (!cancelled) completePaymentConfirmation();
            return;
          }
          nextSummary = reconciliation.summary;
        }

        const result = await refetchBilling();
        if (cancelled) return;
        if (result.error) throw result.error;
        nextSummary = result.data ?? nextSummary;
        if (!nextSummary) throw new Error("Your plan could not be refreshed.");
        lastError = undefined;
        if (isConfirmedPayPalSummary(nextSummary)) {
          setPaymentConfirmationDelayed(false);
          setPaymentPollingExhausted(false);
          setPaymentReviewRequired(false);
          completePaymentConfirmation();
          return;
        }
      } catch (cause) {
        if (cancelled) return;
        lastError = cause;
      } finally {
        if (!cancelled) setPaymentRefreshBusy(false);
      }

      if (attempts >= PAYMENT_FAST_CONFIRMATION_ATTEMPTS) {
        setPaymentConfirmationDelayed(true);
      }
      if (attempts >= PAYMENT_TOTAL_CONFIRMATION_ATTEMPTS) {
        setPaymentPollingExhausted(true);
        if (lastError) {
          setError(
            lastError instanceof Error ? lastError.message : "Your plan could not be refreshed.",
          );
        }
        return;
      }

      const interval =
        attempts < PAYMENT_FAST_CONFIRMATION_ATTEMPTS
          ? PAYMENT_FAST_CONFIRMATION_INTERVAL_MS
          : PAYMENT_SLOW_CONFIRMATION_INTERVAL_MS;
      timer = setTimeout(() => void confirmPayment(), interval);
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
    queryClient,
    refetchBilling,
    summary?.pendingCheckout?.createdAt,
    summary?.pendingCheckout?.expiresAt,
    summary?.entitlementSource,
    summary?.plan,
    summary?.provider,
    summary?.status,
    user.id,
    workspace,
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
        if (attempts >= CANCELLATION_CONFIRMATION_ATTEMPTS) {
          setError(
            cause instanceof Error ? cause.message : "Your cancellation could not be confirmed.",
          );
        }
      }

      if (attempts >= CANCELLATION_CONFIRMATION_ATTEMPTS) {
        setConfirmingCancellation(false);
        setCancellationConfirmationDelayed(true);
        return;
      }
      timer = setTimeout(() => void confirmCancellation(), CANCELLATION_CONFIRMATION_INTERVAL_MS);
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

  const checkPaymentStatus = useCallback(async () => {
    setPaymentRefreshBusy(true);
    setError(undefined);
    setPaymentStatusNotice(undefined);
    try {
      const reconciliation = await reconcileBillingCheckout(workspace);
      if (reconciliation.summary.pendingCheckout) {
        reconciliationAttemptRef.current = {
          checkoutKey: reconciliation.summary.pendingCheckout.createdAt,
          attemptedAt: Date.now(),
        };
      }
      if (isConfirmedPayPalSummary(reconciliation.summary)) {
        queryClient.setQueryData(queryKeys.billing(workspace), reconciliation.summary);
        setPaymentConfirmationDelayed(false);
        setPaymentPollingExhausted(false);
        setPaymentReviewRequired(false);
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
      const result = await refetchBilling();
      if (result.error) throw result.error;
      const nextSummary = result.data ?? reconciliation.summary;
      if (isConfirmedPayPalSummary(nextSummary)) {
        setPaymentConfirmationDelayed(false);
        setPaymentPollingExhausted(false);
        setPaymentReviewRequired(false);
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
      } else if (reconciliation.outcome === "review_required") {
        setPaymentConfirmationDelayed(true);
        setPaymentPollingExhausted(true);
        setPaymentReviewRequired(true);
      } else if (reconciliation.outcome === "closed" || reconciliation.outcome === "none") {
        setPaymentConfirmationDelayed(false);
        setPaymentPollingExhausted(false);
        setPaymentReviewRequired(false);
        setPaymentStatusNotice(
          reconciliation.outcome === "closed"
            ? "PayPal reports that this checkout is no longer active. No Pro access was started, and you can begin a new checkout."
            : "Zoption could not find a payment awaiting confirmation. If PayPal shows a completed charge, contact support with the PayPal transaction details.",
        );
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
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Your plan could not be refreshed.");
    } finally {
      setPaymentRefreshBusy(false);
    }
  }, [
    location.hash,
    location.pathname,
    location.search,
    navigate,
    queryClient,
    refetchBilling,
    workspace,
  ]);

  const paymentPending = Boolean(checkoutCompleted || summary?.pendingCheckout);
  useEffect(() => {
    if (!paymentPending || !paymentPollingExhausted) return;

    let lastAttemptAt = 0;
    function refreshWhenPresent() {
      if (document.visibilityState === "hidden") return;
      const attemptedAt = Date.now();
      if (attemptedAt - lastAttemptAt < PAYMENT_RECONCILIATION_INTERVAL_MS) return;
      lastAttemptAt = attemptedAt;
      void checkPaymentStatus();
    }

    window.addEventListener("focus", refreshWhenPresent);
    window.addEventListener("online", refreshWhenPresent);
    return () => {
      window.removeEventListener("focus", refreshWhenPresent);
      window.removeEventListener("online", refreshWhenPresent);
    };
  }, [checkPaymentStatus, paymentPending, paymentPollingExhausted]);

  const visibleError = error ?? (billingError instanceof Error ? billingError.message : undefined);
  const presentation = statusCopy(
    summary?.status,
    summary?.plan,
    summary?.entitlementSource,
    paymentPending,
    paymentReviewRequired,
    confirmingCancellation,
  );
  const isPro = summary?.plan === "zoption_pro";
  const currentPlanKnown = !paymentPending;
  const duplicateSubscriptions = (summary?.nonTerminalSubscriptionCount ?? 0) > 1;
  const assistantUsage = summary?.usages.find((usage) => usage.feature === "assistant_question");
  const isAssistantCycle = assistantUsage?.periodKind === "anchored_14_day";
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
                      data-current={(currentPlanKnown && !isPro) || undefined}
                      aria-current={currentPlanKnown && !isPro ? "true" : undefined}
                    >
                      <span className="billing-plan-name">Free</span>
                      {currentPlanKnown && !isPro && (
                        <span className="billing-plan-current">Current plan</span>
                      )}
                    </th>
                    <th
                      scope="col"
                      data-plan="pro"
                      data-current={(currentPlanKnown && isPro) || undefined}
                      aria-current={currentPlanKnown && isPro ? "true" : undefined}
                    >
                      <span className="billing-plan-name">Zoption Pro</span>
                      {currentPlanKnown && isPro && (
                        <span className="billing-plan-current">Current plan</span>
                      )}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {planFeatures.map((item) => (
                    <tr key={item.feature}>
                      <th scope="row">{item.feature}</th>
                      <td data-plan="free" data-current={(currentPlanKnown && !isPro) || undefined}>
                        {item.free}
                      </td>
                      <td data-plan="pro" data-current={(currentPlanKnown && isPro) || undefined}>
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
          aria-busy={(!summary && !visibleError) || paymentRefreshBusy || confirmingCancellation}
          aria-live="polite"
        >
          <div>
            <strong>
              {summary || paymentPending || confirmingCancellation
                ? presentation.heading
                : "Loading your plan"}
            </strong>
            <p>
              {summary || paymentPending || confirmingCancellation
                ? presentation.description
                : visibleError
                  ? "Your current billing state is temporarily unavailable."
                  : "Checking your plan and monthly usage."}
            </p>
          </div>
          {billingPeriodLabel && <small>{billingPeriodLabel}</small>}
        </div>
        {summary && !paymentPending && (
          <div className="billing-usage-grid" aria-label="Current plan usage and allowances">
            {assistantUsage && (
              <PlanUsageIndicator
                label={`AI questions ${isAssistantCycle ? "this 14-day cycle" : "this month"}`}
                used={assistantUsage.used}
                limit={assistantUsage.limit}
                resetsAt={assistantUsage.resetsAt}
                resetPendingLabel={
                  isAssistantCycle
                    ? "cycle starts with your first provider-backed question"
                    : undefined
                }
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
                disabled={paymentPending || confirmingCancellation}
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
        {summary && !isPro && !canCheckout && !canManageBilling && !paymentPending && (
          <p className="settings-helper">
            Upgrade and billing management are temporarily unavailable. Refresh the page or contact
            support if this continues.
          </p>
        )}
        {paymentStatusNotice && (
          <p className="billing-payment-status-notice" role="status">
            {paymentStatusNotice}
          </p>
        )}
        {paymentConfirmationDelayed && (
          <div className="billing-confirmation-delayed">
            <p className="settings-helper" role="status">
              {paymentReviewRequired
                ? "PayPal has not finalized this subscription within the normal confirmation window. Zoption will keep checking securely in the background; do not start another subscription."
                : paymentPollingExhausted
                  ? "Payment confirmation is still pending. Zoption will continue checking PayPal in the background."
                  : "Payment confirmation is taking longer than expected. Zoption is still checking PayPal securely."}
            </p>
            {paymentPollingExhausted && (
              <button
                className="button secondary compact"
                type="button"
                disabled={paymentRefreshBusy}
                onClick={() => void checkPaymentStatus()}
              >
                {paymentRefreshBusy ? "Checking payment status…" : "Check payment status"}
              </button>
            )}
          </div>
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
            PayPal checkout was closed. Zoption relies on PayPal’s verified subscription status
            before changing access.
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
