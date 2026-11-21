import {
  CURRENT_RECEIPT_CONSENT_VERSION,
  currencyMetadata,
  formatMinorAmount,
  parseAmountToMinor,
  receiptItemDescription,
  receiptPaymentTypeLabel,
  transactionKinds,
  type CategoryRecord,
  type Currency,
  type ReceiptDraft,
  type TransactionKind,
} from "@zoption/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Info, LoaderCircle, Plus, RotateCcw, X } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";

import {
  ApiRequestError,
  extractReceipt,
  getReceiptPreferences,
  grantReceiptConsent,
} from "../../lib/api";
import { queryKeys } from "../../lib/queryKeys";
import type { AuthenticatedWorkspace } from "../../lib/workspace";
import { useWorkspaceCurrency } from "../../lib/workspaceCurrency";
import { ReceiptConsent } from "./ReceiptConsent";
import "./receipts.css";

/** One reviewed receipt line; each becomes its own import preview row. */
export interface ReceiptEntryLine {
  description: string;
  amountMinor: number;
  categoryName: string;
}

export interface ReceiptEntryDraft {
  date: string;
  kind: TransactionKind;
  lines: ReceiptEntryLine[];
}

interface ReceiptItemRow {
  id: string;
  description: string;
  amountText: string;
  categoryName?: string;
}

const MAX_RECEIPT_ITEMS = 30;
const MAX_RECEIPT_IMAGE_BYTES = 8 * 1024 * 1024;
const ACCEPTED_RECEIPT_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const exactFormatterCache = new Map<Currency, Intl.NumberFormat>();

/** Exact centavo formatting for draft reconciliation, unaffected by whole-unit rounding or amount hiding. */
function formatReceiptMoney(amountMinor: number, currency: Currency): string {
  let formatter = exactFormatterCache.get(currency);
  if (!formatter) {
    formatter = new Intl.NumberFormat(currencyMetadata[currency].locale, {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    exactFormatterCache.set(currency, formatter);
  }
  return formatter.format(amountMinor / 100);
}

interface ReceiptEntryProps {
  workspace: AuthenticatedWorkspace;
  categories: CategoryRecord[];
  onContinue: (draft: ReceiptEntryDraft) => void;
}

function defaultCategory(
  categories: CategoryRecord[],
  kind: TransactionKind,
): CategoryRecord | undefined {
  const usable = categories.filter(
    (category) => !category.archived && !category.locked && category.kind === kind,
  );
  return (
    usable.find(
      (category) => category.system && category.name.toLocaleLowerCase("en") === "uncategorized",
    ) ?? usable[0]
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

/** Returns null while any item amount is incomplete, non-positive, or invalid. */
function itemsTotalMinor(items: ReceiptItemRow[]): number | null {
  let total = 0;
  for (const item of items) {
    try {
      const amount = parseAmountToMinor(item.amountText);
      if (amount <= 0) return null;
      total += amount;
    } catch {
      return null;
    }
  }
  return total;
}

function totalMinorOrNull(amountText: string): number | null {
  try {
    const amount = Math.abs(parseAmountToMinor(amountText));
    return amount > 0 ? amount : null;
  } catch {
    return null;
  }
}

export function ReceiptEntry({ workspace, categories, onContinue }: ReceiptEntryProps) {
  const queryClient = useQueryClient();
  const workspaceCurrency = useWorkspaceCurrency();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const nextItemId = useRef(1);
  const selectionIdRef = useRef(0);
  const [imageFile, setImageFile] = useState<File>();
  const [imageUrl, setImageUrl] = useState<string>();
  const [fileError, setFileError] = useState<string>();
  const [draft, setDraft] = useState<ReceiptDraft>();
  const [merchant, setMerchant] = useState("");
  const [date, setDate] = useState("");
  const [amountText, setAmountText] = useState("");
  const [kind, setKind] = useState<TransactionKind>("expense");
  const [categoryId, setCategoryId] = useState("");
  const [amountError, setAmountError] = useState<string>();
  const [categoryError, setCategoryError] = useState<string>();
  const [items, setItems] = useState<ReceiptItemRow[]>([]);
  const [itemsError, setItemsError] = useState<string>();
  const [singleReceiptNoticeOpen, setSingleReceiptNoticeOpen] = useState(true);

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
    mutationFn: ({ file }: { file: File; selectionId: number }) => extractReceipt(workspace, file),
    onSuccess: (extracted, variables) => {
      if (variables.selectionId !== selectionIdRef.current) return;
      setDraft(extracted);
      setMerchant(extracted.merchant);
      setDate(extracted.date);
      setAmountText(formatMinorAmount(Math.abs(extracted.amountMinor)));
      setKind(extracted.kind);
      const category =
        matchedCategory(categories, extracted.kind, extracted.categoryName) ??
        defaultCategory(categories, extracted.kind);
      setCategoryId(category?.id ?? "");
      setItems(
        (extracted.items ?? []).slice(0, MAX_RECEIPT_ITEMS).map((item, index) => ({
          id: "scanned-" + (index + 1),
          description: item.description,
          amountText: formatMinorAmount(item.amountMinor),
          categoryName: item.categoryName,
        })),
      );
      nextItemId.current = 1;
      setAmountError(undefined);
      setCategoryError(undefined);
      setItemsError(undefined);
    },
    onError: (error, variables) => {
      if (variables.selectionId !== selectionIdRef.current) return;
      if (error instanceof ApiRequestError && error.code === "receipt_consent_required") {
        void queryClient.invalidateQueries({ queryKey: queryKeys.receiptPreferences(workspace) });
      }
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
    selectionIdRef.current += 1;
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    setDraft(undefined);
    setItems([]);
    setAmountError(undefined);
    setCategoryError(undefined);
    setItemsError(undefined);
    extractionMutation.reset();

    const mediaType = file.type.split(";", 1)[0]?.trim().toLowerCase() ?? "";
    if (!ACCEPTED_RECEIPT_TYPES.has(mediaType)) {
      setImageFile(undefined);
      setImageUrl(undefined);
      setFileError("Use a JPEG, PNG, or WebP photo.");
      return;
    }
    if (file.size === 0 || file.size > MAX_RECEIPT_IMAGE_BYTES) {
      setImageFile(undefined);
      setImageUrl(undefined);
      setFileError("Choose a receipt photo up to 8 MB.");
      return;
    }
    setFileError(undefined);
    setImageFile(file);
    setImageUrl(URL.createObjectURL(file));
  }

  function retake() {
    selectionIdRef.current += 1;
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    setImageFile(undefined);
    setImageUrl(undefined);
    setFileError(undefined);
    setDraft(undefined);
    setItems([]);
    setAmountError(undefined);
    setCategoryError(undefined);
    setItemsError(undefined);
    extractionMutation.reset();
    fileInputRef.current?.click();
  }

  function changeKind(next: TransactionKind) {
    setKind(next);
    setCategoryId(defaultCategory(categories, next)?.id ?? "");
    setCategoryError(undefined);
  }

  function updateItem(id: string, update: Partial<ReceiptItemRow>) {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...update } : item)));
    setItemsError(undefined);
  }

  function removeItem(id: string) {
    setItems((current) => current.filter((item) => item.id !== id));
    setItemsError(undefined);
  }

  function addItem() {
    setItems((current) =>
      current.length >= MAX_RECEIPT_ITEMS
        ? current
        : [...current, { id: "added-" + nextItemId.current++, description: "", amountText: "" }],
    );
    setItemsError(undefined);
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
    // Receipt items split spending or income; a transfer stays one signed total.
    if (!items.length || kind === "transfer") {
      onContinue({
        date,
        kind,
        lines: [{ description: trimmedMerchant, amountMinor, categoryName: category.name }],
      });
      return;
    }
    const activeCurrency = draft?.currency ?? workspaceCurrency;
    const lines: ReceiptEntryLine[] = [];
    for (const [index, item] of items.entries()) {
      let itemAmountMinor: number;
      try {
        itemAmountMinor = parseAmountToMinor(item.amountText);
      } catch {
        setItemsError("Item " + (index + 1) + ": enter a plain amount.");
        return;
      }
      if (!item.description.trim() || itemAmountMinor <= 0) {
        setItemsError("Item " + (index + 1) + ": enter a description and a positive amount.");
        return;
      }
      lines.push({
        description: receiptItemDescription(trimmedMerchant, item.description),
        amountMinor: itemAmountMinor,
        // A per-line suggestion wins only when it names a usable category.
        categoryName: matchedCategory(categories, kind, item.categoryName)?.name ?? category.name,
      });
    }
    const itemsMinor = lines.reduce((total, line) => total + line.amountMinor, 0);
    if (itemsMinor !== Math.abs(amountMinor)) {
      setItemsError(
        "The items add to " +
          formatReceiptMoney(itemsMinor, activeCurrency) +
          ", but the receipt total is " +
          formatReceiptMoney(Math.abs(amountMinor), activeCurrency) +
          ". Correct the amounts, add the missing line, or save as one total.",
      );
      return;
    }
    setItemsError(undefined);
    onContinue({ date, kind, lines });
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
  const activeCurrency = draft?.currency ?? workspaceCurrency;
  const currencySymbol = currencyMetadata[activeCurrency].symbol;
  const consentRequired =
    !preferences ||
    !preferences.consentedAt ||
    preferences.consentVersion !== CURRENT_RECEIPT_CONSENT_VERSION;
  const reviewedItemsMinor = itemsTotalMinor(items);
  const receiptMinor = totalMinorOrNull(amountText);
  const itemsMatchTotal = reviewedItemsMinor !== null && reviewedItemsMinor === receiptMinor;
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
        {singleReceiptNoticeOpen && (
          <div className="receipt-notice" role="status">
            <Info size={16} aria-hidden="true" />
            <p>
              <strong>One receipt per photo.</strong> Each scan reads a single receipt. Photograph
              several receipts one at a time.
            </p>
            <button
              type="button"
              aria-label="Dismiss one receipt per photo notice"
              onClick={() => setSingleReceiptNoticeOpen(false)}
            >
              <X size={15} />
            </button>
          </div>
        )}
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
            disabled={extractionMutation.isPending}
            onChange={chooseImage}
          />
        </label>
        {fileError && (
          <p className="receipt-error" role="alert">
            {fileError}
          </p>
        )}
        {imageFile && !extractionMutation.isPending && !draft && (
          <button
            className="button primary"
            type="button"
            onClick={() =>
              extractionMutation.mutate({ file: imageFile, selectionId: selectionIdRef.current })
            }
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
          {draft.payment && (
            <p className="receipt-payment">
              {[
                draft.payment.provider,
                receiptPaymentTypeLabel(draft.payment.type),
                draft.payment.referenceNo ? "Ref " + draft.payment.referenceNo : null,
                draft.payment.feeMinor !== undefined
                  ? "Fee " + formatReceiptMoney(draft.payment.feeMinor, activeCurrency)
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
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
              <span>Amount ({currencySymbol})</span>
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
            {items.length > 0 && kind !== "transfer" && (
              <fieldset className="receipt-items">
                <legend>Receipt items</legend>
                <p>Each item becomes its own transaction in the import preview.</p>
                {items.map((item, index) => (
                  <div className="receipt-item" key={item.id}>
                    <input
                      aria-label={"Item " + (index + 1) + " description"}
                      value={item.description}
                      onChange={(event) =>
                        updateItem(item.id, { description: event.currentTarget.value })
                      }
                      maxLength={160}
                      placeholder="Item"
                    />
                    <input
                      aria-label={"Item " + (index + 1) + " amount (" + currencySymbol + ")"}
                      inputMode="decimal"
                      value={item.amountText}
                      onChange={(event) =>
                        updateItem(item.id, { amountText: event.currentTarget.value })
                      }
                      placeholder="0.00"
                    />
                    <button
                      className="receipt-item-remove"
                      type="button"
                      aria-label={"Remove item " + (index + 1)}
                      onClick={() => removeItem(item.id)}
                    >
                      <X size={15} />
                    </button>
                  </div>
                ))}
                <div
                  className={["receipt-items-total", itemsMatchTotal ? "matches" : ""]
                    .filter(Boolean)
                    .join(" ")}
                  role="status"
                >
                  Items{" "}
                  {reviewedItemsMinor === null
                    ? "—"
                    : formatReceiptMoney(reviewedItemsMinor, activeCurrency)}{" "}
                  · Receipt{" "}
                  {receiptMinor === null ? "—" : formatReceiptMoney(receiptMinor, activeCurrency)}
                </div>
                {itemsError && (
                  <small className="receipt-items-error" role="alert">
                    {itemsError}
                  </small>
                )}
                <div className="receipt-items-actions">
                  <button
                    className="button secondary"
                    type="button"
                    onClick={addItem}
                    disabled={items.length >= MAX_RECEIPT_ITEMS}
                  >
                    <Plus size={15} /> Add item
                  </button>
                  <button
                    className="button secondary"
                    type="button"
                    onClick={() => {
                      setItems([]);
                      setItemsError(undefined);
                    }}
                  >
                    Save as one total
                  </button>
                </div>
              </fieldset>
            )}
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
