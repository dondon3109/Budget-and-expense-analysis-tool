import { Camera, CheckSquare, Eye, ShieldCheck, Trash2 } from "lucide-react";

interface ReceiptConsentProps {
  accepting: boolean;
  error?: string;
  onAccept: () => void;
}

export function ReceiptConsent({ accepting, error, onAccept }: ReceiptConsentProps) {
  return (
    <section className="receipt-consent" aria-labelledby="receipt-consent-title">
      <span className="receipt-consent-mark" aria-hidden="true">
        <Camera size={25} />
      </span>
      <p className="eyebrow">One-time opt-in</p>
      <h1 id="receipt-consent-title">Use AI to draft. You approve every field.</h1>
      <p className="receipt-consent-intro">
        Zoption sends only the photo, PDF, or recording you choose to AI during that request to
        draft editable entries. Source files are processed in-flight and discarded immediately —
        they are never stored, kept, or used for anything else. Nothing is added to your budget
        until you confirm it.
      </p>
      <div className="receipt-consent-points">
        <article>
          <CheckSquare size={18} aria-hidden="true" />
          <div>
            <strong>You approve every field</strong>
            <p>
              The suggested entry is shown for review on the same import preview screen. Nothing is
              saved until you confirm it there.
            </p>
          </div>
        </article>
        <article>
          <Trash2 size={18} aria-hidden="true" />
          <div>
            <strong>Source files are never stored</strong>
            <p>
              Your photo, PDF, or recording is used only to extract fields during this request and
              is discarded right after. It is not kept for audit, training, or any other purpose.
            </p>
          </div>
        </article>
        <article>
          <Eye size={18} aria-hidden="true" />
          <div>
            <strong>Stays off until you accept</strong>
            <p>
              AI-assisted entry never runs in the background. Skip this screen and you can keep
              entering transactions or importing CSV and Excel files exactly as before.
            </p>
          </div>
        </article>
        <article>
          <ShieldCheck size={18} aria-hidden="true" />
          <div>
            <strong>Read-only by design</strong>
            <p>The AI drafts an entry and never edits your records on its own.</p>
          </div>
        </article>
      </div>
      <p className="receipt-consent-retention">
        No source-file retention: photos, PDFs, and recordings are never persisted, so there is
        nothing to delete later. Only the transaction you confirm is saved, under the same rules as
        your other records. AI extraction can misread text — always check the amount and date before
        saving.
      </p>
      <button className="button primary" type="button" onClick={onAccept} disabled={accepting}>
        {accepting ? "Enabling AI entry…" : "Accept and enable AI entry"}
      </button>
      {error && <small role="alert">{error}</small>}
    </section>
  );
}
