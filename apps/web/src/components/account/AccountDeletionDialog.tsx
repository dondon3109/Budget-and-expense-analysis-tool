import { useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";

import { PasswordField } from "../auth/PasswordField";
import "./AccountDeletionDialog.css";

interface AccountDeletionDialogProps {
  busy: boolean;
  error?: string;
  billingBlocked?: boolean;
  returnFocus?: HTMLElement | null;
  onConfirm: (password: string) => void;
  onReviewBilling?: () => void;
  onClose: () => void;
}

export function AccountDeletionDialog({
  busy,
  error,
  billingBlocked = false,
  returnFocus,
  onConfirm,
  onReviewBilling,
  onClose,
}: AccountDeletionDialogProps) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const dialogRef = useRef<HTMLElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const titleId = "account-deletion-title";
  const descriptionId = "account-deletion-description";
  const canSubmit = password.length > 0 && confirmation === "DELETE";

  useLayoutEffect(() => {
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
    passwordRef.current?.focus();

    return () => {
      if (root) {
        root.inert = previousInert;
        if (previousAriaHidden === null) root.removeAttribute("aria-hidden");
        else root.setAttribute("aria-hidden", previousAriaHidden);
      }
      document.body.style.overflow = previousBodyOverflow;
      if (openerRef.current?.isConnected) openerRef.current.focus();
    };
  }, []);

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
        'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
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

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (canSubmit && !busy && !billingBlocked) onConfirm(password);
  }

  return createPortal(
    <div
      className="modal-backdrop account-deletion-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <section
        ref={dialogRef}
        className="form-modal account-deletion-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onKeyDown={handleKeyDown}
      >
        <header className="modal-header account-deletion-header">
          <div>
            <p className="eyebrow">Irreversible action</p>
            <h2 id={titleId}>Permanently delete your account</h2>
          </div>
        </header>

        <form className="account-deletion-form" onSubmit={handleSubmit} aria-busy={busy}>
          <p id={descriptionId} className="account-deletion-intro">
            This permanently removes your Zoption financial workspace, assistant history, profile
            picture files, and sign-in account. It cannot be undone.
          </p>
          <PasswordField
            ref={passwordRef}
            id="account-deletion-password"
            label="Current password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={busy}
            required
          />
          <label>
            <span>Type DELETE to confirm</span>
            <input
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              disabled={busy}
              required
            />
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {billingBlocked && onReviewBilling && (
            <div className="account-deletion-billing-action">
              <p>
                Cancel or resolve every ongoing paid subscription before deleting your Zoption
                account.
              </p>
              <button className="button secondary compact" type="button" onClick={onReviewBilling}>
                Review Plan and billing
              </button>
            </div>
          )}
          <p className="account-deletion-progress" role="status" aria-live="polite">
            {busy ? "Deleting your account securely…" : ""}
          </p>
          <div className="modal-actions">
            <button className="button secondary" type="button" onClick={close} disabled={busy}>
              Cancel
            </button>
            <button
              className="button danger"
              type="submit"
              disabled={busy || !canSubmit || billingBlocked}
            >
              {busy ? "Deleting account…" : "Permanently delete account"}
            </button>
          </div>
        </form>
      </section>
    </div>,
    document.body,
  );
}
