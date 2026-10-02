import { AlertTriangle } from "lucide-react";
import { useRef } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";

import { useFocusTrap } from "../../hooks/useFocusTrap";
import { useRootLock } from "../../hooks/useRootLock";
import {
  isResourceLimitReachedError,
  isUpgradeRequiredError,
  isUsageLimitReachedError,
} from "../../lib/api";
import {
  capabilityLabels,
  featureLabels,
  formatManilaDate,
  resourceLabels,
} from "./billingPresentation";
import "./BillingLimitDialog.css";

interface BillingLimitDialogProps {
  error: unknown;
  returnFocus?: HTMLElement | null;
  onClose: () => void;
}

interface LimitCopy {
  key: string;
  eyebrow: string;
  title: string;
  description: string;
  reset?: string;
}

interface BillingLimitDialogContentProps {
  copy: LimitCopy;
  returnFocus?: HTMLElement | null;
  onClose: () => void;
}

function limitCopy(error: unknown): LimitCopy | undefined {
  if (isUsageLimitReachedError(error)) {
    const { details } = error;
    const label = featureLabels[details.feature];
    return {
      key: details.feature,
      eyebrow: "Plan limit reached",
      title: `No ${label} remaining this month`,
      description: `You’ve used ${details.used} of ${details.limit} ${label}. This request was not completed.`,
      reset: details.resetsAt ? formatManilaDate(details.resetsAt, true) : undefined,
    };
  }
  if (isResourceLimitReachedError(error)) {
    const { details } = error;
    const label = resourceLabels[details.resource];
    return {
      key: details.resource,
      eyebrow: "Plan limit reached",
      title: `No ${label} remaining`,
      description: `You’re using ${details.used} of ${details.limit} active ${label}. Archive one to free the slot, or upgrade for unlimited ${label}.`,
    };
  }
  if (isUpgradeRequiredError(error)) {
    const label = capabilityLabels[error.details.capability];
    return {
      key: error.details.capability,
      eyebrow: "Zoption Pro",
      title: "Zoption Pro is required",
      description: `Upgrade to use ${label}. This request was not completed.`,
    };
  }
  return undefined;
}

function BillingLimitDialogContent({ copy, returnFocus, onClose }: BillingLimitDialogContentProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const primaryActionRef = useRef<HTMLAnchorElement>(null);
  const titleId = `billing-limit-${copy.key}-title`;
  const descriptionId = `billing-limit-${copy.key}-description`;

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
          <p className="eyebrow">{copy.eyebrow}</p>
          <h2 id={titleId}>{copy.title}</h2>
          <p id={descriptionId}>{copy.description}</p>
          {copy.reset && <strong>Your limit resets {copy.reset} (Asia/Manila).</strong>}
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

/** Mounts the dialog only for a billing limit error so the mount-only focus trap activates. */
export function BillingLimitDialog({ error, returnFocus, onClose }: BillingLimitDialogProps) {
  const copy = limitCopy(error);
  if (!copy) return null;

  return <BillingLimitDialogContent copy={copy} returnFocus={returnFocus} onClose={onClose} />;
}
