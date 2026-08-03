import { useState } from "react";
import { Link } from "react-router-dom";

import { useOptionalCookieConsent } from "../../consent/CookieConsentProvider";
import { currentRelease } from "../../releases/currentRelease";
import { ReleaseNotesDialog } from "../releases/ReleaseNotesDialog";
import "./LegalFooter.css";

export function LegalFooter() {
  const consent = useOptionalCookieConsent();
  const [viewingRelease, setViewingRelease] = useState(false);

  return (
    <>
      <footer className="legal-footer">
        <div className="legal-footer-meta">
          <p>© 2026 Zoption</p>
          <button
            type="button"
            className="legal-footer-version"
            onClick={() => setViewingRelease(true)}
          >
            v{currentRelease.version} · What’s new
          </button>
        </div>
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
      {viewingRelease && (
        <ReleaseNotesDialog
          release={currentRelease}
          onAcknowledge={() => setViewingRelease(false)}
        />
      )}
    </>
  );
}
