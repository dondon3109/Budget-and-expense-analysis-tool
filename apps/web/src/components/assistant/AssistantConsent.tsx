import { FileClock, LockKeyhole, ShieldCheck, Sparkles } from "lucide-react";

interface AssistantConsentProps {
  accepting: boolean;
  error?: string;
  onAccept: () => void;
}

export function AssistantConsent({ accepting, error, onAccept }: AssistantConsentProps) {
  return (
    <section className="assistant-consent" aria-labelledby="assistant-consent-title">
      <span className="assistant-consent-mark" aria-hidden="true">
        <Sparkles size={25} />
      </span>
      <p className="eyebrow">Before your next question</p>
      <h1 id="assistant-consent-title">Your data, your boundaries. Private by default.</h1>
      <p className="assistant-consent-intro">
        Zoption sends your question and only the financial data needed to the AI provider to prepare
        an answer. Zoption resolves dates and calculates every personalized amount on its own
        servers.
      </p>
      <div className="assistant-consent-points">
        <article>
          <ShieldCheck size={18} aria-hidden="true" />
          <div>
            <strong>Read-only by design</strong>
            <p>The assistant cannot create, edit, delete, import, or transfer your records.</p>
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
          <FileClock size={18} aria-hidden="true" />
          <div>
            <strong>Sanitized audit snapshots</strong>
            <p>
              Zoption keeps validated tool inputs and compact results so answers can be traced and
              checked. User and tenant IDs, notes, secrets, and provider payloads are excluded.
            </p>
          </div>
        </article>
      </div>
      <p className="assistant-consent-retention">
        Chats and sanitized audit snapshots are kept in your private Zoption history for up to 90
        days and are deleted with the conversation. AI-generated wording can still be wrong, so
        verify consequential decisions.
      </p>
      <p className="assistant-consent-scope">
        Educational budgeting information only. Zoption does not provide personalized financial,
        investment, tax, legal, or insurance advice.
      </p>
      <button className="button primary" type="button" onClick={onAccept} disabled={accepting}>
        {accepting ? "Enabling assistant…" : "Accept and continue"}
      </button>
      {error && <small role="alert">{error}</small>}
    </section>
  );
}
