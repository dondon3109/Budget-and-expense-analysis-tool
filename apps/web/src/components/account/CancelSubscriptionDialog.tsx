import { useRef } from "react";
import { createPortal } from "react-dom";

import { useFocusTrap } from "../../hooks/useFocusTrap";
import { useRootLock } from "../../hooks/useRootLock";
import "./CancelSubscriptionDialog.css";

interface CancelSubscriptionDialogProps {
  open: boolean;
  busy: boolean;
  periodEndsAt: string | null;
  returnFocus?: HTMLElement | null;
  onClose: () => void;
  onConfirm: () => void;
}

type CancelSubscriptionDialogContentProps = Omit<CancelSubscriptionDialogProps, "open">;

function CancelSubscriptionDialogContent({
  busy,
  periodEndsAt,
  returnFocus,
  onClose,
  onConfirm,
}: CancelSubscriptionDialogContentProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const keepSubscriptionRef = useRef<HTMLButtonElement>(null);
  const titleId = "cancel-subscription-title";
  const descriptionId = "cancel-subscription-description";

  useRootLock(true);

  const handleKeyDown = useFocusTrap(dialogRef, {
    initialFocusRef: keepSubscriptionRef,
    returnFocus: returnFocus ?? null,
    onEscape: () => {
      if (!busy) onClose();
    },
  });

  function close() {
    if (!busy) onClose();
  }

  const paidThrough = periodEndsAt
    ? new Intl.DateTimeFormat("en-PH", {
        month: "long",
        day: "numeric",
        year: "numeric",
        timeZone: "Asia/Manila",
      }).format(new Date(periodEndsAt))
    : "the end of your current paid period";

  // Portalled so the inert application root from useRootLock does not disable the dialog.
  return createPortal(
    <div
      className="modal-backdrop cancel-subscription-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <section
        ref={dialogRef}
        className="form-modal cancel-subscription-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onKeyDown={handleKeyDown}
      >
        <p className="eyebrow">Zoption Pro</p>
        <h2 id={titleId}>Cancel renewal?</h2>
        <p id={descriptionId}>
          Renewal will stop. No automatic refund is issued, and Pro access remains available through
          {` ${paidThrough}`}.
        </p>
        <div className="form-modal-actions">
          <button
            ref={keepSubscriptionRef}
            className="button secondary"
            type="button"
            disabled={busy}
            onClick={close}
          >
            Keep subscription
          </button>
          <button className="button danger" type="button" disabled={busy} onClick={onConfirm}>
            {busy ? "Requesting cancellation…" : "Cancel renewal"}
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}

/** Mounts the dialog only while open so the mount-only focus trap activates on every open. */
export function CancelSubscriptionDialog({ open, ...props }: CancelSubscriptionDialogProps) {
  return open ? <CancelSubscriptionDialogContent {...props} /> : null;
}
