import { useLayoutEffect, useRef, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";

import "./CancelSubscriptionDialog.css";

export function CancelSubscriptionDialog({
  open,
  busy,
  periodEndsAt,
  returnFocus,
  onClose,
  onConfirm,
}: {
  open: boolean;
  busy: boolean;
  periodEndsAt: string | null;
  returnFocus?: HTMLElement | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const keepSubscriptionRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const titleId = "cancel-subscription-title";
  const descriptionId = "cancel-subscription-description";

  useLayoutEffect(() => {
    if (!open) return;

    const root = document.getElementById("root");
    const previousBodyOverflow = document.body.style.overflow;
    const previousAriaHidden = root?.getAttribute("aria-hidden") ?? null;
    const previousInert = root?.inert ?? false;
    const activeElement = document.activeElement;

    if (returnFocus?.isConnected) {
      openerRef.current = returnFocus;
    } else if (activeElement instanceof HTMLElement && activeElement !== document.body) {
      openerRef.current = activeElement;
    }
    if (root) {
      root.inert = true;
      root.setAttribute("aria-hidden", "true");
    }
    document.body.style.overflow = "hidden";
    keepSubscriptionRef.current?.focus();

    return () => {
      if (root) {
        root.inert = previousInert;
        if (previousAriaHidden === null) root.removeAttribute("aria-hidden");
        else root.setAttribute("aria-hidden", previousAriaHidden);
      }
      document.body.style.overflow = previousBodyOverflow;
      if (openerRef.current?.isConnected) openerRef.current.focus();
    };
  }, [open, returnFocus]);

  function close() {
    if (!busy) onClose();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== "Tab") return;

    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [tabindex]:not([tabindex="-1"])',
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

  if (!open) return null;
  const paidThrough = periodEndsAt
    ? new Intl.DateTimeFormat("en-PH", {
        month: "long",
        day: "numeric",
        year: "numeric",
        timeZone: "Asia/Manila",
      }).format(new Date(periodEndsAt))
    : "the end of your current paid period";

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
