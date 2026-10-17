import {
  FAMILY_JOIN_COOLDOWN_DAYS,
  FAMILY_MEMBERSHIP_LIMIT,
  FAMILY_SEAT_COOLDOWN_DAYS,
  FAMILY_SEAT_LIMIT,
  FAMILY_SWAP_LIMIT_PER_YEAR,
} from "@zoption/shared";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useFocusTrap } from "../../hooks/useFocusTrap";
import { useRootLock } from "../../hooks/useRootLock";
import "../common/ConfirmDialog.css";
import "./SeatRulesDialog.css";

/** The confirm button stays locked this long so the rules are seen, not clicked through. */
const READ_SECONDS = 10;

/**
 * The seat rules, shown before creating a family, accepting an invitation, or removing a member.
 * The API refuses those three calls without the acknowledgement this dialog stands for.
 */
export function SeatRulesDialog({
  title,
  confirmLabel,
  busy = false,
  error,
  returnFocus,
  onConfirm,
  onClose,
}: {
  title: string;
  confirmLabel: string;
  busy?: boolean;
  error?: string;
  returnFocus?: HTMLElement | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const [secondsLeft, setSecondsLeft] = useState(READ_SECONDS);

  useRootLock(true);
  const handleKeyDown = useFocusTrap(dialogRef, {
    initialFocusRef: cancelRef,
    returnFocus,
    onEscape: () => {
      if (!busy) onClose();
    },
  });

  useEffect(() => {
    if (secondsLeft === 0) return;
    const timer = window.setTimeout(() => setSecondsLeft((left) => left - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [secondsLeft]);

  return createPortal(
    <div className="modal-backdrop confirm-dialog-backdrop" role="presentation">
      <section
        ref={dialogRef}
        className="form-modal confirm-dialog seat-rules-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-busy={busy}
        onKeyDown={handleKeyDown}
      >
        <header className="modal-header">
          <h2 id={titleId}>{title}</h2>
        </header>
        <div className="seat-rules-body" tabIndex={0}>
          <p>A family shares one budget between up to {FAMILY_SEAT_LIMIT} people.</p>
          <ul>
            <li>
              The owner and every pending invitation each take one of the {FAMILY_SEAT_LIMIT} seats.
            </li>
            <li>
              When someone leaves or is removed, their seat stays empty for{" "}
              {FAMILY_SEAT_COOLDOWN_DAYS} days.
            </li>
            <li>
              After {FAMILY_SWAP_LIMIT_PER_YEAR} seats have been freed within a year, the family
              cannot invite anyone new until the oldest of those is a year old.
            </li>
            <li>
              A person can join a different family at most once every {FAMILY_JOIN_COOLDOWN_DAYS}{" "}
              days, and belong to {FAMILY_MEMBERSHIP_LIMIT} families at most.
            </li>
            <li>
              Entries someone added stay in the family after they leave; their access ends right
              away.
            </li>
          </ul>
          <p>Your personal budget is never visible to the family.</p>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button
            ref={cancelRef}
            className="button secondary"
            type="button"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            className="button primary"
            type="button"
            onClick={onConfirm}
            disabled={busy || secondsLeft > 0}
          >
            {secondsLeft > 0 ? `${confirmLabel} (${secondsLeft})` : confirmLabel}
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}
