import { CheckCircle2, ChevronDown, ChevronUp, X } from "lucide-react";
import { useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";

import type { ProductRelease } from "../../releases/currentRelease";

import "./releaseNotes.css";

interface ReleaseNotesDialogProps {
  releases: readonly ProductRelease[];
  onAcknowledge: () => void;
}

export function ReleaseNotesDialog({ releases, onAcknowledge }: ReleaseNotesDialogProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const latest = releases[0];
  const previousReleases = releases.slice(1);
  const [showPrevious, setShowPrevious] = useState(false);

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

  if (!latest || releases.length === 0) return null;

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
            <h2 id="release-notes-title">Zoption {latest.version}</h2>
            <p id="release-notes-description">Released {latest.releasedOn}</p>
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

        <div className="release-notes-list">
          <section className="release-notes-release" aria-label={`Version ${latest.version}`}>
            <ul className="release-notes-changes">
              {latest.changes.map((change) => (
                <li key={change.title}>
                  <CheckCircle2 size={18} aria-hidden="true" />
                  <div>
                    <strong>{change.title}</strong>
                    <p>{change.description}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          {previousReleases.length > 0 && (
            <button
              type="button"
              className="release-notes-toggle"
              aria-expanded={showPrevious}
              aria-controls="release-notes-history"
              onClick={() => setShowPrevious((value) => !value)}
            >
              {showPrevious ? (
                <>
                  <ChevronUp size={16} aria-hidden="true" />
                  Hide previous updates
                </>
              ) : (
                <>
                  <ChevronDown size={16} aria-hidden="true" />
                  Show previous updates
                </>
              )}
            </button>
          )}

          {showPrevious && (
            <div id="release-notes-history" className="release-notes-history">
              {previousReleases.map((release) => (
                <section
                  key={release.version}
                  className="release-notes-release"
                  aria-label={`Previous version ${release.version}`}
                >
                  <header className="release-notes-release-heading">
                    <h3>v{release.version}</h3>
                    <span>Released {release.releasedOn}</span>
                  </header>
                  <ul className="release-notes-changes">
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
                </section>
              ))}
            </div>
          )}
        </div>

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
