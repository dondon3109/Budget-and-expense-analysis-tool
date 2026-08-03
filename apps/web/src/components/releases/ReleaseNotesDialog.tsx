import { CheckCircle2, X } from "lucide-react";
import { useLayoutEffect, useRef, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";

import type { ProductRelease } from "../../releases/currentRelease";

import "./releaseNotes.css";

interface ReleaseNotesDialogProps {
  release: ProductRelease;
  onAcknowledge: () => void;
}

export function ReleaseNotesDialog({ release, onAcknowledge }: ReleaseNotesDialogProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const root = document.getElementById("root");
    const previousBodyOverflow = document.body.style.overflow;
    const previousAriaHidden = root?.getAttribute("aria-hidden") ?? null;
    const previousInert = root?.inert ?? false;
    const activeElement = document.activeElement;

    if (
      activeElement instanceof HTMLElement &&
      activeElement !== document.body &&
      !dialogRef.current?.contains(activeElement)
    ) {
      previousFocusRef.current = activeElement;
    }

    if (root) {
      root.inert = true;
      root.setAttribute("aria-hidden", "true");
    }
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    return () => {
      if (root) {
        root.inert = previousInert;
        if (previousAriaHidden === null) root.removeAttribute("aria-hidden");
        else root.setAttribute("aria-hidden", previousAriaHidden);
      }
      document.body.style.overflow = previousBodyOverflow;

      if (previousFocusRef.current?.isConnected) {
        previousFocusRef.current.focus({ preventScroll: true });
      }
    };
  }, []);

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onAcknowledge();
      return;
    }
    if (event.key !== "Tab") return;

    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
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
    <div className="release-notes-layer">
      <div className="release-notes-backdrop" aria-hidden="true" onClick={onAcknowledge} />
      <section
        ref={dialogRef}
        className="release-notes-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="release-notes-title"
        aria-describedby="release-notes-description"
        onKeyDown={handleKeyDown}
      >
        <header className="release-notes-header">
          <div>
            <p className="eyebrow">What’s new</p>
            <h2 id="release-notes-title">Zoption {release.version}</h2>
            <p id="release-notes-description">Released {release.releasedOn}</p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className="icon-button release-notes-close"
            aria-label="Close release notes"
            onClick={onAcknowledge}
          >
            <X size={19} aria-hidden="true" />
          </button>
        </header>

        <ul className="release-notes-list">
          {release.changes.map((change) => (
            <li key={change.title}>
              <CheckCircle2 size={18} aria-hidden="true" />
              <div>
                <strong>{change.title}</strong>
                <p>{change.description}</p>
              </div>
            </li>
          ))}
        </ul>

        <footer className="release-notes-actions">
          <button type="button" className="button primary" onClick={onAcknowledge}>
            Got it
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
