import { ShieldCheck } from "lucide-react";
import { Link, useLocation } from "react-router-dom";

import { useCookieConsent } from "../../consent/CookieConsentProvider";
import { useTheme } from "../../theme/ThemeProvider";

export function CookieConsentBanner() {
  const location = useLocation();
  const { hasThemePreference } = useTheme();
  const { hasDecision, preferencesOpen, acceptAll, rejectAll, openPreferences } =
    useCookieConsent();

  if (
    !hasThemePreference ||
    hasDecision ||
    preferencesOpen ||
    ["/cookie-policy", "/privacy-policy", "/terms-of-service"].includes(location.pathname)
  ) {
    return null;
  }

  return (
    <>
      <div className="cookie-consent-backdrop" aria-hidden="true" />
      <aside
        className="cookie-consent-banner"
        aria-labelledby="cookie-consent-title"
        aria-describedby="cookie-consent-description"
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
            Necessary storage keeps Zoption working. Analytics and Marketing are off unless you choose
            otherwise, and neither category currently has a provider connected. Read the{" "}
            <Link to="/cookie-policy" target="_blank" rel="noopener noreferrer">
              Cookie Policy
            </Link>.
          </p>
        </div>
        <div className="cookie-consent-actions">
          <button type="button" className="button primary" onClick={acceptAll}>
            Accept All
          </button>
          <button type="button" className="button primary" onClick={rejectAll}>
            Reject All
          </button>
          <button
            type="button"
            className="button secondary"
            data-cookie-preferences-trigger
            onClick={(event) => openPreferences(event.currentTarget)}
          >
            Manage Preferences
          </button>
        </div>
      </aside>
    </>
  );
}
