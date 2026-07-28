import { Link } from "react-router-dom";

import { useCookieConsent } from "../../consent/CookieConsentProvider";
import { useTheme } from "../../theme/ThemeProvider";

export function CookieConsentBanner() {
  const { hasThemePreference } = useTheme();
  const { hasDecision, preferencesOpen, acceptAll, rejectAll, openPreferences } =
    useCookieConsent();

  if (!hasThemePreference || hasDecision || preferencesOpen) return null;

  return (
    <aside
      className="cookie-consent-banner"
      aria-labelledby="cookie-consent-title"
      aria-describedby="cookie-consent-description"
    >
      <div className="cookie-consent-copy">
        <p className="eyebrow">Your privacy choices</p>
        <h2 id="cookie-consent-title">Choose what this browser may use</h2>
        <p id="cookie-consent-description">
          Necessary storage keeps Zoption working. Analytics and Marketing are off unless you choose
          otherwise, and neither category currently has a provider connected. Read the{" "}
          <Link to="/cookie-policy">Cookie Policy</Link>.
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
  );
}
