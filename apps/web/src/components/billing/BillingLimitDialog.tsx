import { AlertTriangle } from "lucide-react";
import { useRef } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";

import { useFocusTrap } from "../../hooks/useFocusTrap";
import { useRootLock } from "../../hooks/useRootLock";
import { isUsageLimitReachedError, type UsageLimitReachedDetails } from "../../lib/api";
import { featureLabels, formatManilaDate } from "./billingPresentation";
import "./BillingLimitDialog.css";

interface BillingLimitDialogProps {
  error: unknown;
  returnFocus?: HTMLElement | null;
  onClose: () => void;
}

interface BillingLimitDialogContentProps {
  details: UsageLimitReachedDetails;
  returnFocus?: HTMLElement | null;
  onClose: () => void;
}

function BillingLimitDialogContent({
  details,
  returnFocus,
  onClose,
}: BillingLimitDialogContentProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const primaryActionRef = useRef<HTMLAnchorElement>(null);
  const titleId = `billing-limit-${details.feature}-title`;
  const descriptionId = `billing-limit-${details.feature}-description`;
  const reset = details.resetsAt ? formatManilaDate(details.resetsAt, true) : undefined;
  const periodLabel =
    details.periodKind === "anchored_14_day" ? "this 14-day period" : "this month";

  useRootLock(true);

  const handleKeyDown = useFocusTrap(dialogRef, {
    initialFocusRef: primaryActionRef,
    returnFocus: returnFocus ?? null,
    onEscape: onClose,
  });

  // Portalled so the inert application root from useRootLock does not disable the dialog.
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
          <h2 id={titleId}>
            No {featureLabels[details.feature]} remaining {periodLabel}
          </h2>
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

/** Mounts the dialog only for a usage-limit error so the mount-only focus trap activates. */
export function BillingLimitDialog({ error, returnFocus, onClose }: BillingLimitDialogProps) {
  const details = isUsageLimitReachedError(error) ? error.details : undefined;
  if (!details) return null;

  return (
    <BillingLimitDialogContent details={details} returnFocus={returnFocus} onClose={onClose} />
  );
}
