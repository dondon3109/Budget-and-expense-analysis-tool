import { createSharedBudgetPayload, encodeSharedBudgetToken } from "@zoption/shared";
import { Copy, Link2, X } from "lucide-react";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent,
} from "react";

import { formatFullMonth, formatMoney } from "../../lib/formatters";
import "./ShareBudgetModal.css";

interface ShareBudgetCategory {
  id: string;
  name: string;
  color?: string;
  allocatedLimitMinor: number;
  spentMinor: number;
}

interface ShareBudgetModalProps {
  isOpen: boolean;
  onClose: () => void;
  month: string;
  categories: ShareBudgetCategory[];
}

type ExpirationOption = "7" | "30" | "none";

function displayMonth(month: string): string {
  return /^\d{4}-\d{2}$/u.test(month) ? formatFullMonth(month) : month;
}

function defaultShareTitle(month: string): string {
  return `Family Budget - ${displayMonth(month)}`;
}

function shareUrlForToken(token: string): string {
  const path = `/shared/budget/${encodeURIComponent(token)}`;
  if (typeof window === "undefined") return path;
  return `${window.location.origin}${path}`;
}

export function ShareBudgetModal({ isOpen, onClose, month, categories }: ShareBudgetModalProps) {
  const titleId = useId();
  const descriptionId = useId();
  const titleInputRef = useRef<HTMLInputElement>(null);
  const linkInputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState(defaultShareTitle(month));
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>(() =>
    categories.map((category) => category.id),
  );
  const [expiration, setExpiration] = useState<ExpirationOption>("30");
  const [ownerDisplayName, setOwnerDisplayName] = useState("");
  const [notes, setNotes] = useState("");
  const [generatedLink, setGeneratedLink] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    setTitle(defaultShareTitle(month));
    setSelectedCategoryIds(categories.map((category) => category.id));
    setExpiration("30");
    setOwnerDisplayName("");
    setNotes("");
    setGeneratedLink("");
    setCopied(false);
    setError("");
    window.setTimeout(() => titleInputRef.current?.focus(), 0);
  }, [categories, isOpen, month]);

  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const selectedCategories = useMemo(
    () => categories.filter((category) => selectedCategoryIds.includes(category.id)),
    [categories, selectedCategoryIds],
  );

  const totalSelectedMinor = selectedCategories.reduce(
    (total, category) => total + category.allocatedLimitMinor,
    0,
  );

  if (!isOpen) return null;

  function toggleCategory(categoryId: string) {
    setGeneratedLink("");
    setCopied(false);
    setSelectedCategoryIds((current) =>
      current.includes(categoryId)
        ? current.filter((id) => id !== categoryId)
        : [...current, categoryId],
    );
  }

  function handleBackdropClick(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) onClose();
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setCopied(false);
    if (selectedCategories.length === 0) {
      setError("Choose at least one envelope to share.");
      return;
    }

    const payload = createSharedBudgetPayload({
      title: title.trim() || defaultShareTitle(month),
      month,
      categories: selectedCategories,
      ...(ownerDisplayName.trim() ? { ownerDisplayName: ownerDisplayName.trim() } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
      ...(expiration === "none" ? {} : { expiresInDays: Number(expiration) }),
    });
    setGeneratedLink(shareUrlForToken(encodeSharedBudgetToken(payload)));
  }

  async function copyLink() {
    if (!generatedLink) return;
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(generatedLink);
    } else {
      linkInputRef.current?.select();
      document.execCommand("copy");
    }
    setCopied(true);
  }

  return (
    <div className="share-budget-backdrop" role="presentation" onMouseDown={handleBackdropClick}>
      <form
        className="share-budget-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onSubmit={handleSubmit}
      >
        <header className="share-budget-modal-header">
          <div>
            <p className="share-budget-eyebrow">Read-only sharing</p>
            <h2 id={titleId}>Share envelopes</h2>
            <p id={descriptionId}>
              Generate a private snapshot link for family or collaborators. Only selected envelope
              totals are included.
            </p>
          </div>
          <button className="share-budget-icon-button" type="button" onClick={onClose}>
            <X size={18} aria-hidden="true" />
            <span className="sr-only">Close share budget modal</span>
          </button>
        </header>

        <label className="share-budget-field">
          <span>Share title</span>
          <input
            ref={titleInputRef}
            value={title}
            onChange={(event) => {
              setGeneratedLink("");
              setCopied(false);
              setTitle(event.target.value);
            }}
          />
        </label>

        <fieldset className="share-budget-fieldset">
          <legend>Envelopes to include</legend>
          <div className="share-budget-category-list">
            {categories.map((category) => {
              const checked = selectedCategoryIds.includes(category.id);
              return (
                <label className="share-budget-category-option" key={category.id}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleCategory(category.id)}
                  />
                  <span className="share-budget-color" style={{ background: category.color }} />
                  <span>
                    <strong>{category.name}</strong>
                    <small>
                      {formatMoney(category.spentMinor)} spent of {formatMoney(category.allocatedLimitMinor)}
                    </small>
                  </span>
                </label>
              );
            })}
          </div>
          <p>
            {selectedCategories.length} selected · {formatMoney(totalSelectedMinor)} total envelope budget
          </p>
        </fieldset>

        <label className="share-budget-field">
          <span>Link expiration</span>
          <select
            value={expiration}
            onChange={(event) => {
              setGeneratedLink("");
              setCopied(false);
              setExpiration(event.target.value as ExpirationOption);
            }}
          >
            <option value="7">7 days</option>
            <option value="30">30 days</option>
            <option value="none">No expiration</option>
          </select>
        </label>

        <div className="share-budget-two-column">
          <label className="share-budget-field">
            <span>Owner display name (optional)</span>
            <input
              value={ownerDisplayName}
              onChange={(event) => {
                setGeneratedLink("");
                setCopied(false);
                setOwnerDisplayName(event.target.value);
              }}
              placeholder="Family name or nickname"
            />
          </label>
          <label className="share-budget-field">
            <span>Notes (optional)</span>
            <input
              value={notes}
              onChange={(event) => {
                setGeneratedLink("");
                setCopied(false);
                setNotes(event.target.value);
              }}
              placeholder="Short context for viewers"
            />
          </label>
        </div>

        {error && (
          <p className="share-budget-error" role="alert">
            {error}
          </p>
        )}

        {generatedLink && (
          <section className="share-budget-generated" aria-label="Generated share link">
            <label className="share-budget-field">
              <span>Read-only link</span>
              <input ref={linkInputRef} readOnly value={generatedLink} onFocus={(event) => event.target.select()} />
            </label>
            <button className="share-budget-copy-button" type="button" onClick={() => void copyLink()}>
              <Copy size={16} aria-hidden="true" />
              {copied ? "Copied" : "Copy Link"}
            </button>
          </section>
        )}

        <footer className="share-budget-actions">
          <button className="share-budget-secondary-button" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="share-budget-primary-button" type="submit">
            <Link2 size={16} aria-hidden="true" />
            Generate link
          </button>
        </footer>
      </form>
    </div>
  );
}
