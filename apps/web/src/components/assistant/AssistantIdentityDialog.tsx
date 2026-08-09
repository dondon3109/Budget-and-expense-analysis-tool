import { assistantIdentityNameSchema } from "@zoption/shared";
import { Bot, Pencil, X } from "lucide-react";
import { useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";

import { useRootLock } from "../../hooks/useRootLock";

interface AssistantIdentityDialogProps {
  required: boolean;
  assistantName?: string | null;
  userPreferredName?: string | null;
  profileDisplayName?: string;
  busy: boolean;
  serverError?: string;
  onSubmit: (identity: { assistantName: string; userPreferredName: string }) => void;
  onClose?: () => void;
}

function initialUserName(userPreferredName?: string | null, profileDisplayName?: string): string {
  return userPreferredName ?? profileDisplayName ?? "";
}

export function AssistantIdentityDialog({
  required,
  assistantName,
  userPreferredName,
  profileDisplayName,
  busy,
  serverError,
  onSubmit,
  onClose,
}: AssistantIdentityDialogProps) {
  const [nextAssistantName, setNextAssistantName] = useState(assistantName ?? "");
  const [nextUserPreferredName, setNextUserPreferredName] = useState(
    initialUserName(userPreferredName, profileDisplayName),
  );
  const [clientError, setClientError] = useState<string>();
  const dialogRef = useRef<HTMLElement>(null);
  const assistantNameInputRef = useRef<HTMLInputElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const titleId = "assistant-identity-title";
  const descriptionId = "assistant-identity-description";

  useRootLock(true);

  useLayoutEffect(() => {
    const activeElement = document.activeElement;

    if (
      activeElement instanceof HTMLElement &&
      activeElement !== document.body &&
      !dialogRef.current?.contains(activeElement)
    ) {
      openerRef.current = activeElement;
    }
    assistantNameInputRef.current?.focus();

    return () => {
      if (!required && openerRef.current?.isConnected) openerRef.current.focus();
    };
  }, [required]);

  function close() {
    if (!required && !busy) onClose?.();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      if (!required && !busy) close();
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

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setClientError(undefined);
    const parsed = assistantIdentityNameSchema.safeParse(nextAssistantName);
    if (!parsed.success) {
      setClientError(parsed.error.issues[0]?.message ?? "Enter your assistant's name.");
      return;
    }
    const userName = assistantIdentityNameSchema.safeParse(nextUserPreferredName);
    if (!userName.success) {
      setClientError(
        userName.error.issues[0]?.message ?? "Enter the name your assistant should use.",
      );
      return;
    }
    onSubmit({ assistantName: parsed.data, userPreferredName: userName.data });
  }

  return createPortal(
    <div
      className="modal-backdrop assistant-identity-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <section
        ref={dialogRef}
        className="form-modal assistant-identity-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onKeyDown={handleKeyDown}
      >
        <header className="modal-header assistant-identity-header">
          <div className="assistant-identity-heading">
            <span className="assistant-identity-mark" aria-hidden="true">
              {required ? <Bot size={20} /> : <Pencil size={18} />}
            </span>
            <div>
              <p className="eyebrow">Your financial assistant</p>
              <h2 id={titleId}>
                {required ? "Make this assistant yours" : "Edit assistant names"}
              </h2>
            </div>
          </div>
          {!required && (
            <button
              className="icon-button"
              type="button"
              onClick={close}
              disabled={busy}
              aria-label="Close assistant name editor"
            >
              <X size={19} />
            </button>
          )}
        </header>

        <form className="transaction-form assistant-identity-form" onSubmit={handleSubmit}>
          <p id={descriptionId} className="assistant-identity-intro">
            Choose the names used in your private assistant conversations. You can update them
            anytime.
          </p>
          <label>
            <span>Your assistant&apos;s name</span>
            <input
              ref={assistantNameInputRef}
              value={nextAssistantName}
              onChange={(event) => setNextAssistantName(event.target.value)}
              placeholder="e.g. Aster"
              maxLength={80}
              autoComplete="off"
              required
            />
          </label>
          <label>
            <span>What should your assistant call you?</span>
            <input
              value={nextUserPreferredName}
              onChange={(event) => setNextUserPreferredName(event.target.value)}
              placeholder="e.g. Sam"
              maxLength={80}
              autoComplete="name"
              required
            />
          </label>
          {(clientError || serverError) && (
            <p className="form-error" role="alert">
              {clientError ?? serverError}
            </p>
          )}
          <div className="modal-actions">
            {!required && (
              <button className="button secondary" type="button" onClick={close} disabled={busy}>
                Cancel
              </button>
            )}
            <button className="button primary" type="submit" disabled={busy}>
              {busy ? "Saving…" : required ? "Continue" : "Save changes"}
            </button>
          </div>
        </form>
      </section>
    </div>,
    document.body,
  );
}
