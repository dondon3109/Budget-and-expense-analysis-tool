import type { BillingInterval, BillingSummary } from "@zoption/shared";
import { Check, X } from "lucide-react";
import { useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";

import { useRootLock } from "../../hooks/useRootLock";
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

export function ProCheckoutDialog({
  open,
  summary,
  workspace,
  returnFocus,
  onClose,
}: ProCheckoutDialogProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const initialActionRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const [busy, setBusy] = useState<BillingInterval>();
  const [error, setError] = useState<string>();
  const canCheckout = summary.canCheckout && !summary.pendingCheckout;
  const checkoutUnavailable = summary.pendingCheckout
    ? "Payment confirmation is already in progress. Check Plan and billing for the latest PayPal verification status."
    : summary.canManageBilling
      ? "Review your existing subscription before starting another checkout."
      : "Checkout is temporarily unavailable for this account.";

  useRootLock(open);

  useLayoutEffect(() => {
    if (!open) return;

    const activeElement = document.activeElement;

    if (returnFocus?.isConnected) openerRef.current = returnFocus;
    else if (activeElement instanceof HTMLElement && activeElement !== document.body) {
      openerRef.current = activeElement;
    }
    initialActionRef.current?.focus();

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

  async function handleCheckout(interval: BillingInterval) {
    if (!canCheckout) return;

    setBusy(interval);
    setError(undefined);
    try {
      await openBillingCheckout(workspace, interval);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Checkout could not be opened.");
    } finally {
      setBusy(undefined);
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
          <div>
            <p className="eyebrow">Zoption plans</p>
            <h2 id={titleId}>Choose how you want to use Zoption Pro</h2>
          </div>
          <button
            className="icon-button compact"
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
          <section className="pro-checkout-plan" aria-label="Free plan">
            <div className="pro-checkout-plan-heading">
              <strong>Free</strong>
              <span>Current plan</span>
            </div>
            <button
              ref={initialActionRef}
              className="button secondary pro-checkout-free-action"
              type="button"
              disabled={Boolean(busy)}
              onClick={onClose}
            >
              Continue using free plan
            </button>
            <ul>
              {planFeatures.map((feature) => (
                <li key={feature.feature}>
                  <Check size={14} aria-hidden="true" />
                  <span>
                    <b>{feature.feature}</b>
                    {feature.free}
                  </span>
                </li>
              ))}
            </ul>
          </section>
          <section
            className="pro-checkout-plan pro-checkout-plan-pro"
            aria-label="Zoption Pro plan"
          >
            <div className="pro-checkout-plan-heading">
              <strong>Zoption Pro</strong>
              <span>More range, more room</span>
            </div>
            <ul>
              {planFeatures.map((feature) => (
                <li key={feature.feature}>
                  <Check size={14} aria-hidden="true" />
                  <span>
                    <b>{feature.feature}</b>
                    {feature.pro}
                  </span>
                </li>
              ))}
            </ul>
            {canCheckout ? (
              <div className="pro-checkout-actions" aria-live="polite">
                {proCheckoutOptions.map((option, index) => (
                  <button
                    key={option.interval}
                    className={`button ${index === 0 ? "primary" : "secondary"}`}
                    type="button"
                    disabled={Boolean(busy)}
                    onClick={() => void handleCheckout(option.interval)}
                  >
                    {busy === option.interval
                      ? "Opening checkout…"
                      : `Subscribe ${option.label} · ${option.price}`}
                  </button>
                ))}
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
