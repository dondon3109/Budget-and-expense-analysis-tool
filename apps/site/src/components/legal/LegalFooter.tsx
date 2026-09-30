import { currentRelease } from "@zoption/web-common/releases";
import "./LegalFooter.css";

export function LegalFooter() {
  return (
    <footer className="legal-footer">
      <div className="legal-footer-meta">
        <p>© 2026 Zoption</p>
        <a href="/changelog" className="legal-footer-version">
          v{currentRelease.version} · What’s new
        </a>
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
        <a href="/pricing">Pricing</a>
        <a href="/guides">Guides</a>
        <a href="/tutorials">Tutorials</a>
        <a href="/faq">FAQ</a>
        <a href="/install">Android Beta</a>
        <a href="/changelog">Changelog</a>
        <a href="/terms-of-service">Terms of Service</a>
        <a href="/privacy-policy">Privacy Policy</a>
        <a href="/cookie-policy">Cookie Policy</a>
        <button type="button" data-cookie-preferences-trigger>
          Cookie Settings
        </button>
      </nav>
    </footer>
  );
}
