import { LockKeyhole, ShieldCheck, X } from "lucide-react";

import "./cookieConsent.css";

/**
 * The consent banner and preferences dialog as static markup. `src/client/site.ts`
 * shows the banner when this browser has no decision, opens the native dialog
 * from any `[data-cookie-preferences-trigger]`, and records the choice through
 * `@zoption/web-common`, the same record the web app reads.
 */
export function CookieConsent() {
  return (
    <>
      <aside
        className="cookie-consent-banner"
        aria-labelledby="cookie-consent-title"
        aria-describedby="cookie-consent-description"
        data-consent-banner
        hidden
      >
        <div className="cookie-consent-copy">
          <div className="cookie-consent-heading">
            <span className="cookie-consent-icon" aria-hidden="true">
              <ShieldCheck size={20} strokeWidth={2.25} />
            </span>
            <p className="eyebrow">Your privacy choices</p>
          </div>
          <h2 id="cookie-consent-title">Choose what this browser may use</h2>
          <p id="cookie-consent-description">
            Necessary storage keeps Zoption working. Analytics and Marketing are off unless you
            choose otherwise. Read the{" "}
            <a href="/cookie-policy" target="_blank" rel="noopener noreferrer">
              Cookie Policy
            </a>
            .
          </p>
        </div>
        <div className="cookie-consent-actions">
          <button type="button" className="button primary" data-consent-action="accept_all">
            <span>Accept All</span>
          </button>
          <button type="button" className="button primary" data-consent-action="reject_all">
            <span>Reject All</span>
          </button>
          <button type="button" className="button secondary" data-cookie-preferences-trigger>
            <span>Manage Preferences</span>
          </button>
        </div>
      </aside>

      <dialog
        className="cookie-preferences-dialog"
        aria-labelledby="cookie-preferences-title"
        aria-describedby="cookie-preferences-description"
        data-consent-dialog
      >
        <form method="dialog">
          <header className="cookie-preferences-header">
            <div>
              <p className="eyebrow">Privacy controls</p>
              <h2 id="cookie-preferences-title">Cookie and storage preferences</h2>
              <p id="cookie-preferences-description">
                Optional categories stay blocked until you enable them.
              </p>
            </div>
            <button
              type="submit"
              className="icon-button cookie-preferences-close"
              aria-label="Close cookie preferences"
              autoFocus
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
                <p>Supports security, saved privacy choices, and your selected appearance.</p>
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
                </span>
                <p>
                  Cookieless PostHog pageviews and page performance, with no identity or financial
                  detail.
                </p>
              </div>
              <label className="cookie-switch">
                <span className="sr-only">Allow Analytics storage</span>
                <input type="checkbox" data-consent-category="analytics" />
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
                <input type="checkbox" data-consent-category="marketing" />
                <span aria-hidden="true" />
              </label>
            </div>
          </div>

          <p className="cookie-preferences-policy-note">
            Learn what each category covers in the <a href="/cookie-policy">Cookie Policy</a>.
          </p>

          <footer className="cookie-preferences-actions">
            <button type="button" className="button secondary" data-consent-action="reject_all">
              <span>Reject All</span>
            </button>
            <button type="button" className="button secondary" data-consent-action="accept_all">
              <span>Accept All</span>
            </button>
            <button type="button" className="button primary" data-consent-action="custom">
              <span>Save Preferences</span>
            </button>
          </footer>
        </form>
      </dialog>
    </>
  );
}
