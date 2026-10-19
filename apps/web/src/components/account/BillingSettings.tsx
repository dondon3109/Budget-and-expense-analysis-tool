import {
  PLAN_NAMES,
  personalBillingPlans,
  type BillingPlanChangeResponse,
  type BillingSummary,
} from "@zoption/shared";
import type { User } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { Link } from "react-router-dom";

import { useBillingSummary } from "../../hooks/useBillingSummary";
import { cancelBillingSubscription, reconcileBillingCheckout } from "../../lib/api";
import { queryKeys } from "../../lib/queryKeys";
import { ThankYouDialog } from "../common/ThankYouDialog";
import { PlanUsageIndicator } from "../billing/PlanUsageIndicator";
import {
  PlanCheckoutDialog,
  personalCheckoutUnavailable,
  suggestedPersonalPlan,
} from "../billing/PlanCheckoutDialog";
import { useProPurchaseThankYou } from "../billing/useProPurchaseThankYou";
import { userWorkspace } from "../../lib/workspace";
import {
  formatPlanDate,
  isConfirmedPaidSummary,
  paymentProviderLabel,
  periodLabel,
  statusCopy,
} from "./billingStatus";
import { CancelSubscriptionDialog } from "./CancelSubscriptionDialog";
import { PlanComparison } from "./PlanComparison";
import "./BillingSettings.css";

const PAYMENT_FAST_CONFIRMATION_ATTEMPTS = 10;
const PAYMENT_TOTAL_CONFIRMATION_ATTEMPTS = 21;
const PAYMENT_FAST_CONFIRMATION_INTERVAL_MS = 2_000;
const PAYMENT_SLOW_CONFIRMATION_INTERVAL_MS = 10_000;
const PAYMENT_RECONCILIATION_INTERVAL_MS = 10_000;
const CANCELLATION_CONFIRMATION_ATTEMPTS = 10;
const CANCELLATION_CONFIRMATION_INTERVAL_MS = 2_000;

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
  const [isPlanChangeOpen, setIsPlanChangeOpen] = useState(false);
  const [planChangeNotice, setPlanChangeNotice] = useState<string>();
  const checkoutTriggerRef = useRef<HTMLButtonElement>(null);
  const cancellationTriggerRef = useRef<HTMLButtonElement>(null);
  const reconciliationAttemptRef = useRef<{ checkoutKey: string; attemptedAt: number } | undefined>(
    undefined,
  );
  const cancelledAbortRef = useRef<string | undefined>(undefined);
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

  // Derived at render so the polling effect depends on a value instead of the summary object.
  const paymentConfirmed = isConfirmedPaidSummary(summary);

  const proThankYou = useProPurchaseThankYou(
    summary !== undefined,
    paymentConfirmed,
    checkoutCompleted,
  );

  useEffect(() => {
    const pendingCheckoutKey = summary?.pendingCheckout?.createdAt;
    if (checkoutCancelled) return;
    if (!checkoutCompleted && !pendingCheckoutKey) return;
    if (paymentConfirmed) {
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
          if (isConfirmedPaidSummary(reconciliation.summary)) {
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
                ? "The payment provider reports that this checkout is no longer active. No paid access was started, and you can begin a new checkout."
                : "Zoption could not find a payment awaiting confirmation. If your payment provider shows a completed charge, contact support with the transaction details.",
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
        if (isConfirmedPaidSummary(nextSummary)) {
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
    checkoutCancelled,
    checkoutCompleted,
    location.hash,
    location.pathname,
    location.search,
    navigate,
    paymentConfirmed,
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

    // PayPal and Dodo redirect here when the buyer leaves checkout unpaid. The
    // pending checkout otherwise waits until it expires, which leaves Plan and
    // billing stuck in "Confirming your payment". Abort the unpaid checkout
    // immediately so the user can start a fresh one.
    if (summary?.pendingCheckout) {
      const checkoutKey = summary.pendingCheckout.createdAt;
      if (cancelledAbortRef.current !== checkoutKey) {
        cancelledAbortRef.current = checkoutKey;
        void (async () => {
          try {
            const reconciliation = await reconcileBillingCheckout(workspace, {
              abortPendingCheckout: true,
            });
            queryClient.setQueryData(queryKeys.billing(workspace), reconciliation.summary);
            await refetchBilling();
          } catch {
            // Fall back to a summary refetch so the pending state can resolve
            // even if the abort reconciliation fails.
            try {
              await refetchBilling();
            } catch {
              // Ignore secondary refresh errors; the banner still explains the
              // cancelled checkout.
            }
          }
        })();
      }
    }
  }, [
    checkoutCancelled,
    location.hash,
    location.pathname,
    location.search,
    navigate,
    queryClient,
    refetchBilling,
    summary?.pendingCheckout,
    workspace,
  ]);

  useEffect(() => {
    if (!checkoutCancelledNotice) return;
    const timer = setTimeout(() => setCheckoutCancelledNotice(false), 7_000);
    return () => clearTimeout(timer);
  }, [checkoutCancelledNotice]);

  // Handle the case where the billing summary loads after the cancel redirect
  // has already cleared the URL. The pending checkout is still stuck until we
  // abort it, so trigger the abort when the summary arrives during the notice
  // window.
  useEffect(() => {
    if (!checkoutCancelledNotice) return;
    if (!summary?.pendingCheckout) return;
    const checkoutKey = summary.pendingCheckout.createdAt;
    if (cancelledAbortRef.current === checkoutKey) return;
    cancelledAbortRef.current = checkoutKey;
    void (async () => {
      try {
        const reconciliation = await reconcileBillingCheckout(workspace, {
          abortPendingCheckout: true,
        });
        queryClient.setQueryData(queryKeys.billing(workspace), reconciliation.summary);
        await refetchBilling();
      } catch {
        try {
          await refetchBilling();
        } catch {
          // Ignore secondary errors.
        }
      }
    })();
  }, [checkoutCancelledNotice, queryClient, refetchBilling, summary?.pendingCheckout, workspace]);

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
      if (isConfirmedPaidSummary(reconciliation.summary)) {
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
      if (isConfirmedPaidSummary(nextSummary)) {
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
            ? "The payment provider reports that this checkout is no longer active. No paid access was started, and you can begin a new checkout."
            : "Zoption could not find a payment awaiting confirmation. If your payment provider shows a completed charge, contact support with the transaction details.",
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

  const startNewCheckout = useCallback(async () => {
    setPaymentRefreshBusy(true);
    setError(undefined);
    try {
      const reconciliation = await reconcileBillingCheckout(workspace);
      await refetchBilling();
      if (
        reconciliation.outcome === "closed" ||
        reconciliation.outcome === "none" ||
        isConfirmedPaidSummary(reconciliation.summary)
      ) {
        setPaymentConfirmationDelayed(false);
        setPaymentPollingExhausted(false);
        setPaymentReviewRequired(false);
        setIsProCheckoutOpen(true);
      } else {
        setError(
          "A subscription is still being confirmed. Complete it with your payment provider before starting another checkout.",
        );
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The checkout could not be reset.");
    } finally {
      setPaymentRefreshBusy(false);
    }
  }, [refetchBilling, workspace]);

  const paymentPending = Boolean(
    checkoutCompleted ||
    (summary?.pendingCheckout && !checkoutCancelled && !checkoutCancelledNotice),
  );
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
  const providerLabel = paymentProviderLabel(
    summary?.pendingCheckout?.provider ?? summary?.provider,
  );
  const presentation = statusCopy(summary, {
    paymentPending,
    paymentReviewRequired,
    confirmingCancellation,
    providerLabel,
  });
  const isPaid = summary !== undefined && summary.plan !== "free";
  const duplicateSubscriptions = (summary?.nonTerminalSubscriptionCount ?? 0) > 1;
  const aiUsage = summary?.usages.find((usage) => usage.feature === "ai_usage");
  const importUsage = summary?.usages.find((usage) => usage.feature === "file_import");
  const categoryAllowance = summary?.allowances.find(
    (allowance) => allowance.resource === "custom_category",
  );
  const canCheckout = summary?.canCheckout === true;
  const canManageBilling = summary?.canManageBilling === true;
  const billingPeriodLabel = summary ? periodLabel(summary) : undefined;
  const currentPlan =
    summary?.subscriptionPlan && summary.interval
      ? { plan: summary.subscriptionPlan, interval: summary.interval }
      : null;

  async function planChanged(response: BillingPlanChangeResponse, target: string) {
    const result = await refetchBilling();
    const effectiveAt = result.data?.pendingChange?.effectiveAt;
    setPlanChangeNotice(
      response.outcome === "scheduled" && effectiveAt
        ? `You move to ${target} on ${formatPlanDate(effectiveAt)}. Until then your current plan stays.`
        : `You’re now on ${target}.`,
    );
  }

  return (
    <>
      {proThankYou.open && <ThankYouDialog flow="pro" onClose={proThankYou.close} />}
      {summary && <PlanComparison current={paymentPending ? null : summary.plan} />}
      <section
        id="plan-and-billing"
        className="settings-section billing-settings"
        aria-labelledby="billing-settings-title"
        tabIndex={-1}
      >
        <div className="settings-section-heading">
          <div>
            <h2 id="billing-settings-title">Plan and billing</h2>
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
            {aiUsage && (
              <PlanUsageIndicator
                label="AI actions this month"
                used={aiUsage.used}
                limit={aiUsage.limit}
                resetsAt={aiUsage.resetsAt}
                detail="Shared across chat, voice chat, receipt scanning, PDF entry, and transaction voice."
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
                Choose a plan
              </button>
            )}
            {summary?.canChangePlan && currentPlan && (
              <button
                ref={checkoutTriggerRef}
                className="button primary compact"
                type="button"
                disabled={paymentPending || confirmingCancellation}
                onClick={() => {
                  setPlanChangeNotice(undefined);
                  setIsPlanChangeOpen(true);
                }}
              >
                Change plan
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
                ? "Prices are charged in Philippine pesos. PayPal or Dodo Payments securely hosts checkout. Taxes if applicable may apply."
                : `${providerLabel} processes subscription payments. Cancellation stops future renewal; no automatic refund is issued.`}
            </small>
          </div>
        )}
        {planChangeNotice && (
          <p className="billing-payment-status-notice" role="status">
            {planChangeNotice}
          </p>
        )}
        {summary && !isPaid && !canCheckout && canManageBilling && (
          <p className="settings-helper">
            A new checkout is unavailable while this subscription state is being resolved. Review
            the subscription in {providerLabel} if action is needed.
          </p>
        )}
        {summary && !isPaid && !canCheckout && !canManageBilling && !paymentPending && (
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
                ? `${providerLabel} has not finalized this subscription within the normal confirmation window. Zoption will keep checking securely in the background; do not start another subscription.`
                : paymentPollingExhausted
                  ? `Payment confirmation is still pending. Zoption will continue checking ${providerLabel} in the background.`
                  : `Payment confirmation is taking longer than expected. Zoption is still checking ${providerLabel} securely.`}
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
            {paymentReviewRequired && (
              <button
                className="button primary compact"
                type="button"
                disabled={paymentRefreshBusy}
                onClick={() => void startNewCheckout()}
              >
                {paymentRefreshBusy ? "Preparing…" : "Start a new checkout"}
              </button>
            )}
          </div>
        )}
        {cancellationConfirmationDelayed && (
          <p className="settings-helper" role="status">
            Cancellation confirmation is taking longer than expected. Your renewal request remains
            pending until Zoption receives {providerLabel}’s verified notification. You can safely
            refresh this page in a moment.
          </p>
        )}
        {checkoutCancelledNotice && (
          <p className="settings-helper" role="status">
            {providerLabel} checkout was closed. Zoption relies on {providerLabel}’s verified
            subscription status before changing access.
          </p>
        )}
        {visibleError && (
          <p className="form-error" role="alert">
            {visibleError}
          </p>
        )}
        {summary && (
          <PlanCheckoutDialog
            open={isProCheckoutOpen || isPlanChangeOpen}
            workspace={workspace}
            plans={personalBillingPlans}
            suggestedPlan={suggestedPersonalPlan(summary)}
            unavailable={personalCheckoutUnavailable(summary)}
            current={isPlanChangeOpen ? currentPlan : null}
            returnFocus={checkoutTriggerRef.current}
            onClose={() => {
              setIsProCheckoutOpen(false);
              setIsPlanChangeOpen(false);
            }}
            onChanged={(response, choice) => void planChanged(response, PLAN_NAMES[choice.plan])}
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
      {summary?.canManageSponsoredSeats && (
        <section className="settings-section" aria-labelledby="admin-console-title" tabIndex={-1}>
          <div className="settings-section-heading">
            <div>
              <h2 id="admin-console-title">Platform admin</h2>
            </div>
            <span>Platform admin</span>
          </div>
          <Link to="/app/admin" className="button secondary compact">
            Open admin console
          </Link>
        </section>
      )}
    </>
  );
}
