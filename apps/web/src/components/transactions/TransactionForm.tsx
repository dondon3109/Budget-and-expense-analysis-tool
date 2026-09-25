import {
  currencies,
  currencyMetadata,
  DEBT_PAYMENT_CATEGORY_SYSTEM_KEY,
  matchCategory,
  parseAmountToMinor,
  preferredTransactionAccount,
  transactionInputSchema,
  type AccountRecord,
  type CategoryRecord,
  type Currency,
  type Debt,
  type TransactionInput,
  type TransactionKind,
  type TransactionListItem,
  type TransactionVoiceDraft,
} from "@zoption/shared";
import { X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";

import { useFocusTrap } from "../../hooks/useFocusTrap";
import { useRootLock } from "../../hooks/useRootLock";
import { useDefaultSpendingAccountId } from "../../lib/defaultSpendingAccount";
import type { AuthenticatedWorkspace } from "../../lib/workspace";
import "./TransactionForm.css";
import { localIsoDate } from "../../lib/calendar";
import { formatMoney } from "../../lib/formatters";
import { TransactionVoiceEntry } from "./TransactionVoiceEntry";

export interface TransactionFormDraft {
  kind?: TransactionKind;
  date?: string;
  description?: string;
  amount?: string;
  categoryId?: string;
  accountId?: string;
  toAccountId?: string;
  notes?: string;
  currency?: Currency;
  debtId?: string;
}

interface TransactionFormProps {
  workspace: AuthenticatedWorkspace;
  item?: TransactionListItem;
  initialDraft?: TransactionFormDraft;
  initialDate?: string;
  categories: CategoryRecord[];
  accounts: AccountRecord[];
  debts: Debt[];
  busy: boolean;
  serverError?: string;
  onSubmit: (input: TransactionInput) => Promise<void>;
  onClose: () => void;
}

function toAmountText(item?: TransactionListItem): string {
  return item ? (Math.abs(item.amountMinor) / 100).toFixed(2) : "";
}

export function TransactionForm({
  workspace,
  item,
  initialDraft,
  initialDate,
  categories,
  accounts,
  debts,
  busy,
  serverError,
  onSubmit,
  onClose,
}: TransactionFormProps) {
  const [kind, setKind] = useState<TransactionKind>(initialDraft?.kind ?? item?.kind ?? "expense");
  const [date, setDate] = useState(initialDraft?.date ?? item?.date ?? initialDate ?? localIsoDate);
  const [description, setDescription] = useState(
    initialDraft?.description ?? item?.description ?? "",
  );
  const [amount, setAmount] = useState(initialDraft?.amount ?? toAmountText(item));
  const [categoryId, setCategoryId] = useState(initialDraft?.categoryId ?? item?.categoryId ?? "");
  const [accountId, setAccountId] = useState(initialDraft?.accountId ?? item?.accountId ?? "");
  const [fromAccountId, setFromAccountId] = useState(
    initialDraft?.accountId ?? item?.fromAccountId ?? item?.accountId ?? "",
  );
  const [toAccountId, setToAccountId] = useState(
    initialDraft?.toAccountId ?? item?.toAccountId ?? "",
  );
  const [notes, setNotes] = useState(initialDraft?.notes ?? item?.notes ?? "");
  const [debtId, setDebtId] = useState(initialDraft?.debtId ?? item?.debtId ?? "");
  const [transferFee, setTransferFee] = useState(
    item?.transferFeeMinor ? (item.transferFeeMinor / 100).toFixed(2) : "",
  );
  const [currency, setCurrency] = useState<Currency>(
    initialDraft?.currency ?? item?.currency ?? "PHP",
  );
  const [clientError, setClientError] = useState<string>();
  const dialogRef = useRef<HTMLElement>(null);
  const descriptionRef = useRef<HTMLInputElement>(null);
  const activeAccounts = useMemo(() => accounts.filter((account) => !account.archived), [accounts]);
  const defaultSpendingAccountId = useDefaultSpendingAccountId();
  const defaultAccount = useMemo(
    () => preferredTransactionAccount(activeAccounts, defaultSpendingAccountId),
    [activeAccounts, defaultSpendingAccountId],
  );
  const availableCategories = useMemo(
    () => categories.filter((category) => !category.archived && category.kind === kind),
    [categories, kind],
  );
  const selectableCategories = useMemo(
    () => availableCategories.filter((category) => !category.locked),
    [availableCategories],
  );
  const activeCategoryNames = useMemo(
    () =>
      categories
        .filter((category) => !category.archived && !category.locked)
        .map((category) => category.name),
    [categories],
  );

  /** Default pick for a fresh entry: income prefers the starter "Salary"
   *  category (which is the natural home for earned money), then falls back
   *  to the first selectable category of the chosen kind. */
  const preferredDefaultCategory = useMemo(() => {
    const incomeSalary =
      kind === "income"
        ? selectableCategories.find((category) => category.name === "Salary")
        : undefined;
    return incomeSalary ?? selectableCategories[0];
  }, [kind, selectableCategories]);

  /** The product-owned debt payment category is what turns on the "which debt" picker. */
  const debtPaymentSelected =
    availableCategories.find((category) => category.id === categoryId)?.systemKey ===
    DEBT_PAYMENT_CATEGORY_SYSTEM_KEY;
  /** A debt that was paid off after the fact stays selectable so an edit cannot relink it. */
  const selectableDebts = useMemo(() => {
    const open = debts.filter((debt) => debt.status === "active");
    const linked = debts.find((debt) => debt.id === debtId);
    return linked && !open.includes(linked) ? [linked, ...open] : open;
  }, [debts, debtId]);
  const missingDebtChoice = debtPaymentSelected && selectableDebts.length > 0 && !debtId;

  const transferNet = useMemo(() => {
    if (kind !== "transfer") return null;
    let amountMinor: number;
    let feeMinor = 0;
    try {
      amountMinor = parseAmountToMinor(amount);
      if (transferFee.trim() !== "") feeMinor = parseAmountToMinor(transferFee);
    } catch {
      return null;
    }
    if (feeMinor >= amountMinor) return null;
    return { netMinor: amountMinor - feeMinor, feeMinor };
  }, [amount, kind, transferFee]);

  useEffect(() => {
    const selectedCategory = availableCategories.find((category) => category.id === categoryId);
    const preservesLockedHistoricalCategory =
      selectedCategory?.locked && item?.categoryId === selectedCategory.id;
    if (!selectedCategory || (selectedCategory.locked && !preservesLockedHistoricalCategory)) {
      setCategoryId(
        initialDraft?.categoryId &&
          availableCategories.some((c) => c.id === initialDraft.categoryId)
          ? initialDraft.categoryId
          : (preferredDefaultCategory?.id ?? ""),
      );
    }
  }, [
    availableCategories,
    categoryId,
    initialDraft?.categoryId,
    item?.categoryId,
    preferredDefaultCategory,
  ]);
  useEffect(() => {
    if (!activeAccounts.some((account) => account.id === accountId))
      setAccountId(defaultAccount?.id ?? "");
    if (!activeAccounts.some((account) => account.id === fromAccountId))
      setFromAccountId(defaultAccount?.id ?? "");
    if (!activeAccounts.some((account) => account.id === toAccountId))
      setToAccountId(activeAccounts.find((account) => account.id !== fromAccountId)?.id ?? "");
  }, [accountId, activeAccounts, defaultAccount, fromAccountId, toAccountId]);
  useRootLock(true);

  const handleDialogKeyDown = useFocusTrap(dialogRef, {
    initialFocusRef: descriptionRef,
    onEscape: () => {
      if (!busy) onClose();
    },
  });

  async function submitTransaction() {
    setClientError(undefined);
    let amountMinor: number;
    try {
      amountMinor = parseAmountToMinor(amount);
    } catch (error) {
      setClientError(error instanceof Error ? error.message : "Enter a valid amount.");
      return;
    }
    let transferFeeMinor: number | undefined;
    if (kind === "transfer" && transferFee.trim() !== "") {
      try {
        transferFeeMinor = parseAmountToMinor(transferFee);
      } catch (error) {
        setClientError(error instanceof Error ? error.message : "Enter a valid transfer fee.");
        return;
      }
    }
    const base = {
      date,
      description,
      amountMinor,
      currency,
      kind,
      categoryId,
      notes,
    };
    // Only an expense carries a debt link. The strict schema rejects the key on income,
    // so an income entry must leave it out rather than send an explicit null.
    const parsed = transactionInputSchema.safeParse(
      kind === "transfer"
        ? { ...base, fromAccountId, toAccountId, transferFeeMinor }
        : kind === "income"
          ? { ...base, accountId }
          : { ...base, accountId, debtId: debtPaymentSelected && debtId ? debtId : null },
    );
    if (!parsed.success) {
      setClientError(parsed.error.issues[0]?.message ?? "Check the transaction details.");
      return;
    }
    await onSubmit(parsed.data);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    await submitTransaction();
  }

  /** Applies an AI voice draft as review-only prefill, mirroring the mobile editor. */
  function applyVoiceDraft(draft: TransactionVoiceDraft) {
    const nextKind = draft.kind;
    const nextKindCategories = categories.filter(
      (category) => !category.archived && !category.locked && category.kind === nextKind,
    );
    const matchingCategory = matchCategory(nextKindCategories, draft.categoryName, {
      kind: nextKind,
      contextText: draft.transcript,
    });
    const fromAccountIdValue = activeAccounts.some((account) => account.id === accountId)
      ? accountId
      : (defaultAccount?.id ?? "");
    setKind(nextKind);
    setCategoryId(matchingCategory?.id ?? nextKindCategories[0]?.id ?? categoryId);
    setDate(draft.date);
    setDescription(draft.description);
    setAmount((draft.amountMinor / 100).toFixed(2));
    setTransferFee("");
    setCurrency(draft.currency);
    if (!activeAccounts.some((account) => account.id === accountId)) {
      setAccountId(fromAccountIdValue);
    }
    if (nextKind === "transfer" && fromAccountId === toAccountId) {
      setToAccountId(activeAccounts.find((account) => account.id !== fromAccountIdValue)?.id ?? "");
    }
    setClientError(undefined);
  }

  const selector = (
    label: string,
    value: string,
    onChange: (value: string) => void,
    excludeId?: string,
  ) => (
    <label>
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} required>
        <option value="">Choose an account</option>
        {activeAccounts
          .filter((account) => account.id !== excludeId)
          .map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
      </select>
    </label>
  );

  // Portalled so the inert application root from useRootLock does not disable the dialog.
  return createPortal(
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <section
        ref={dialogRef}
        className="form-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="transaction-form-title"
        onKeyDown={handleDialogKeyDown}
      >
        <header className="modal-header">
          <div>
            <p className="eyebrow">{item ? "Update record" : "New record"}</p>
            <h2 id="transaction-form-title">{item ? "Edit transaction" : "Add transaction"}</h2>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
          >
            <X size={19} />
          </button>
        </header>
        <form
          className="transaction-form"
          onSubmit={handleSubmit}
          onKeyDown={(event) => {
            if (busy) return;
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              void submitTransaction();
            }
          }}
        >
          {!item && (
            <TransactionVoiceEntry
              workspace={workspace}
              disabled={busy || activeCategoryNames.length === 0 || activeAccounts.length === 0}
              onDraft={applyVoiceDraft}
              categories={activeCategoryNames}
            />
          )}
          <div className="form-row split">
            <label>
              <span>Transaction type</span>
              <select
                value={kind}
                onChange={(event) => setKind(event.target.value as TransactionKind)}
              >
                <option value="expense">Expense</option>
                <option value="income">Income</option>
                <option value="transfer">Transfer</option>
              </select>
            </label>
            <label>
              <span>Date</span>
              <input
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                required
              />
            </label>
          </div>
          <label>
            <span>Description {kind === "transfer" && <small>Optional</small>}</span>
            <input
              ref={descriptionRef}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={
                kind === "transfer" ? "e.g. Transfer to savings" : "e.g. Weekly groceries"
              }
              maxLength={240}
              required={kind !== "transfer"}
            />
          </label>
          {kind === "transfer" ? (
            <div className="form-row split">
              {selector("From account", fromAccountId, setFromAccountId, toAccountId)}
              {selector("To account", toAccountId, setToAccountId, fromAccountId)}
            </div>
          ) : (
            selector("Account", accountId, setAccountId)
          )}
          {kind === "transfer" && (
            <label>
              <span>
                Transfer fee <small>Optional</small>
              </span>
              <div className="money-input">
                <b>{currencyMetadata[currency].symbol}</b>
                <input
                  aria-label="Transfer fee"
                  inputMode="decimal"
                  value={transferFee}
                  onChange={(event) => setTransferFee(event.target.value)}
                  placeholder="0.00"
                />
              </div>
              <small>Deducted from the amount, so the receiving account gets a little less.</small>
              <div className="transfer-net" role="status" aria-live="polite">
                <span>Receiving account gets</span>
                {transferNet ? (
                  <>
                    <strong>{formatMoney(transferNet.netMinor, currency)}</strong>
                    {transferNet.feeMinor > 0 && (
                      <span className="transfer-net-fee">
                        after {formatMoney(transferNet.feeMinor, currency)} fee
                      </span>
                    )}
                  </>
                ) : (
                  <strong className="transfer-net-empty">—</strong>
                )}
              </div>
            </label>
          )}
          <div className="form-row split">
            <label>
              <span>Amount ({currency})</span>
              <div className="money-input">
                <b>{currencyMetadata[currency].symbol}</b>
                <input
                  aria-label={`Amount (${currency})`}
                  inputMode="decimal"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  placeholder="0.00"
                  required
                />
              </div>
            </label>
            <label>
              <span>Currency</span>
              <select
                value={currency}
                onChange={(event) => setCurrency(event.target.value as Currency)}
                required
              >
                {currencies.map((option) => (
                  <option key={option} value={option}>
                    {currencyMetadata[option].label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label>
            <span>Category</span>
            <select
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
              required
            >
              {selectableCategories.length === 0 && (
                <option value="">Upgrade or create a {kind} category first</option>
              )}
              {availableCategories.map((category) => (
                <option key={category.id} value={category.id} disabled={category.locked}>
                  {category.iconEmoji ? `${category.iconEmoji} ` : ""}
                  {category.name}
                  {category.locked ? " — Pro required" : ""}
                </option>
              ))}
            </select>
          </label>
          {debtPaymentSelected &&
            (selectableDebts.length === 0 ? (
              <p className="form-hint">
                Add a debt in Goals &amp; debt to say which one this payment pays off.
              </p>
            ) : (
              <label>
                <span>Debt paid</span>
                <select value={debtId} onChange={(event) => setDebtId(event.target.value)} required>
                  <option value="">Choose a debt</option>
                  {selectableDebts.map((debt) => (
                    <option key={debt.id} value={debt.id}>
                      {debt.name}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          <label>
            <span>
              Notes <small>Optional</small>
            </span>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              maxLength={500}
              rows={3}
              placeholder="Add context without including sensitive information"
            />
          </label>
          {(clientError || serverError) && (
            <p className="form-error" role="alert">
              {clientError ?? serverError}
            </p>
          )}
          <div className="modal-actions">
            <button className="button secondary" type="button" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button
              className="button primary"
              type="submit"
              disabled={
                busy ||
                !categoryId ||
                missingDebtChoice ||
                (kind === "transfer" ? !fromAccountId || !toAccountId : !accountId)
              }
            >
              {busy ? "Saving…" : item ? "Save changes" : "Add transaction"}
            </button>
          </div>
        </form>
      </section>
    </div>,
    document.body,
  );
}
