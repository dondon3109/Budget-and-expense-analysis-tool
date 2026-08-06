import {
  currencies,
  currencyMetadata,
  parseAmountToMinor,
  transactionInputSchema,
  type AccountRecord,
  type CategoryRecord,
  type Currency,
  type TransactionInput,
  type TransactionKind,
  type TransactionListItem,
} from "@zoption/shared";
import { X } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import "./TransactionForm.css";
import { localIsoDate } from "../../lib/calendar";
import { formatMoney } from "../../lib/formatters";

interface TransactionFormProps {
  item?: TransactionListItem;
  initialDate?: string;
  categories: CategoryRecord[];
  accounts: AccountRecord[];
  busy: boolean;
  serverError?: string;
  onSubmit: (input: TransactionInput) => Promise<void>;
  onClose: () => void;
}

function toAmountText(item?: TransactionListItem): string {
  return item ? (Math.abs(item.amountMinor) / 100).toFixed(2) : "";
}

export function TransactionForm({
  item,
  initialDate,
  categories,
  accounts,
  busy,
  serverError,
  onSubmit,
  onClose,
}: TransactionFormProps) {
  const [kind, setKind] = useState<TransactionKind>(item?.kind ?? "expense");
  const [date, setDate] = useState(item?.date ?? initialDate ?? localIsoDate);
  const [description, setDescription] = useState(item?.description ?? "");
  const [amount, setAmount] = useState(toAmountText(item));
  const [categoryId, setCategoryId] = useState(item?.categoryId ?? "");
  const [accountId, setAccountId] = useState(item?.accountId ?? "");
  const [fromAccountId, setFromAccountId] = useState(item?.fromAccountId ?? item?.accountId ?? "");
  const [toAccountId, setToAccountId] = useState(item?.toAccountId ?? "");
  const [notes, setNotes] = useState(item?.notes ?? "");
  const [transferFee, setTransferFee] = useState(
    item?.transferFeeMinor ? (item.transferFeeMinor / 100).toFixed(2) : "",
  );
  const [currency, setCurrency] = useState<Currency>(item?.currency ?? "PHP");
  const [clientError, setClientError] = useState<string>();
  const activeAccounts = useMemo(() => accounts.filter((account) => !account.archived), [accounts]);
  const availableCategories = useMemo(
    () => categories.filter((category) => !category.archived && category.kind === kind),
    [categories, kind],
  );
  const selectableCategories = useMemo(
    () => availableCategories.filter((category) => !category.locked),
    [availableCategories],
  );

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
      setCategoryId(selectableCategories[0]?.id ?? "");
    }
  }, [availableCategories, categoryId, item?.categoryId, selectableCategories]);
  useEffect(() => {
    if (!activeAccounts.some((account) => account.id === accountId))
      setAccountId(activeAccounts[0]?.id ?? "");
    if (!activeAccounts.some((account) => account.id === fromAccountId))
      setFromAccountId(activeAccounts[0]?.id ?? "");
    if (!activeAccounts.some((account) => account.id === toAccountId))
      setToAccountId(activeAccounts.find((account) => account.id !== fromAccountId)?.id ?? "");
  }, [accountId, activeAccounts, fromAccountId, toAccountId]);
  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [busy, onClose]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
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
    const parsed = transactionInputSchema.safeParse(
      kind === "transfer"
        ? { ...base, fromAccountId, toAccountId, transferFeeMinor }
        : { ...base, accountId },
    );
    if (!parsed.success) {
      setClientError(parsed.error.issues[0]?.message ?? "Check the transaction details.");
      return;
    }
    await onSubmit(parsed.data);
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

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <section
        className="form-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="transaction-form-title"
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
        <form className="transaction-form" onSubmit={handleSubmit}>
          <div className="form-row split">
            <label>
              <span>Transaction type</span>
              <select
                value={kind}
                onChange={(event) => setKind(event.target.value as TransactionKind)}
              >
                <option value="expense">Expenses</option>
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
              autoFocus
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
                  {category.name}
                  {category.locked ? " — Pro required" : ""}
                </option>
              ))}
            </select>
          </label>
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
                (kind === "transfer" ? !fromAccountId || !toAccountId : !accountId)
              }
            >
              {busy ? "Saving…" : item ? "Save changes" : "Add transaction"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
