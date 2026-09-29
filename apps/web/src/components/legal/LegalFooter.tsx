import { Link } from "react-router-dom";

import { useOptionalCookieConsent } from "../../consent/CookieConsentProvider";
import { currentRelease } from "@zoption/web-common/releases";
import { siteUrl } from "../../lib/siteUrl";
import "./LegalFooter.css";

export function LegalFooter() {
  const consent = useOptionalCookieConsent();

  return (
    <footer className="legal-footer">
      <div className="legal-footer-meta">
        <p>© 2026 Zoption</p>
        <Link to={siteUrl("/changelog")} className="legal-footer-version">
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
        <Link to={siteUrl("/pricing")}>Pricing</Link>
        <Link to={siteUrl("/guides")}>Guides</Link>
        <Link to={siteUrl("/tutorials")}>Tutorials</Link>
        <Link to={siteUrl("/faq")}>FAQ</Link>
        <Link to={siteUrl("/install")}>Android Beta</Link>
        <Link to={siteUrl("/changelog")}>Changelog</Link>
        <Link to={siteUrl("/terms-of-service")}>Terms of Service</Link>
        <Link to={siteUrl("/privacy-policy")}>Privacy Policy</Link>
        <Link to={siteUrl("/cookie-policy")}>Cookie Policy</Link>
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
