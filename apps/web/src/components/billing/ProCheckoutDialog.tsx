import {
  INSTANCE_LOADING_STATE,
  PayPalProvider,
  usePayPal,
  usePayPalSubscriptionPaymentSession,
} from "@paypal/react-paypal-js/sdk-v6";
import type { BillingInterval, BillingProviderConfig, BillingSummary } from "@zoption/shared";
import { Check, CreditCard, LockKeyhole, Minus, ShieldCheck, WalletCards, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";

import { useRootLock } from "../../hooks/useRootLock";
import { getBillingProviderConfig, startBillingCheckout } from "../../lib/api";
import { openBillingCheckout } from "../../lib/billingCheckout";
import type { AuthenticatedWorkspace } from "../../lib/workspace";
import { paymentDisclosure, planFeatures, proCheckoutOptions } from "./billingPlans";
import "./ProCheckoutDialog.css";

interface ProCheckoutDialogProps {
  open: boolean;
  summary: BillingSummary;
  workspace: AuthenticatedWorkspace;
  returnFocus?: HTMLElement | null;
  onClose: () => void;
}

function checkoutStatusUrl(status: "completed" | "cancelled"): string {
  const url = new URL("/app/settings", window.location.origin);
  url.searchParams.set("checkout", status);
  url.hash = "plan-and-billing";
  return url.toString();
}

function checkoutErrorMessage(cause: unknown): string {
  return cause instanceof Error
    ? cause.message
    : "Secure payment could not be opened. Continue on PayPal to finish subscribing.";
}

interface PayPalCheckoutActionProps {
  interval: BillingInterval;
  workspace: AuthenticatedWorkspace;
  onBusyChange: (busy: boolean) => void;
}

interface FreePlanCardProps {
  busy: boolean;
  initialActionRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
}

function FreePlanCard({ busy, initialActionRef, onClose }: FreePlanCardProps) {
  return (
    <section className="pro-checkout-plan pro-checkout-plan-free" aria-label="Free plan">
      <div className="pro-checkout-plan-heading">
        <div className="pro-checkout-plan-title-group">
          <strong>Free</strong>
          <span className="pro-checkout-plan-subtitle">Core budgeting tools</span>
        </div>
        <span className="pro-checkout-plan-status-badge">Current plan</span>
      </div>
      <div className="pro-checkout-plan-price" aria-label="Price: Free forever">
        <span className="pro-checkout-amount">₱0</span>
        <span className="pro-checkout-frequency">forever</span>
      </div>
      <ul className="pro-checkout-features" aria-label="Free plan features">
        {planFeatures.map((feature) => {
          const isExcluded = feature.free === "Not included";
          return (
            <li
              key={feature.feature}
              className={isExcluded ? "pro-checkout-feature-excluded" : undefined}
            >
              <span
                className={`pro-checkout-check ${isExcluded ? "excluded" : "included"}`}
                aria-hidden="true"
              >
                {isExcluded ? (
                  <Minus size={11} strokeWidth={2.5} />
                ) : (
                  <Check size={12} strokeWidth={2.5} />
                )}
              </span>
              <span>
                <b>{feature.feature}</b>
                {feature.free}
              </span>
            </li>
          );
        })}
      </ul>
      <button
        ref={initialActionRef}
        className="button secondary pro-checkout-free-action"
        type="button"
        disabled={busy}
        onClick={onClose}
      >
        Continue using free plan
      </button>
    </section>
  );
}

function PayPalCheckoutAction({ interval, workspace, onBusyChange }: PayPalCheckoutActionProps) {
  const approvalUrlRef = useRef<string | undefined>(undefined);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const createSubscription = useCallback(async () => {
    const checkout = await startBillingCheckout(workspace, interval);
    approvalUrlRef.current = checkout.approvalUrl;
    return { subscriptionId: checkout.subscriptionId };
  }, [interval, workspace]);

  const {
    error: sdkError,
    isPending,
    handleClick,
  } = usePayPalSubscriptionPaymentSession({
    presentationMode: "auto",
    createSubscription,
    // eslint-disable-next-line @typescript-eslint/require-await
    onApprove: async () => {
      window.location.assign(checkoutStatusUrl("completed"));
    },
    onCancel: () => {
      window.location.assign(checkoutStatusUrl("cancelled"));
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
      if (result?.redirectURL) window.location.assign(result.redirectURL);
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
      window.location.assign(approvalUrl);
      return;
    }

    setBusy(true);
    onBusyChange(true);
    try {
      await openBillingCheckout(workspace, interval);
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
        className="button primary pro-checkout-continue"
        type="button"
        disabled={isPending || busy}
        onClick={() => void handleSecureCheckout()}
      >
        <LockKeyhole size={15} aria-hidden="true" />
        {isPending
          ? "Preparing secure checkout…"
          : busy
            ? "Opening secure payment…"
            : "Continue securely"}
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

function PayPalCheckoutBoundary({ interval, workspace, onBusyChange }: PayPalCheckoutActionProps) {
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
      await openBillingCheckout(workspace, interval);
    } catch (cause) {
      setFallbackError(checkoutErrorMessage(cause));
    } finally {
      setFallbackBusy(false);
      onBusyChange(false);
    }
  }

  if (sdkReady) {
    return (
      <PayPalCheckoutAction interval={interval} workspace={workspace} onBusyChange={onBusyChange} />
    );
  }

  if (!sdkFailed) {
    return (
      <button className="button primary pro-checkout-continue" type="button" disabled>
        <LockKeyhole size={15} aria-hidden="true" />
        Preparing secure checkout…
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

export function ProCheckoutDialog({
  open,
  summary,
  workspace,
  returnFocus,
  onClose,
}: ProCheckoutDialogProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const initialActionRef = useRef<HTMLButtonElement>(null);
  const initialProActionRef = useRef<HTMLInputElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [selectedInterval, setSelectedInterval] = useState<BillingInterval>("month");
  const [providerConfig, setProviderConfig] = useState<BillingProviderConfig>();
  const canCheckout = summary.canCheckout && !summary.pendingCheckout;
  const checkoutUnavailable = summary.pendingCheckout
    ? "Payment confirmation is already in progress. Check Plan and billing for the latest PayPal verification status."
    : summary.canManageBilling
      ? "Review your existing subscription before starting another checkout."
      : "Checkout is temporarily unavailable for this account.";

  useRootLock(open);

  useEffect(() => {
    if (!open || !canCheckout) return;

    let cancelled = false;
    setError(undefined);
    setProviderConfig(undefined);
    void getBillingProviderConfig(workspace)
      .then((config) => {
        if (!cancelled) setProviderConfig(config);
      })
      .catch((cause) => {
        if (!cancelled) setError(checkoutErrorMessage(cause));
      });

    return () => {
      cancelled = true;
    };
  }, [canCheckout, open, workspace]);

  useLayoutEffect(() => {
    if (!open) return;

    const activeElement = document.activeElement;

    if (returnFocus?.isConnected) openerRef.current = returnFocus;
    else if (activeElement instanceof HTMLElement && activeElement !== document.body) {
      openerRef.current = activeElement;
    }
    const preferProAction = window.matchMedia?.("(max-width: 700px)").matches;
    const targetAction = preferProAction ? initialProActionRef.current : initialActionRef.current;
    targetAction?.focus({ preventScroll: true });
    if (dialogRef.current) {
      dialogRef.current.scrollTop = 0;
    }

    return () => {
      if (openerRef.current?.isConnected) openerRef.current.focus();
    };
  }, [open, returnFocus]);

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;

    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? [],
    ).filter((element) => element.tabIndex >= 0);
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) return;

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    } else if (!dialogRef.current?.contains(document.activeElement)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    }
  }

  async function handleFallbackCheckout() {
    if (!canCheckout) return;

    setBusy(true);
    setError(undefined);
    try {
      await openBillingCheckout(workspace, selectedInterval);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Checkout could not be opened.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  const titleId = "pro-checkout-title";
  const descriptionId = "pro-checkout-description";

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
              <span className="pro-checkout-pill-tag">Membership</span>
              <p className="eyebrow">Zoption plans</p>
            </div>
            <h2 id={titleId}>Choose how you want to use Zoption Pro</h2>
          </div>
          <button
            className="icon-button compact pro-checkout-close-btn"
            type="button"
            aria-label="Close subscription options"
            disabled={Boolean(busy)}
            onClick={onClose}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        <p id={descriptionId} className="pro-checkout-intro">
          Pro unlocks monthly and six-month cashflow views. It does not add or move transactions
          into the week currently displayed.
        </p>

        <div className="pro-checkout-plans">
          <section
            className="pro-checkout-plan pro-checkout-plan-pro"
            aria-label="Zoption Pro plan"
          >
            <div className="pro-checkout-plan-heading">
              <div className="pro-checkout-plan-title-group">
                <strong>Zoption Pro</strong>
                <span className="pro-checkout-plan-subtitle">More range, more room</span>
              </div>
              <span className="pro-checkout-plan-recommended-badge">Recommended</span>
            </div>
            <div
              className="pro-checkout-plan-price"
              aria-label={`Price: ${selectedInterval === "month" ? "₱149 per month" : "₱1,299 per year"}`}
            >
              <span className="pro-checkout-amount">
                {selectedInterval === "month" ? "₱149" : "₱1,299"}
              </span>
              <span className="pro-checkout-frequency">
                {selectedInterval === "month" ? "/ month" : "/ year"}
                {selectedInterval === "year" && (
                  <span className="pro-checkout-effective-rate"> · ₱108.25/mo</span>
                )}
              </span>
            </div>
            <ul className="pro-checkout-features" aria-label="Zoption Pro features">
              {planFeatures.map((feature) => (
                <li key={feature.feature}>
                  <span className="pro-checkout-check included" aria-hidden="true">
                    <Check size={12} strokeWidth={2.5} />
                  </span>
                  <span>
                    <b>{feature.feature}</b>
                    {feature.pro}
                  </span>
                </li>
              ))}
            </ul>
            {canCheckout ? (
              <div className="pro-checkout-payment">
                <fieldset className="pro-checkout-intervals" disabled={busy}>
                  <legend>Billing interval</legend>
                  <div className="pro-checkout-interval-options">
                    {proCheckoutOptions.map((option) => (
                      <label
                        key={option.interval}
                        className={
                          selectedInterval === option.interval
                            ? "pro-checkout-interval selected"
                            : "pro-checkout-interval"
                        }
                      >
                        <input
                          ref={option.interval === "month" ? initialProActionRef : undefined}
                          type="radio"
                          name="pro-billing-interval"
                          value={option.interval}
                          aria-label={`${option.label}, ${option.price}`}
                          checked={selectedInterval === option.interval}
                          onChange={() => setSelectedInterval(option.interval)}
                        />
                        <span className="pro-checkout-interval-content">
                          <span className="pro-checkout-interval-label-row">
                            <strong>{option.label}</strong>
                            {option.interval === "year" && (
                              <span className="pro-checkout-save-badge">Save 27%</span>
                            )}
                          </span>
                          <small>{option.price}</small>
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>

                <section
                  className="pro-checkout-payment-methods"
                  aria-labelledby="payment-methods-title"
                >
                  <div className="pro-checkout-payment-methods-header">
                    <div className="pro-checkout-payment-methods-title-row">
                      <ShieldCheck
                        size={15}
                        className="pro-checkout-shield-icon"
                        aria-hidden="true"
                      />
                      <strong id="payment-methods-title">Payment handled by PayPal</strong>
                    </div>
                    <span>
                      PayPal will show the methods available to you, which may include debit or
                      credit card.
                    </span>
                  </div>
                  <ul aria-label="Possible payment methods">
                    <li>
                      <CreditCard size={15} aria-hidden="true" />
                      Debit or credit card when available
                    </li>
                    <li>
                      <WalletCards size={15} aria-hidden="true" />
                      PayPal
                    </li>
                  </ul>
                </section>

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
                      interval={selectedInterval}
                      workspace={workspace}
                      onBusyChange={setBusy}
                    />
                  </PayPalProvider>
                ) : (
                  <button
                    className="button primary pro-checkout-continue"
                    type="button"
                    disabled={!error || busy}
                    onClick={() => void handleFallbackCheckout()}
                  >
                    <LockKeyhole size={15} aria-hidden="true" />
                    {busy
                      ? "Opening PayPal…"
                      : error
                        ? "Continue securely on PayPal"
                        : "Preparing secure checkout…"}
                  </button>
                )}
              </div>
            ) : (
              <div className="pro-checkout-unavailable">
                <strong>Checkout unavailable</strong>
                <p>{checkoutUnavailable}</p>
                <Link className="button secondary compact" to="/app/settings#plan-and-billing">
                  Review Plan and billing
                </Link>
              </div>
            )}
          </section>
          <FreePlanCard
            busy={Boolean(busy)}
            initialActionRef={initialActionRef}
            onClose={onClose}
          />
        </div>

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
