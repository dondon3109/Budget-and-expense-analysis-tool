import { Link } from "react-router-dom";

import { useOptionalCookieConsent } from "../../consent/CookieConsentProvider";
import { currentRelease } from "../../releases/currentRelease";
import "./LegalFooter.css";

export function LegalFooter() {
  const consent = useOptionalCookieConsent();

  return (
    <footer className="legal-footer">
      <div className="legal-footer-meta">
        <p>© 2026 Zoption</p>
        <Link to="/changelog" className="legal-footer-version">
          v{currentRelease.version} · What’s new
        </Link>
      </div>
      <nav aria-label="Legal and privacy">
        <a
          href="https://www.google.com/preferences/source?q=zoption.site"
          target="_blank"
          rel="noopener noreferrer"
          className="legal-footer-preferred"
          title="Add Zoption as a Preferred Source on Google Search"
        >
          Google Preferred Source
        </a>
        <Link to="/pricing">Pricing</Link>
        <Link to="/guides">Guides</Link>
        <Link to="/faq">FAQ</Link>
        <Link to="/install">Android Beta</Link>
        <Link to="/changelog">Changelog</Link>
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
