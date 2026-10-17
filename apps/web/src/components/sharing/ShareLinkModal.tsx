import {
  shareLinkExpiries,
  type ShareLinkCreated,
  type ShareLinkCreateInput,
  type ShareLinkExpiry,
} from "@zoption/shared";
import { Copy, ImageDown, Link2, Share2, X } from "lucide-react";
import { useId, useRef, useState, type FormEvent, type MouseEvent } from "react";
import { createPortal } from "react-dom";

import { useAuth } from "../../auth/AuthProvider";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { useRootLock } from "../../hooks/useRootLock";
import { renderShareImage } from "../../lib/shareImage";
import { userWorkspace } from "../../lib/workspace";
import { useCreateShareLink } from "../../queries/shares";
import { useActiveWorkspace } from "../layout/ActiveWorkspaceProvider";
import { ShareToFamilyForm } from "./ShareToFamilyForm";
// The dialog shares its look with the budget share dialog.
import "../budgets/ShareBudgetModal.css";
import "./ShareToFamilyForm.css";

/** What the dialog shares: one transaction, or one account's balance. */
export type ShareTarget =
  | {
      kind: "transaction";
      id: string;
      label: string;
      hasNote: boolean;
      /** Used to suggest the matching family category. */
      categoryName: string;
      direction: "income" | "expense";
    }
  | { kind: "balance"; id: string; label: string };

interface ShareLinkModalProps {
  target: ShareTarget;
  onClose: () => void;
}

type FieldKey = "description" | "category" | "date" | "note";

const FIELD_LABELS: Record<FieldKey, string> = {
  description: "Description",
  category: "Category",
  date: "Date",
  note: "Note",
};

const EXPIRY_LABELS: Record<ShareLinkExpiry, string> = {
  "24h": "24 hours",
  "7d": "7 days",
  "30d": "30 days",
  never: "Until I turn it off",
};

function firstName(value: unknown): string {
  return typeof value === "string" ? (value.trim().split(/\s+/u)[0] ?? "") : "";
}

/**
 * Creates a public, read-only snapshot link for one transaction or balance. Only the amount is
 * always shown; every other field is opt in, and the snapshot never changes after it is made.
 * A person in a family can instead share into it (`ShareToFamilyForm`).
 */
export function ShareLinkModal({ target, onClose }: ShareLinkModalProps) {
  const { user } = useAuth();
  const workspace = userWorkspace(user!);
  const families = useActiveWorkspace().workspaces.filter(
    (item) => item.kind === "family" && item.role !== "viewer",
  );
  const [destination, setDestination] = useState<"link" | "family">("link");
  const createMutation = useCreateShareLink(workspace);
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState<Record<FieldKey, boolean>>({
    description: false,
    category: true,
    date: true,
    note: false,
  });
  const [sharerName, setSharerName] = useState(() => firstName(user?.user_metadata?.display_name));
  const [expiry, setExpiry] = useState<ShareLinkExpiry>("7d");
  const [created, setCreated] = useState<ShareLinkCreated>();
  const [copied, setCopied] = useState(false);
  const [imageError, setImageError] = useState("");

  useRootLock(true);
  const handleKeyDown = useFocusTrap(dialogRef, { onEscape: onClose });

  const fields = (Object.keys(FIELD_LABELS) as FieldKey[]).filter(
    (field) => field !== "note" || (target.kind === "transaction" && target.hasNote),
  );

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const input: ShareLinkCreateInput =
      target.kind === "transaction"
        ? { kind: "transaction", transactionId: target.id, show, sharerName, expiry }
        : { kind: "balance", accountId: target.id, sharerName, expiry };
    createMutation.mutate(input, { onSuccess: setCreated });
  }

  async function copyLink() {
    if (!created) return;
    await navigator.clipboard.writeText(created.url);
    setCopied(true);
  }

  async function shareLink() {
    if (!created) return;
    try {
      await navigator.share({ url: created.url, title: "Shared on Zoption" });
    } catch {
      // Dismissing the system share sheet rejects; the link is still on screen to copy.
    }
  }

  async function saveImage() {
    if (!created) return;
    setImageError("");
    try {
      const blob = await renderShareImage(created.snapshot, created.sharerName);
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = "zoption-share.png";
      anchor.click();
      URL.revokeObjectURL(href);
    } catch (error) {
      setImageError(error instanceof Error ? error.message : "The image could not be saved.");
    }
  }

  function handleBackdropClick(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) onClose();
  }

  // Portalled so the inert application root from useRootLock does not disable the dialog.
  return createPortal(
    <div className="share-budget-backdrop" role="presentation" onMouseDown={handleBackdropClick}>
      <div
        ref={dialogRef}
        className="share-budget-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onKeyDown={handleKeyDown}
      >
        <header className="share-budget-modal-header">
          <div>
            <p className="share-budget-eyebrow">
              {destination === "family" ? "Family" : "Read-only link"}
            </p>
            <h2 id={titleId}>
              {target.kind === "transaction" ? "Share transaction" : "Share balance"}
            </h2>
            <p id={descriptionId}>
              {destination === "family"
                ? `${target.label}. Only the family you choose sees it.`
                : `${target.label}. Anyone with the link sees a frozen snapshot, never your accounts or other transactions. You can turn the link off in Settings.`}
            </p>
          </div>
          <button className="share-budget-icon-button" type="button" onClick={onClose}>
            <X size={18} aria-hidden="true" />
            <span className="sr-only">Close</span>
          </button>
        </header>

        {families.length > 0 && !created && (
          <div className="share-destination" role="group" aria-label="Share with">
            <button
              type="button"
              aria-pressed={destination === "link"}
              onClick={() => setDestination("link")}
            >
              Public link
            </button>
            <button
              type="button"
              aria-pressed={destination === "family"}
              onClick={() => setDestination("family")}
            >
              Family
            </button>
          </div>
        )}

        {destination === "family" ? (
          <ShareToFamilyForm user={user!} target={target} families={families} onClose={onClose} />
        ) : created ? (
          <section className="share-budget-generated" aria-label="Share link">
            <label className="share-budget-field">
              <span>Link</span>
              <input readOnly value={created.url} onFocus={(event) => event.target.select()} />
            </label>
            <div className="share-budget-actions">
              <button
                className="share-budget-copy-button"
                type="button"
                onClick={() => void copyLink()}
              >
                <Copy size={16} aria-hidden="true" />
                {copied ? "Copied" : "Copy link"}
              </button>
              {"share" in navigator && (
                <button
                  className="share-budget-secondary-button"
                  type="button"
                  onClick={() => void shareLink()}
                >
                  <Share2 size={16} aria-hidden="true" />
                  Share
                </button>
              )}
              <button
                className="share-budget-secondary-button"
                type="button"
                onClick={() => void saveImage()}
              >
                <ImageDown size={16} aria-hidden="true" />
                Save as image
              </button>
            </div>
            {imageError && (
              <p className="share-budget-error" role="alert">
                {imageError}
              </p>
            )}
          </section>
        ) : (
          <form className="share-family-form" onSubmit={handleSubmit}>
            {target.kind === "transaction" && (
              <fieldset className="share-budget-fieldset">
                <legend>Show with the amount</legend>
                <div className="share-budget-category-list">
                  {fields.map((field) => (
                    <label className="share-budget-category-option" key={field}>
                      <input
                        type="checkbox"
                        checked={show[field]}
                        onChange={() =>
                          setShow((current) => ({ ...current, [field]: !current[field] }))
                        }
                      />
                      <span>
                        <strong>{FIELD_LABELS[field]}</strong>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}

            <div className="share-budget-two-column">
              <label className="share-budget-field">
                <span>Your name (optional)</span>
                <input
                  value={sharerName}
                  maxLength={40}
                  onChange={(event) => setSharerName(event.target.value)}
                  placeholder="Shown as “A Zoption user”"
                />
              </label>
              <label className="share-budget-field">
                <span>Link works for</span>
                <select
                  value={expiry}
                  onChange={(event) => setExpiry(event.target.value as ShareLinkExpiry)}
                >
                  {shareLinkExpiries.map((option) => (
                    <option key={option} value={option}>
                      {EXPIRY_LABELS[option]}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {createMutation.error && (
              <p className="share-budget-error" role="alert">
                {createMutation.error.message}
              </p>
            )}

            <footer className="share-budget-actions">
              <button className="share-budget-secondary-button" type="button" onClick={onClose}>
                Cancel
              </button>
              <button
                className="share-budget-primary-button"
                type="submit"
                disabled={createMutation.isPending}
              >
                <Link2 size={16} aria-hidden="true" />
                {createMutation.isPending ? "Creating…" : "Create link"}
              </button>
            </footer>
          </form>
        )}
      </div>
    </div>,
    document.body,
  );
}
