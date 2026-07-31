import { AlertTriangle } from "lucide-react";
import { useLayoutEffect, useRef, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";

import { isMonthlyLimitReachedError } from "../../lib/api";
import { featureLabels, formatManilaDate } from "./billingPresentation";
import "./BillingLimitDialog.css";

interface BillingLimitDialogProps {
  error: unknown;
  returnFocus?: HTMLElement | null;
  onClose: () => void;
}

export function BillingLimitDialog({ error, returnFocus, onClose }: BillingLimitDialogProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const primaryActionRef = useRef<HTMLAnchorElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const details = isMonthlyLimitReachedError(error) ? error.details : undefined;

  useLayoutEffect(() => {
    if (!details) return;
    const root = document.getElementById("root");
    const previousBodyOverflow = document.body.style.overflow;
    const previousAriaHidden = root?.getAttribute("aria-hidden") ?? null;
    const previousInert = root?.inert ?? false;
    const activeElement = document.activeElement;

    if (returnFocus?.isConnected) openerRef.current = returnFocus;
    else if (activeElement instanceof HTMLElement && activeElement !== document.body) {
      openerRef.current = activeElement;
    }
    if (root) {
      root.inert = true;
      root.setAttribute("aria-hidden", "true");
    }
    document.body.style.overflow = "hidden";
    primaryActionRef.current?.focus();

    return () => {
      if (root) {
        root.inert = previousInert;
        if (previousAriaHidden === null) root.removeAttribute("aria-hidden");
        else root.setAttribute("aria-hidden", previousAriaHidden);
      }
      document.body.style.overflow = previousBodyOverflow;
      if (openerRef.current?.isConnected) openerRef.current.focus();
    };
  }, [details, returnFocus]);

  if (!details) return null;

  const titleId = `billing-limit-${details.feature}-title`;
  const descriptionId = `billing-limit-${details.feature}-description`;
  const reset = formatManilaDate(details.resetsAt, true);

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

  return createPortal(
    <div
      className="modal-backdrop billing-limit-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={dialogRef}
        className="form-modal billing-limit-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onKeyDown={handleKeyDown}
      >
        <div className="billing-limit-mark" aria-hidden="true">
          <AlertTriangle size={22} />
        </div>
        <div className="billing-limit-copy">
          <p className="eyebrow">Plan limit reached</p>
          <h2 id={titleId}>No {featureLabels[details.feature]} remaining this month</h2>
          <p id={descriptionId}>
            You’ve used {details.used} of {details.limit} {featureLabels[details.feature]}. This
            request was not completed.
          </p>
          {reset && <strong>Your limit resets {reset} (Asia/Manila).</strong>}
        </div>
        <div className="modal-actions billing-limit-actions">
          <button className="button secondary" type="button" onClick={onClose}>
            Close
          </button>
          <Link
            ref={primaryActionRef}
            className="button primary"
            to="/app/settings#plan-and-billing"
          >
            Review Plan and billing
          </Link>
        </div>
      </section>
    </div>,
    document.body,
  );
}
