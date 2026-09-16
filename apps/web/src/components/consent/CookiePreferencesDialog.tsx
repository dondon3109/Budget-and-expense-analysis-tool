import { LockKeyhole, X } from "lucide-react";
import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";

import { useCookieConsent } from "../../consent/CookieConsentProvider";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { useRootLock } from "../../hooks/useRootLock";

/**
 * The open dialog is a separate component so it mounts together with its markup:
 * useFocusTrap focuses and traps on mount, which cannot happen while the dialog
 * markup is still behind an early return.
 */
export function CookiePreferencesDialog() {
  const { preferencesOpen } = useCookieConsent();

  if (!preferencesOpen) return null;

  return <CookiePreferencesDialogContent />;
}

function CookiePreferencesDialogContent() {
  const { preferences, acceptAll, rejectAll, savePreferences, closePreferences } =
    useCookieConsent();
  const [analytics, setAnalytics] = useState(preferences.analytics);
  const [marketing, setMarketing] = useState(preferences.marketing);
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useRootLock(true);

  const handleDialogKeyDown = useFocusTrap(dialogRef, {
    onEscape: closePreferences,
    initialFocusRef: closeButtonRef,
  });

  return createPortal(
    <div className="cookie-preferences-layer">
      <div
        className="cookie-preferences-backdrop"
        aria-hidden="true"
        onClick={() => closePreferences()}
      />
      <section
        ref={dialogRef}
        className="cookie-preferences-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cookie-preferences-title"
        aria-describedby="cookie-preferences-description"
        onKeyDown={handleDialogKeyDown}
      >
        <header className="cookie-preferences-header">
          <div>
            <p className="eyebrow">Privacy controls</p>
            <h2 id="cookie-preferences-title">Cookie and storage preferences</h2>
            <p id="cookie-preferences-description">
              Optional categories stay blocked until you enable them. No Analytics or Marketing
              provider is currently active.
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className="icon-button cookie-preferences-close"
            aria-label="Close cookie preferences"
            onClick={() => closePreferences()}
          >
            <X size={19} aria-hidden="true" />
          </button>
        </header>

        <div className="cookie-preference-list">
          <div className="cookie-preference-row">
            <div className="cookie-preference-copy">
              <span className="cookie-preference-title">
                <LockKeyhole size={17} aria-hidden="true" />
                <strong>Necessary</strong>
                <small>Always on</small>
              </span>
              <p>
                Supports security, sign-in, saved privacy choices, and your selected appearance.
              </p>
            </div>
            <label className="cookie-switch">
              <span className="sr-only">Necessary storage is always on</span>
              <input type="checkbox" checked disabled readOnly />
              <span aria-hidden="true" />
            </label>
          </div>

          <div className="cookie-preference-row">
            <div className="cookie-preference-copy">
              <span className="cookie-preference-title">
                <strong>Analytics</strong>
                <small>No provider connected</small>
              </span>
              <p>Would help measure product usage and performance if a provider is added later.</p>
            </div>
            <label className="cookie-switch">
              <span className="sr-only">Allow Analytics storage</span>
              <input
                type="checkbox"
                checked={analytics}
                onChange={(event) => setAnalytics(event.target.checked)}
              />
              <span aria-hidden="true" />
            </label>
          </div>

          <div className="cookie-preference-row">
            <div className="cookie-preference-copy">
              <span className="cookie-preference-title">
                <strong>Marketing</strong>
                <small>No provider connected</small>
              </span>
              <p>Would support advertising or campaign measurement if Zoption adds it later.</p>
            </div>
            <label className="cookie-switch">
              <span className="sr-only">Allow Marketing storage</span>
              <input
                type="checkbox"
                checked={marketing}
                onChange={(event) => setMarketing(event.target.checked)}
              />
              <span aria-hidden="true" />
            </label>
          </div>
        </div>

        <p className="cookie-preferences-policy-note">
          Learn what each category covers in the{" "}
          <Link to="/cookie-policy" onClick={() => closePreferences()}>
            Cookie Policy
          </Link>
          .
        </p>

        <footer className="cookie-preferences-actions">
          <button type="button" className="button secondary" onClick={rejectAll}>
            <span>Reject All</span>
          </button>
          <button type="button" className="button secondary" onClick={acceptAll}>
            <span>Accept All</span>
          </button>
          <button
            type="button"
            className="button primary"
            onClick={() => savePreferences({ analytics, marketing })}
          >
            <span>Save Preferences</span>
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
