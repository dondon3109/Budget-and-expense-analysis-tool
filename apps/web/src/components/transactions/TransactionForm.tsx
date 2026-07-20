import {
  parseAmountToMinor,
  transactionInputSchema,
  type AccountRecord,
  type CategoryRecord,
  type TransactionInput,
  type TransactionKind,
  type TransactionListItem,
} from "@budget/shared";
import { X } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";

interface TransactionFormProps {
  item?: TransactionListItem;
  categories: CategoryRecord[];
  accounts: AccountRecord[];
  busy: boolean;
  serverError?: string;
  onSubmit: (input: TransactionInput) => Promise<void>;
  onClose: () => void;
}

function toAmountText(item?: TransactionListItem): string {
  if (!item) return "";
  return (Math.abs(item.amountMinor) / 100).toFixed(2);
}

function today(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function TransactionForm({
  item,
  categories,
  accounts,
  busy,
  serverError,
  onSubmit,
  onClose,
}: TransactionFormProps) {
  const [kind, setKind] = useState<TransactionKind>(item?.kind ?? "expense");
  const [date, setDate] = useState(item?.date ?? today);
  const [description, setDescription] = useState(item?.description ?? "");
  const [amount, setAmount] = useState(toAmountText(item));
  const [categoryId, setCategoryId] = useState(item?.categoryId ?? "");
  const [accountId, setAccountId] = useState(item?.accountId ?? "");
  const [notes, setNotes] = useState(item?.notes ?? "");
  const [clientError, setClientError] = useState<string>();

  const availableCategories = useMemo(
    () => categories.filter((category) => !category.archived && category.kind === kind),
    [categories, kind],
  );

  useEffect(() => {
    if (!availableCategories.some((category) => category.id === categoryId)) {
      setCategoryId(availableCategories[0]?.id ?? "");
    }
  }, [availableCategories, categoryId]);

  useEffect(() => {
    const activeAccounts = accounts.filter((account) => !account.archived);
    if (!activeAccounts.some((account) => account.id === accountId)) {
      setAccountId(activeAccounts[0]?.id ?? "");
    }
  }, [accountId, accounts]);

  useEffect(() => {
    function handleKeydown(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) onClose();
    }
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
    const parsed = transactionInputSchema.safeParse({
      date,
      description,
      amountMinor,
      currency: "PHP",
      kind,
      categoryId,
      accountId,
      notes,
    });
    if (!parsed.success) {
      setClientError(parsed.error.issues[0]?.message ?? "Check the transaction details.");
      return;
    }
    await onSubmit(parsed.data);
  }

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
                <option value="expense">Money out</option>
                <option value="income">Money in</option>
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
            <span>Description</span>
            <input
              autoFocus
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="e.g. Weekly groceries"
              maxLength={240}
              required
            />
          </label>
          <label>
            <span>Account</span>
            <select value={accountId} onChange={(event) => setAccountId(event.target.value)}>
              {accounts
                .filter((account) => !account.archived)
                .map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
            </select>
          </label>
          <div className="form-row split">
            <label>
              <span>Amount (PHP)</span>
              <div className="money-input">
                <b>₱</b>
                <input
                  aria-label="Amount (PHP)"
                  inputMode="decimal"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  placeholder="0.00"
                  required
                />
              </div>
            </label>
            <label>
              <span>Category</span>
              <select
                value={categoryId}
                onChange={(event) => setCategoryId(event.target.value)}
                required
              >
                {availableCategories.length === 0 && (
                  <option value="">Create a {kind} category first</option>
                )}
                {availableCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
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
              disabled={busy || !categoryId || !accountId}
            >
              {busy ? "Saving…" : item ? "Save changes" : "Add transaction"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
