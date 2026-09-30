import { BookOpenText, Bug, Check, Copy, Mail, MessageCircleQuestion } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import { openSupportChat } from "../support/supportEvents";
import { siteUrl } from "../../lib/siteUrl";

const SUPPORT_EMAIL = "support@zoption.site";

/** Links to the FAQ, Zoption Support, bug reports, and the support email address. */
export function HelpAndContactSettings() {
  const [contactFeedback, setContactFeedback] = useState<string>();
  const [contactCopyState, setContactCopyState] = useState<
    "idle" | "copying" | "copied" | "unavailable"
  >("idle");

  async function handleCopySupportEmail() {
    if (!navigator.clipboard?.writeText) {
      setContactCopyState("unavailable");
      setContactFeedback(`Select and copy ${SUPPORT_EMAIL} manually.`);
      return;
    }

    setContactCopyState("copying");
    setContactFeedback("Copying support email…");
    try {
      await navigator.clipboard.writeText(SUPPORT_EMAIL);
      setContactCopyState("copied");
      setContactFeedback(`Copied ${SUPPORT_EMAIL}. Paste it into the To field in your email app.`);
    } catch {
      setContactCopyState("unavailable");
      setContactFeedback(`Select and copy ${SUPPORT_EMAIL} manually.`);
    }
  }

  return (
    <section
      id="help-and-contact"
      className="settings-section"
      aria-labelledby="help-and-contact-title"
      tabIndex={-1}
    >
      <div className="settings-section-heading">
        <div>
          <h2 id="help-and-contact-title">Help &amp; contact</h2>
          <p>Find an answer, ask for product guidance, or contact the Zoption team.</p>
        </div>
        <span>Support options</span>
      </div>

      <ul className="settings-support-list">
        <li id="help" className="settings-support-item" tabIndex={-1}>
          <BookOpenText size={21} aria-hidden="true" />
          <div>
            <strong>Help</strong>
            <p>Browse clear answers about accounts, imports, privacy, plans, and the app.</p>
          </div>
          <Link className="button secondary compact" to={siteUrl("/faq")}>
            Browse FAQ
          </Link>
        </li>
        <li className="settings-support-item">
          <MessageCircleQuestion size={21} aria-hidden="true" />
          <div>
            <strong>Zoption Support</strong>
            <p>
              Ask how a feature works or prepare a bug report. Support cannot see your financial
              data, and no report is saved before you confirm it.
            </p>
          </div>
          <button className="button secondary compact" type="button" onClick={openSupportChat}>
            Ask Zoption
          </button>
        </li>
        <li className="settings-support-item">
          <Bug size={21} aria-hidden="true" />
          <div>
            <strong>Bug reports</strong>
            <p>Review the status of reports you explicitly submitted through Zoption Support.</p>
          </div>
          <Link className="button secondary compact" to="/app/support/reports">
            View reports
          </Link>
        </li>
        <li id="contact" className="settings-support-item" tabIndex={-1}>
          <Mail size={21} aria-hidden="true" />
          <div>
            <strong>Contact</strong>
            <p>
              Copy <span className="settings-support-email">{SUPPORT_EMAIL}</span>, then paste it
              into any email app when you need help the product guide cannot resolve.
            </p>
            {contactFeedback && (
              <p id="contact-email-feedback" className="settings-contact-feedback" role="status">
                {contactFeedback}
              </p>
            )}
          </div>
          <button
            className="button secondary compact"
            type="button"
            disabled={contactCopyState === "copying"}
            aria-describedby={contactFeedback ? "contact-email-feedback" : undefined}
            onClick={() => void handleCopySupportEmail()}
          >
            {contactCopyState === "copied" ? (
              <Check size={15} aria-hidden="true" />
            ) : (
              <Copy size={15} aria-hidden="true" />
            )}
            {contactCopyState === "copying"
              ? "Copying…"
              : contactCopyState === "copied"
                ? "Email copied"
                : "Copy email address"}
          </button>
        </li>
      </ul>
    </section>
  );
}
