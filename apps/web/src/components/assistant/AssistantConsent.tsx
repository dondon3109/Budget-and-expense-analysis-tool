import { Activity, Brain, LockKeyhole, ShieldCheck, Sparkles } from "lucide-react";

import { captureFunnelEvent } from "../../analytics/funnel";
import { siteUrl } from "../../lib/siteUrl";

interface AssistantConsentProps {
  accepting: boolean;
  error?: string;
  onAccept: () => void | Promise<unknown>;
}

export function AssistantConsent({ accepting, error, onAccept }: AssistantConsentProps) {
  // The consent step is recorded only once the grant resolves, so a failed grant
  // shows the page error without counting as consent.
  async function accept() {
    try {
      await onAccept();
    } catch {
      return;
    }
    captureFunnelEvent("assistant_consent_granted", {});
  }

  return (
    <section className="assistant-consent" aria-labelledby="assistant-consent-title">
      <span className="assistant-consent-mark" aria-hidden="true">
        <Sparkles size={25} />
      </span>
      <p className="eyebrow">Before your next question</p>
      <h1 id="assistant-consent-title">Your data, your boundaries. Private by default.</h1>
      <p className="assistant-consent-intro">
        Zoption sends your question and only the financial data needed to your configured AI
        provider. Every personalized amount is calculated on Zoption&apos;s own servers.
      </p>
      <div className="assistant-consent-points">
        <article>
          <ShieldCheck size={18} aria-hidden="true" />
          <div>
            <strong>Nothing saves without you</strong>
            <p>
              The assistant can draft changes, but only your Save or Confirm tap applies one. It
              cannot import or transfer your records.
            </p>
          </div>
        </article>
        <article>
          <LockKeyhole size={18} aria-hidden="true" />
          <div>
            <strong>Credentials stay private</strong>
            <p>Passwords, sign-in tokens, bank credentials, and private notes are never shared.</p>
          </div>
        </article>
        <article>
          <Activity size={18} aria-hidden="true" />
          <div>
            <strong>Metadata-only monitoring</strong>
            <p>
              PostHog receives operational metadata only, never your questions, answers, or
              financial data.
            </p>
          </div>
        </article>
        <article>
          <Brain size={18} aria-hidden="true" />
          <div>
            <strong>Memory you control</strong>
            <p>
              Zoption may remember preferences you share, like which debt to pay first. Clear it
              anytime from the Memory panel.
            </p>
          </div>
        </article>
      </div>
      <p className="assistant-consent-retention">
        Chats and their sanitized audit snapshots expire 90 days after the last message. Full
        details on audit snapshots, monitoring, and retention are in our{" "}
        <a href={siteUrl("/privacy-policy")} target="_blank" rel="noopener noreferrer">
          Privacy Policy
        </a>
        .
      </p>
      <p className="assistant-consent-scope">
        Educational budgeting information only, not personalized financial, investment, tax, legal,
        or insurance advice. AI wording can be wrong, so verify consequential decisions.
      </p>
      <button
        className="button primary"
        type="button"
        onClick={() => void accept()}
        disabled={accepting}
      >
        {accepting ? "Enabling assistant…" : "Accept and continue"}
      </button>
      {error && <small role="alert">{error}</small>}
    </section>
  );
}
