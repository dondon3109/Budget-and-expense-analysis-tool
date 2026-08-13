import {
  CURRENT_RECEIPT_CONSENT_VERSION,
  parseAmountToMinor,
  transactionKinds,
  type CategoryRecord,
  type ReceiptDraft,
  type TransactionKind,
} from "@zoption/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, LoaderCircle, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";

import { extractReceipt, getReceiptPreferences, grantReceiptConsent } from "../../lib/api";
import { queryKeys } from "../../lib/queryKeys";
import type { AuthenticatedWorkspace } from "../../lib/workspace";
import { ReceiptConsent } from "./ReceiptConsent";
import "./receipts.css";

export interface ReceiptEntryDraft {
  merchant: string;
  date: string;
  amountMinor: number;
  kind: TransactionKind;
  categoryId: string;
  categoryName: string;
}

interface ReceiptEntryProps {
  workspace: AuthenticatedWorkspace;
  categories: CategoryRecord[];
  onContinue: (draft: ReceiptEntryDraft) => void;
}

function uncategorizedCategory(
  categories: CategoryRecord[],
  kind: TransactionKind,
): CategoryRecord | undefined {
  return categories.find(
    (category) =>
      category.system &&
      category.kind === kind &&
      category.name.toLocaleLowerCase("en") === "uncategorized",
  );
}

function matchedCategory(
  categories: CategoryRecord[],
  kind: TransactionKind,
  name?: string,
): CategoryRecord | undefined {
  if (!name) return undefined;
  const normalized = name.toLocaleLowerCase("en");
  return categories.find(
    (category) =>
      !category.archived &&
      !category.locked &&
      category.kind === kind &&
      category.name.toLocaleLowerCase("en") === normalized,
  );
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function ReceiptEntry({ workspace, categories, onContinue }: ReceiptEntryProps) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [imageFile, setImageFile] = useState<File>();
  const [imageUrl, setImageUrl] = useState<string>();
  const [draft, setDraft] = useState<ReceiptDraft>();
  const [merchant, setMerchant] = useState("");
  const [date, setDate] = useState("");
  const [amountText, setAmountText] = useState("");
  const [kind, setKind] = useState<TransactionKind>("expense");
  const [categoryId, setCategoryId] = useState("");
  const [amountError, setAmountError] = useState<string>();
  const [categoryError, setCategoryError] = useState<string>();

  const preferencesQuery = useQuery({
    queryKey: queryKeys.receiptPreferences(workspace),
    queryFn: () => getReceiptPreferences(workspace),
    retry: false,
  });
  const consentMutation = useMutation({
    mutationFn: () => grantReceiptConsent(workspace),
    onSuccess: (preferences) => {
      queryClient.setQueryData(queryKeys.receiptPreferences(workspace), preferences);
    },
  });
  const extractionMutation = useMutation({
    mutationFn: (file: File) => extractReceipt(workspace, file),
    onSuccess: (extracted) => {
      setDraft(extracted);
      setMerchant(extracted.merchant);
      setDate(extracted.date);
      setAmountText((Math.abs(extracted.amountMinor) / 100).toFixed(2));
      setKind(extracted.kind);
      const category =
        matchedCategory(categories, extracted.kind, extracted.categoryName) ??
        uncategorizedCategory(categories, extracted.kind);
      setCategoryId(category?.id ?? "");
      setAmountError(undefined);
      setCategoryError(undefined);
    },
  });

  useEffect(
    () => () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    },
    [imageUrl],
  );

  function chooseImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    setImageFile(file);
    setImageUrl(URL.createObjectURL(file));
    setDraft(undefined);
    setAmountError(undefined);
    setCategoryError(undefined);
    extractionMutation.reset();
  }

  function retake() {
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    setImageFile(undefined);
    setImageUrl(undefined);
    setDraft(undefined);
    setAmountError(undefined);
    setCategoryError(undefined);
    extractionMutation.reset();
    fileInputRef.current?.click();
  }

  function changeKind(next: TransactionKind) {
    setKind(next);
    setCategoryId(uncategorizedCategory(categories, next)?.id ?? "");
    setCategoryError(undefined);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const trimmedMerchant = merchant.trim();
    if (!trimmedMerchant || !date) return;
    let amountMinor: number;
    try {
      amountMinor = parseAmountToMinor(amountText);
    } catch {
      setAmountError("Enter a plain amount with up to two decimal places.");
      return;
    }
    if (amountMinor === 0) {
      setAmountError("Amount cannot be zero.");
      return;
    }
    setAmountError(undefined);
    const category = categories.find((candidate) => candidate.id === categoryId);
    if (!category) {
      setCategoryError("Choose a category.");
      return;
    }
    setCategoryError(undefined);
    onContinue({
      merchant: trimmedMerchant,
      date,
      amountMinor,
      kind,
      categoryId: category.id,
      categoryName: category.name,
    });
  }

  if (preferencesQuery.isPending) {
    return (
      <section className="receipt-card">
        <span className="receipt-loading" role="status">
          <LoaderCircle className="spinning" size={16} /> Checking receipt settings…
        </span>
      </section>
    );
  }
  if (preferencesQuery.isError) {
    return (
      <section className="receipt-card">
        <p className="receipt-error" role="alert">
          {errorMessage(preferencesQuery.error, "Receipt scanning is not available right now.")}
        </p>
      </section>
    );
  }

  const preferences = preferencesQuery.data;
  const consentRequired =
    !preferences ||
    !preferences.consentedAt ||
    preferences.consentVersion !== CURRENT_RECEIPT_CONSENT_VERSION;
  if (consentRequired) {
    return (
      <ReceiptConsent
        accepting={consentMutation.isPending}
        error={
          consentMutation.isError
            ? errorMessage(consentMutation.error, "Receipt scanning could not be enabled.")
            : undefined
        }
        onAccept={() => consentMutation.mutate()}
      />
    );
  }

  return (
    <>
      <section className="receipt-card" aria-labelledby="receipt-capture-title">
        <div className="import-step-heading">
          <span>1</span>
          <div>
            <strong id="receipt-capture-title">Take a photo of the receipt</strong>
            <small>JPEG, PNG, or WebP · up to 8 MB</small>
          </div>
        </div>
        <label
          className={["receipt-capture", imageUrl ? "has-photo" : ""].filter(Boolean).join(" ")}
        >
          {imageUrl ? (
            <img className="receipt-photo" src={imageUrl} alt="Receipt photo preview" />
          ) : (
            <>
              <Camera size={27} />
              <strong>Take or choose a receipt photo</strong>
              <span>Frame the full receipt — merchant, total, and date.</span>
            </>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            aria-label="Choose receipt photo"
            onChange={chooseImage}
          />
        </label>
        {imageFile && !extractionMutation.isPending && !draft && (
          <button
            className="button primary"
            type="button"
            onClick={() => extractionMutation.mutate(imageFile)}
          >
            Read receipt
          </button>
        )}
        {extractionMutation.isPending && (
          <span className="receipt-loading" role="status">
            <LoaderCircle className="spinning" size={16} /> Reading receipt…
          </span>
        )}
        {extractionMutation.isError && (
          <p className="receipt-error" role="alert">
            {errorMessage(
              extractionMutation.error,
              "The receipt could not be read. Try a clearer photo.",
            )}
          </p>
        )}
      </section>

      {draft && (
        <section className="receipt-card" aria-labelledby="receipt-draft-title">
          <div className="import-step-heading">
            <span>2</span>
            <div>
              <strong id="receipt-draft-title">Check what we read</strong>
              <small>Edit anything before the import preview.</small>
            </div>
          </div>
          <form className="receipt-draft" onSubmit={submit}>
            <label>
              <span>Merchant</span>
              <input
                value={merchant}
                onChange={(event) => setMerchant(event.currentTarget.value)}
                maxLength={240}
                required
              />
            </label>
            <label>
              <span>Date</span>
              <input
                type="date"
                value={date}
                onChange={(event) => setDate(event.currentTarget.value)}
                required
              />
            </label>
            <label>
              <span>Amount (₱)</span>
              <input
                inputMode="decimal"
                value={amountText}
                onChange={(event) => {
                  setAmountText(event.currentTarget.value);
                  setAmountError(undefined);
                }}
                aria-invalid={Boolean(amountError)}
                aria-describedby={amountError ? "receipt-amount-error" : undefined}
              />
              {amountError && (
                <small id="receipt-amount-error" role="alert">
                  {amountError}
                </small>
              )}
            </label>
            <label>
              <span>Type</span>
              <select
                value={kind}
                onChange={(event) => changeKind(event.currentTarget.value as TransactionKind)}
              >
                {transactionKinds.map((candidate) => (
                  <option key={candidate} value={candidate}>
                    {candidate === "income"
                      ? "Income"
                      : candidate === "expense"
                        ? "Expense"
                        : "Transfer"}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Category</span>
              <select
                value={categoryId}
                onChange={(event) => {
                  setCategoryId(event.currentTarget.value);
                  setCategoryError(undefined);
                }}
                aria-invalid={Boolean(categoryError)}
                aria-describedby={categoryError ? "receipt-category-error" : undefined}
              >
                {categories
                  .filter(
                    (category) => !category.archived && !category.locked && category.kind === kind,
                  )
                  .map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
              </select>
              {categoryError && (
                <small id="receipt-category-error" role="alert">
                  {categoryError}
                </small>
              )}
            </label>
            <details className="receipt-raw">
              <summary>What we read from the photo</summary>
              <p>{draft.rawText || "No text was recovered from this photo."}</p>
            </details>
            <div className="receipt-actions">
              <button className="button secondary" type="button" onClick={retake}>
                <RotateCcw size={15} /> Take another photo
              </button>
              <button className="button primary" type="submit">
                Continue to preview
              </button>
            </div>
          </form>
        </section>
      )}
    </>
  );
}
