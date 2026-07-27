import { LockKeyhole, ShieldCheck, Sparkles } from "lucide-react";

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
      <p className="eyebrow">Before your first question</p>
      <h1 id="assistant-consent-title">Ask with a clear privacy boundary</h1>
      <p className="assistant-consent-intro">
        Zoption sends your question and only the financial data needed to DeepSeek to prepare an
        answer. Zoption still calculates every amount from your records.
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
            <p>
              Passwords, sign-in tokens, bank credentials, and the DeepSeek key are never shared.
            </p>
          </div>
        </article>
      </div>
      <p className="assistant-consent-retention">
        Chats are kept in your private Zoption history for 90 days unless you delete them sooner.
        AI-generated wording can still be wrong, so verify consequential decisions.
      </p>
      <button className="button primary" type="button" onClick={onAccept} disabled={accepting}>
        {accepting ? "Enabling assistant…" : "Accept and continue"}
      </button>
      {error && <small role="alert">{error}</small>}
    </section>
  );
}
