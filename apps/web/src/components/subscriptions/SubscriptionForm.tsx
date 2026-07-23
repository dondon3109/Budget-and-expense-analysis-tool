import {
  parseAmountToMinor,
  subscriptionInputSchema,
  type CategoryRecord,
  type SubscriptionBillingCycle,
  type SubscriptionInput,
} from "@zoption/shared";
import { X } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";

interface SubscriptionFormProps {
  categories: CategoryRecord[];
  busy: boolean;
  serverError?: string;
  onSubmit: (input: SubscriptionInput) => Promise<void>;
  onClose: () => void;
}

function today(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function SubscriptionForm({
  categories,
  busy,
  serverError,
  onSubmit,
  onClose,
}: SubscriptionFormProps) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [billingCycle, setBillingCycle] = useState<SubscriptionBillingCycle>("monthly");
  const [nextBillingDate, setNextBillingDate] = useState(today);
  const [categoryId, setCategoryId] = useState("");
  const [clientError, setClientError] = useState<string>();
  const availableCategories = useMemo(
    () => categories.filter((category) => !category.archived && category.kind === "expense"),
    [categories],
  );

  useEffect(() => {
    if (!availableCategories.some((category) => category.id === categoryId)) {
      setCategoryId(availableCategories[0]?.id ?? "");
    }
  }, [availableCategories, categoryId]);

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

    const parsed = subscriptionInputSchema.safeParse({
      name,
      amountMinor,
      billingCycle,
      nextBillingDate,
      categoryId,
    });
    if (!parsed.success) {
      setClientError(parsed.error.issues[0]?.message ?? "Check the subscription details.");
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
        aria-labelledby="subscription-form-title"
      >
        <header className="modal-header">
          <div>
            <p className="eyebrow">Recurring charge</p>
            <h2 id="subscription-form-title">Add subscription</h2>
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
          <label>
            <span>Name</span>
            <input
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Music streaming"
              maxLength={120}
              required
            />
          </label>

          <div className="form-row split">
            <label>
              <span>Amount</span>
              <div className="money-input">
                <b>₱</b>
                <input
                  aria-label="Amount"
                  inputMode="decimal"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  placeholder="0.00"
                  required
                />
              </div>
            </label>
            <label>
              <span>Billing cycle</span>
              <select
                value={billingCycle}
                onChange={(event) =>
                  setBillingCycle(event.target.value as SubscriptionBillingCycle)
                }
              >
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
              </select>
            </label>
          </div>

          <div className="form-row split">
            <label>
              <span>Next billing date</span>
              <input
                type="date"
                value={nextBillingDate}
                onChange={(event) => setNextBillingDate(event.target.value)}
                required
              />
            </label>
            <label>
              <span>Category</span>
              <select
                value={categoryId}
                onChange={(event) => setCategoryId(event.target.value)}
                required
              >
                {availableCategories.length === 0 && (
                  <option value="">Create an expense category first</option>
                )}
                {availableCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {(clientError || serverError) && (
            <p className="form-error" role="alert">
              {clientError ?? serverError}
            </p>
          )}

          <div className="modal-actions">
            <button className="button secondary" type="button" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button className="button primary" type="submit" disabled={busy || !categoryId}>
              {busy ? "Adding…" : "Add subscription"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
