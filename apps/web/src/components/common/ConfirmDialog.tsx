import { useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { useFocusTrap } from "../../hooks/useFocusTrap";
import { useRootLock } from "../../hooks/useRootLock";
import "./ConfirmDialog.css";

export interface ConfirmDialogProps {
  title: string;
  /** One plain sentence naming exactly what happens, including that it cannot be undone. */
  consequence: ReactNode;
  confirmLabel: string;
  /** Label shown on the confirm button while the action is in flight. */
  busyLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  error?: string;
  returnFocus?: HTMLElement | null;
  onConfirm: () => void;
  onClose: () => void;
}

/**
 * The single destructive-confirmation surface for Zoption. Replaces window.confirm
 * and one-off inline confirmations so that every irreversible action states its
 * consequence, blocks double submission, traps focus, closes on Escape, and returns
 * focus to whatever opened it.
 */
export function ConfirmDialog({
  title,
  consequence,
  confirmLabel,
  busyLabel,
  cancelLabel = "Cancel",
  busy = false,
  error,
  returnFocus,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useRootLock(true);

  const handleKeyDown = useFocusTrap(dialogRef, {
    initialFocusRef: cancelRef,
    returnFocus,
    onEscape: () => {
      if (!busy) onClose();
    },
  });

  return createPortal(
    <div
      className="modal-backdrop confirm-dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <section
        ref={dialogRef}
        className="form-modal confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        aria-busy={busy}
        onKeyDown={handleKeyDown}
      >
        <header className="modal-header">
          <h2 id={titleId}>{title}</h2>
        </header>

        <div className="confirm-dialog-body">
          <p id={descriptionId}>{consequence}</p>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </div>

        <div className="modal-actions">
          <button
            ref={cancelRef}
            className="button secondary"
            type="button"
            onClick={onClose}
            disabled={busy}
          >
            {cancelLabel}
          </button>
          <button className="button danger" type="button" onClick={onConfirm} disabled={busy}>
            {busy && busyLabel ? busyLabel : confirmLabel}
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}
