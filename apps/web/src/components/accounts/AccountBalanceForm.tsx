import type { AccountBalanceUpdate, AccountRecord } from "@zoption/shared";
import { CalendarClock, CreditCard, WalletCards } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";

import { formatMoney } from "../../lib/formatters";

interface AccountBalanceFormProps {
  account: AccountRecord;
  saving: boolean;
  onSave: (input: AccountBalanceUpdate) => Promise<void>;
}

function displayDate(value: string): string {
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

export function AccountBalanceForm({ account, saving, onSave }: AccountBalanceFormProps) {
  const [amount, setAmount] = useState(
    account.balanceMinor === null ? "" : String(account.balanceMinor / 100),
  );
  const [asOf, setAsOf] = useState(account.balanceAsOf ?? "");
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setAmount(account.balanceMinor === null ? "" : String(account.balanceMinor / 100));
    setAsOf(account.balanceAsOf ?? "");
  }, [account.balanceAsOf, account.balanceMinor]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    setSaved(false);
    const parsed = Number(amount);
    if (!amount.trim() || !Number.isFinite(parsed)) {
      setError("Enter a valid balance.");
      return;
    }
    if (!asOf) {
      setError("Choose the date this balance was accurate.");
      return;
    }
    const balanceMinor = Math.round(parsed * 100);
    if (!Number.isSafeInteger(balanceMinor)) {
      setError("Enter a smaller balance.");
      return;
    }
    try {
      await onSave({ balanceMinor, balanceAsOf: asOf });
      setSaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The balance could not be saved.");
    }
  }

  async function clearBalance() {
    setError(undefined);
    setSaved(false);
    try {
      await onSave({ balanceMinor: null, balanceAsOf: null });
      setAmount("");
      setAsOf("");
      setSaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The balance could not be cleared.");
    }
  }

  const Icon = account.type === "credit" ? CreditCard : WalletCards;

  return (
    <article className="account-balance-card">
      <header>
        <span className="account-balance-icon" aria-hidden="true">
          <Icon size={19} />
        </span>
        <div>
          <h2>{account.name}</h2>
          <p>{account.type.replace(/^./, (letter) => letter.toUpperCase())} account</p>
        </div>
        <span
          className={`balance-status ${account.balanceMinor === null ? "missing" : "recorded"}`}
        >
          {account.balanceMinor === null ? "Not entered" : formatMoney(account.balanceMinor)}
        </span>
      </header>

      {account.balanceAsOf && (
        <p className="balance-as-of">
          <CalendarClock size={14} aria-hidden="true" /> Accurate as of{" "}
          {displayDate(account.balanceAsOf)}
        </p>
      )}

      <form onSubmit={(event) => void submit(event)}>
        <label>
          Current balance
          <span className="money-input">
            <span>₱</span>
            <input
              type="number"
              step="0.01"
              value={amount}
              onChange={(event) => {
                setAmount(event.target.value);
                setSaved(false);
              }}
              placeholder="0.00"
              aria-describedby={`balance-help-${account.id}`}
            />
          </span>
        </label>
        <label>
          As-of date
          <input
            type="date"
            value={asOf}
            onChange={(event) => {
              setAsOf(event.target.value);
              setSaved(false);
            }}
          />
        </label>
        <p id={`balance-help-${account.id}`} className="field-note">
          {account.type === "credit"
            ? "Enter a positive amount for debt owed. A negative amount means the card has a credit."
            : "Use a negative amount only when the account is overdrawn."}
        </p>
        <div className="account-balance-actions">
          <button className="button primary" type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save snapshot"}
          </button>
          {account.balanceMinor !== null && (
            <button
              className="button secondary"
              type="button"
              onClick={() => void clearBalance()}
              disabled={saving}
            >
              Clear balance
            </button>
          )}
        </div>
        {error && (
          <small className="form-message error" role="alert">
            {error}
          </small>
        )}
        {saved && (
          <small className="form-message success" role="status">
            Balance snapshot saved.
          </small>
        )}
      </form>
    </article>
  );
}
