import { CheckCircle2, ChevronDown, ChevronUp, X } from "lucide-react";
import { useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useFocusTrap } from "../../hooks/useFocusTrap";
import { useRootLock } from "../../hooks/useRootLock";
import type { ProductRelease } from "../../releases/currentRelease";

import "./releaseNotes.css";

interface ReleaseNotesDialogProps {
  releases: readonly ProductRelease[];
  onAcknowledge: () => void;
}

interface ReleaseNotesDialogContentProps {
  latest: ProductRelease;
  previousReleases: readonly ProductRelease[];
  onAcknowledge: () => void;
}

function ReleaseNotesDialogContent({
  latest,
  previousReleases,
  onAcknowledge,
}: ReleaseNotesDialogContentProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [showPrevious, setShowPrevious] = useState(false);

  useRootLock(true);

  const handleKeyDown = useFocusTrap(dialogRef, {
    initialFocusRef: closeButtonRef,
    onEscape: onAcknowledge,
  });

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

/** Mounts the dialog only while a release exists so the mount-only focus trap activates. */
export function ReleaseNotesDialog({ releases, onAcknowledge }: ReleaseNotesDialogProps) {
  const latest = releases[0];
  if (!latest || releases.length === 0) return null;

  return (
    <ReleaseNotesDialogContent
      latest={latest}
      previousReleases={releases.slice(1)}
      onAcknowledge={onAcknowledge}
    />
  );
}
