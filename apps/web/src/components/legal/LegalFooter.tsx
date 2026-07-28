import { Link } from "react-router-dom";

import { useOptionalCookieConsent } from "../../consent/CookieConsentProvider";
import "./LegalFooter.css";

export function LegalFooter() {
  const consent = useOptionalCookieConsent();

  return (
    <footer className="legal-footer">
      <p>© 2026 Zoption</p>
      <nav aria-label="Legal and privacy">
        <Link to="/terms-of-service">Terms of Service</Link>
        <Link to="/privacy-policy">Privacy Policy</Link>
        <Link to="/cookie-policy">Cookie Policy</Link>
        <button
          type="button"
          data-cookie-preferences-trigger
          onClick={(event) => consent?.openPreferences(event.currentTarget)}
        >
          Cookie Settings
        </button>
      </nav>
    </footer>
  );
}
