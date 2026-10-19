import {
  INSTANCE_LOADING_STATE,
  PayPalProvider,
  usePayPal,
  usePayPalSubscriptionPaymentSession,
} from "@paypal/react-paypal-js/sdk-v6";
import {
  FAMILY_SEAT_LIMIT,
  PLAN_NAMES,
  PLAN_TIER,
  isFamilyPlan,
  planChangeDirection,
  type BillingInterval,
  type BillingPlanChangeResponse,
  type BillingPlanKey,
  type BillingProviderConfig,
  type BillingSummary,
} from "@zoption/shared";
import { Check, LockKeyhole, ShieldCheck, Wallet, X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useFocusTrap } from "../../hooks/useFocusTrap";
import { useRootLock } from "../../hooks/useRootLock";
import {
  changeBillingPlan,
  getBillingProviderConfig,
  startBillingCheckout,
  type PlanChoice,
} from "../../lib/api";
import {
  CHECKOUT_OPEN_ERROR,
  openBillingCheckout,
  redirectToPaypalCheckout,
} from "../../lib/billingCheckout";
import { personalWorkspace, type AuthenticatedWorkspace } from "../../lib/workspace";
import {
  YEARLY_SAVING_LABEL,
  paymentDisclosure,
  planFeatures,
  planPrice,
  planPriceLabel,
} from "./billingPlans";
import "./PlanCheckoutDialog.css";

interface PlanCheckoutDialogProps {
  open: boolean;
  /** The personal workspace for personal plans, or the family a family plan covers. */
  workspace: AuthenticatedWorkspace;
  plans: readonly BillingPlanKey[];
  /** Preselected and marked recommended: the cheapest plan that solves what sent the person here. */
  suggestedPlan: BillingPlanKey;
  /** Why a new checkout cannot start; null when it can. Ignored when switching plans. */
  unavailable: string | null;
  /** The plan being paid for. When set, the dialog switches plans instead of selling one. */
  current?: PlanChoice | null;
  returnFocus?: HTMLElement | null;
  onClose: () => void;
  onChanged?: (response: BillingPlanChangeResponse, choice: PlanChoice) => void;
}

/** Why a personal checkout cannot start, from the billing summary; null when it can. */
export function personalCheckoutUnavailable(summary: BillingSummary): string | null {
  if (summary.canCheckout && !summary.pendingCheckout) return null;
  if (summary.pendingCheckout) {
    return "Payment confirmation is already in progress. Check Plan and billing for the latest payment status.";
  }
  return summary.canManageBilling
    ? "Review your existing subscription before starting another checkout."
    : "Checkout is temporarily unavailable for this account.";
}

/** The next tier up from the one in effect, which is the cheapest plan that adds anything. */
export function suggestedPersonalPlan(summary: BillingSummary | undefined): BillingPlanKey {
  return summary?.plan === "zoption_budget" ? "pro" : "budget";
}

/** Where the provider sends the buyer back: Plan and billing, or the family it paid for. */
function checkoutStatusUrl(plan: BillingPlanKey, status: "completed" | "cancelled"): string {
  if (isFamilyPlan(plan)) {
    const url = new URL("/app/family", window.location.origin);
    url.searchParams.set("familyCheckout", status);
    return url.toString();
  }
  const url = new URL("/app/settings", window.location.origin);
  url.searchParams.set("checkout", status);
  url.hash = "plan-and-billing";
  return url.toString();
}

function checkoutErrorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : CHECKOUT_OPEN_ERROR;
}

interface PayPalCheckoutActionProps {
  choice: PlanChoice;
  workspace: AuthenticatedWorkspace;
  onBusyChange: (busy: boolean) => void;
}

function PayPalCheckoutAction({ choice, workspace, onBusyChange }: PayPalCheckoutActionProps) {
  const approvalUrlRef = useRef<string | undefined>(undefined);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const createSubscription = useCallback(async () => {
    const checkout = await startBillingCheckout(workspace, choice);
    approvalUrlRef.current = checkout.approvalUrl;
    if (!checkout.subscriptionId) throw new Error(CHECKOUT_OPEN_ERROR);
    return { subscriptionId: checkout.subscriptionId };
  }, [choice, workspace]);

  const {
    error: sdkError,
    isPending,
    handleClick,
  } = usePayPalSubscriptionPaymentSession({
    presentationMode: "auto",
    createSubscription,
    // eslint-disable-next-line @typescript-eslint/require-await
    onApprove: async () => {
      window.location.assign(checkoutStatusUrl(choice.plan, "completed"));
    },
    onCancel: () => {
      window.location.assign(checkoutStatusUrl(choice.plan, "cancelled"));
    },
    onError: (cause) => {
      setError(checkoutErrorMessage(cause));
    },
  });

  async function handleSecureCheckout() {
    setError(undefined);
    setBusy(true);
    onBusyChange(true);
    try {
      const result = await handleClick();
      if (result?.redirectURL) redirectToPaypalCheckout(result.redirectURL);
    } catch (cause) {
      setError(checkoutErrorMessage(cause));
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  }

  async function continueOnPayPal() {
    const approvalUrl = approvalUrlRef.current;
    if (approvalUrl) {
      try {
        redirectToPaypalCheckout(approvalUrl);
      } catch (cause) {
        setError(checkoutErrorMessage(cause));
      }
      return;
    }

    setBusy(true);
    onBusyChange(true);
    try {
      await openBillingCheckout(workspace, choice);
    } catch (cause) {
      setError(checkoutErrorMessage(cause));
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  }

  const visibleError = error ?? sdkError?.message;

  return (
    <div className="pro-checkout-secure-action" aria-live="polite">
      <button
        className="button secondary pro-checkout-continue"
        type="button"
        disabled={isPending || busy}
        onClick={() => void handleSecureCheckout()}
      >
        <Wallet size={15} aria-hidden="true" />
        {isPending ? "Preparing PayPal…" : busy ? "Opening PayPal…" : "Continue with PayPal"}
      </button>
      {visibleError && (
        <div className="pro-checkout-payment-error" role="alert">
          <p>{visibleError}</p>
          <button
            className="button secondary compact"
            type="button"
            disabled={busy}
            onClick={() => void continueOnPayPal()}
          >
            {busy ? "Opening PayPal…" : "Continue on PayPal"}
          </button>
        </div>
      )}
    </div>
  );
}

function PayPalCheckoutBoundary({ choice, workspace, onBusyChange }: PayPalCheckoutActionProps) {
  const { sdkInstance, loadingStatus } = usePayPal();
  const [fallbackBusy, setFallbackBusy] = useState(false);
  const [fallbackError, setFallbackError] = useState<string>();
  const sdkReady = loadingStatus === INSTANCE_LOADING_STATE.RESOLVED && Boolean(sdkInstance);
  const sdkFailed = loadingStatus === INSTANCE_LOADING_STATE.REJECTED;

  async function continueOnPayPal() {
    setFallbackBusy(true);
    setFallbackError(undefined);
    onBusyChange(true);
    try {
      await openBillingCheckout(workspace, choice);
    } catch (cause) {
      setFallbackError(checkoutErrorMessage(cause));
    } finally {
      setFallbackBusy(false);
      onBusyChange(false);
    }
  }

  if (sdkReady) {
    return (
      <PayPalCheckoutAction choice={choice} workspace={workspace} onBusyChange={onBusyChange} />
    );
  }

  if (!sdkFailed) {
    return (
      <button className="button secondary pro-checkout-continue" type="button" disabled>
        <Wallet size={15} aria-hidden="true" />
        Preparing PayPal…
      </button>
    );
  }

  return (
    <div className="pro-checkout-payment-error" role="alert">
      <p>
        PayPal&apos;s secure payment window could not be prepared. Continue on PayPal to finish
        subscribing.
      </p>
      {fallbackError && <p>{fallbackError}</p>}
      <button
        className="button secondary compact"
        type="button"
        disabled={fallbackBusy}
        onClick={() => void continueOnPayPal()}
      >
        {fallbackBusy ? "Opening PayPal…" : "Continue on PayPal"}
      </button>
    </div>
  );
}

function PlanOption({
  plan,
  interval,
  selected,
  recommended,
  isCurrent,
  disabled,
  onSelect,
}: {
  plan: BillingPlanKey;
  interval: BillingInterval;
  selected: boolean;
  recommended: boolean;
  isCurrent: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  const tier = PLAN_TIER[plan];
  return (
    <label className={selected ? "pro-checkout-plan selected" : "pro-checkout-plan"}>
      <span className="pro-checkout-plan-heading">
        <span className="pro-checkout-plan-title-group">
          <span className="pro-checkout-plan-radio">
            <input
              type="radio"
              name="plan-checkout-plan"
              value={plan}
              checked={selected}
              disabled={disabled}
              onChange={onSelect}
            />
            <strong>{PLAN_NAMES[plan]}</strong>
          </span>
          {isFamilyPlan(plan) && (
            <span className="pro-checkout-plan-subtitle">
              {FAMILY_SEAT_LIMIT} seats, you included
            </span>
          )}
        </span>
        {isCurrent ? (
          <span className="pro-checkout-plan-status-badge">Current plan</span>
        ) : (
          recommended && <span className="pro-checkout-plan-recommended-badge">Recommended</span>
        )}
      </span>
      <span className="pro-checkout-plan-price">
        <span className="pro-checkout-amount">{planPrice(plan, interval)}</span>
        <span className="pro-checkout-frequency">
          {interval === "month" ? "/ month" : "/ year"}
        </span>
      </span>
      <ul className="pro-checkout-features" aria-label={`${PLAN_NAMES[plan]} features`}>
        {planFeatures.map((feature) => (
          <li key={feature.feature}>
            <span className="pro-checkout-check included" aria-hidden="true">
              <Check size={12} strokeWidth={2.5} />
            </span>
            <span>
              <b>{feature.feature}</b>
              {feature[tier]}
            </span>
          </li>
        ))}
      </ul>
    </label>
  );
}

function PlanCheckoutDialogContent({
  workspace,
  plans,
  suggestedPlan,
  unavailable,
  current,
  returnFocus,
  onClose,
  onChanged,
}: Omit<PlanCheckoutDialogProps, "open">) {
  const dialogRef = useRef<HTMLElement>(null);
  const initialActionRef = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);
  const [dodoBusy, setDodoBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [interval, setBillingInterval] = useState<BillingInterval>(current?.interval ?? "month");
  const [plan, setPlan] = useState<BillingPlanKey>(suggestedPlan);
  const [providerConfig, setProviderConfig] = useState<BillingProviderConfig>();
  const choice = useMemo(() => ({ plan, interval }), [plan, interval]);
  const changing = Boolean(current);
  const canCheckout = !changing && unavailable === null;
  const direction = current ? planChangeDirection(current, choice) : null;
  const family = isFamilyPlan(plans[0] ?? suggestedPlan);

  useRootLock(true);

  const handleKeyDown = useFocusTrap(dialogRef, {
    initialFocusRef: initialActionRef,
    returnFocus: returnFocus ?? null,
    onEscape: onClose,
  });

  // PayPal's client id is the person's to read, so a family checkout asks the personal workspace.
  useEffect(() => {
    if (!canCheckout) return;

    let cancelled = false;
    setError(undefined);
    setProviderConfig(undefined);
    void getBillingProviderConfig(personalWorkspace(workspace))
      .then((config) => {
        if (!cancelled) setProviderConfig(config);
      })
      .catch((cause) => {
        if (!cancelled) setError(checkoutErrorMessage(cause));
      });

    return () => {
      cancelled = true;
    };
  }, [canCheckout, workspace]);

  // The trap focuses the entry action; opening a long dialog should still start at the top.
  useLayoutEffect(() => {
    if (dialogRef.current) {
      dialogRef.current.scrollTop = 0;
    }
  }, []);

  async function runCheckout(provider: "paypal" | "dodo") {
    setBusy(true);
    setDodoBusy(provider === "dodo");
    setError(undefined);
    try {
      await openBillingCheckout(workspace, choice, provider);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Checkout could not be opened.");
    } finally {
      setBusy(false);
      setDodoBusy(false);
    }
  }

  async function switchPlan() {
    setBusy(true);
    setError(undefined);
    try {
      const response = await changeBillingPlan(workspace, choice);
      if (response.approvalUrl) {
        redirectToPaypalCheckout(response.approvalUrl);
        return;
      }
      onChanged?.(response, choice);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The plan could not be changed.");
    } finally {
      setBusy(false);
    }
  }

  const titleId = "plan-checkout-title";
  const descriptionId = "plan-checkout-description";

  return createPortal(
    <div
      className="modal-backdrop pro-checkout-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <section
        ref={dialogRef}
        className="form-modal pro-checkout-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onKeyDown={handleKeyDown}
      >
        <div className="pro-checkout-header">
          <div className="pro-checkout-header-copy">
            <div className="pro-checkout-header-eyebrow-row">
              <span className="pro-checkout-pill-tag">{family ? "Family" : "Membership"}</span>
              <p className="eyebrow">Zoption plans</p>
            </div>
            <h2 id={titleId}>
              {changing ? "Change your plan" : family ? "Choose a family plan" : "Choose a plan"}
            </h2>
          </div>
          <button
            className="icon-button compact pro-checkout-close-btn"
            type="button"
            aria-label="Close plan options"
            disabled={busy}
            onClick={onClose}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        <p id={descriptionId} className="pro-checkout-intro">
          {family
            ? "Everyone in the family gets the plan's limits for their own Zoption too, and the family workspace follows the same plan."
            : "Budget unlocks every paid feature. Pro adds bigger AI and import allowances, unlimited categories, and priority support."}
        </p>

        <fieldset className="pro-checkout-intervals" disabled={busy}>
          <legend>Billing interval</legend>
          <div className="pro-checkout-interval-options">
            {(["month", "year"] as const).map((option) => (
              <label
                key={option}
                className={
                  interval === option ? "pro-checkout-interval selected" : "pro-checkout-interval"
                }
              >
                <input
                  type="radio"
                  name="plan-checkout-interval"
                  value={option}
                  checked={interval === option}
                  onChange={() => setBillingInterval(option)}
                />
                <span className="pro-checkout-interval-content">
                  <span className="pro-checkout-interval-label-row">
                    <strong>{option === "month" ? "Monthly" : "Yearly"}</strong>
                    {option === "year" && (
                      <span className="pro-checkout-save-badge">{YEARLY_SAVING_LABEL}</span>
                    )}
                  </span>
                  <small>{planPriceLabel(plan, option)}</small>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="pro-checkout-plans" disabled={busy}>
          <legend className="sr-only">Plan</legend>
          {plans.map((option) => (
            <PlanOption
              key={option}
              plan={option}
              interval={interval}
              selected={plan === option}
              recommended={!changing && option === suggestedPlan}
              isCurrent={current?.plan === option && current.interval === interval}
              disabled={busy}
              onSelect={() => setPlan(option)}
            />
          ))}
        </fieldset>

        {changing ? (
          <div className="pro-checkout-payment">
            <p className="pro-checkout-secure-note">
              {direction === "downgrade"
                ? "You keep your current plan until the paid period ends, then move to this one."
                : direction === "upgrade"
                  ? "The new plan starts now. Dodo Payments charges the difference today; PayPal bills the new price from your next renewal."
                  : "This is the plan you already have."}
            </p>
            <div className="modal-actions">
              <button
                ref={initialActionRef}
                className="button secondary"
                type="button"
                disabled={busy}
                onClick={onClose}
              >
                Keep current plan
              </button>
              <button
                className="button primary"
                type="button"
                disabled={busy || direction === "same"}
                onClick={() => void switchPlan()}
              >
                {busy ? "Switching…" : `Switch to ${PLAN_NAMES[plan]}`}
              </button>
            </div>
          </div>
        ) : canCheckout ? (
          <div className="pro-checkout-payment">
            <div className="pro-checkout-secure-action">
              <button
                className="button primary pro-checkout-continue"
                type="button"
                disabled={busy}
                onClick={() => void runCheckout("dodo")}
              >
                <LockKeyhole size={15} aria-hidden="true" />
                {dodoBusy ? "Opening secure payment…" : `Continue with ${PLAN_NAMES[plan]}`}
              </button>
              <p className="pro-checkout-secure-note">
                Pay by card, Apple Pay, or Google Pay. Dodo Payments is the merchant of record for
                this option.
              </p>
            </div>

            <section
              className="pro-checkout-payment-methods"
              aria-labelledby="paypal-payment-methods-title"
            >
              <div className="pro-checkout-payment-methods-header">
                <div className="pro-checkout-payment-methods-title-row">
                  <ShieldCheck size={15} className="pro-checkout-shield-icon" aria-hidden="true" />
                  <strong id="paypal-payment-methods-title">Or pay with PayPal</strong>
                </div>
                <span>Pay with your PayPal balance or a card linked to PayPal.</span>
              </div>
              {providerConfig ? (
                <PayPalProvider
                  clientId={providerConfig.clientId}
                  environment={providerConfig.environment}
                  components={[
                    "paypal-payments",
                    "paypal-subscriptions",
                    "paypal-guest-payments",
                    "card-fields",
                  ]}
                  pageType="checkout"
                >
                  <PayPalCheckoutBoundary
                    choice={choice}
                    workspace={workspace}
                    onBusyChange={setBusy}
                  />
                </PayPalProvider>
              ) : (
                <button
                  className="button secondary pro-checkout-continue"
                  type="button"
                  disabled={!error || busy}
                  onClick={() => void runCheckout("paypal")}
                >
                  <Wallet size={15} aria-hidden="true" />
                  {busy && !dodoBusy
                    ? "Opening PayPal…"
                    : error
                      ? "Continue on PayPal"
                      : "Preparing PayPal…"}
                </button>
              )}
            </section>
            <button
              ref={initialActionRef}
              className="button secondary pro-checkout-free-action"
              type="button"
              disabled={busy}
              onClick={onClose}
            >
              Not now
            </button>
          </div>
        ) : (
          <div className="pro-checkout-unavailable">
            <strong>Checkout unavailable</strong>
            <p>{unavailable}</p>
            <button
              ref={initialActionRef}
              className="button secondary compact"
              type="button"
              onClick={onClose}
            >
              Close
            </button>
          </div>
        )}

        {error && (
          <p className="pro-checkout-error" role="alert">
            {error}
          </p>
        )}
        <p className="pro-checkout-disclosure">{paymentDisclosure}</p>
      </section>
    </div>,
    document.body,
  );
}

/** Mounts the dialog only while open so the mount-only focus trap activates on every open. */
export function PlanCheckoutDialog({ open, ...props }: PlanCheckoutDialogProps) {
  return open ? <PlanCheckoutDialogContent {...props} /> : null;
}
