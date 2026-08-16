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
      <h1 id="receipt-consent-title">Snap a receipt. You approve every field.</h1>
      <p className="receipt-consent-intro">
        Zoption sends only the photo you choose to a vision model to read the merchant, amount,
        date, and a suggested category. The photo is processed in-flight and discarded immediately —
        it is never stored, kept, or used for anything else. Nothing is added to your budget until
        you confirm it.
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
            <strong>Photos are never stored</strong>
            <p>
              Your photo is used only to extract fields during this request and is discarded right
              after. It is not kept for audit, training, or any other purpose.
            </p>
          </div>
        </article>
        <article>
          <Eye size={18} aria-hidden="true" />
          <div>
            <strong>Stays off until you accept</strong>
            <p>
              Receipt scanning never runs in the background. Skip this screen and you can keep
              importing CSV or Excel files exactly as before.
            </p>
          </div>
        </article>
        <article>
          <ShieldCheck size={18} aria-hidden="true" />
          <div>
            <strong>Read-only by design</strong>
            <p>
              The AI reads your photo to draft an entry and never edits your records on its own.
            </p>
          </div>
        </article>
      </div>
      <p className="receipt-consent-retention">
        No photo retention: images are never persisted, so there is nothing to delete later. Only
        the transaction you confirm is saved, under the same rules as your other records. AI
        extraction can misread text — always check the amount and date before saving.
      </p>
      <button className="button primary" type="button" onClick={onAccept} disabled={accepting}>
        {accepting ? "Enabling receipt scanning…" : "Accept and enable receipt scanning"}
      </button>
      {error && <small role="alert">{error}</small>}
    </section>
  );
}
