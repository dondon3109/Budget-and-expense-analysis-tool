import {
  debtInputSchema,
  debtUpdateSchema,
  parseAmountToMinor,
  type Debt,
  type DebtInput,
  type DebtStatus,
  type DebtType,
  type DebtUpdate,
} from "@zoption/shared";
import { X } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";

interface DebtFormProps {
  debt?: Debt;
  busy: boolean;
  serverError?: string;
  onSubmit: (input: DebtInput | DebtUpdate) => Promise<void>;
  onClose: () => void;
}

function amountFromMinor(value: number): string {
  return (value / 100).toFixed(2);
}

export function DebtForm({ debt, busy, serverError, onSubmit, onClose }: DebtFormProps) {
  const [name, setName] = useState(debt?.name ?? "");
  const [type, setType] = useState<DebtType>(debt?.type ?? "credit_card");
  const [balance, setBalance] = useState(debt ? amountFromMinor(debt.balanceMinor) : "");
  const [aprPercent, setAprPercent] = useState(debt ? (debt.aprBasisPoints / 100).toFixed(2) : "");
  const [minimumPayment, setMinimumPayment] = useState(
    debt ? amountFromMinor(debt.minimumPaymentMinor) : "",
  );
  const [balanceAsOf, setBalanceAsOf] = useState(debt?.balanceAsOf ?? "");
  const [status, setStatus] = useState<DebtStatus>(debt?.status ?? "active");
  const [clientError, setClientError] = useState<string>();

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

    let balanceMinor: number;
    let minimumPaymentMinor: number;
    try {
      balanceMinor = parseAmountToMinor(balance);
      minimumPaymentMinor = parseAmountToMinor(minimumPayment);
    } catch (error) {
      setClientError(error instanceof Error ? error.message : "Enter valid amounts.");
      return;
    }

    const parsedApr = Number(aprPercent);
    if (!Number.isFinite(parsedApr)) {
      setClientError("Enter a valid annual percentage rate.");
      return;
    }
    const input = {
      name,
      type,
      balanceMinor,
      aprBasisPoints: Math.round(parsedApr * 100),
      minimumPaymentMinor,
      balanceAsOf,
      status,
    };
    const parsed = (debt ? debtUpdateSchema : debtInputSchema).safeParse(input);
    if (!parsed.success) {
      setClientError(parsed.error.issues[0]?.message ?? "Check the debt details.");
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
        className="form-modal planning-form-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="debt-form-title"
      >
        <header className="modal-header">
          <div>
            <p className="eyebrow">Payoff planning</p>
            <h2 id="debt-form-title">{debt ? "Edit debt" : "Add a debt"}</h2>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close debt form"
          >
            <X size={19} aria-hidden="true" />
          </button>
        </header>

        <form className="transaction-form planning-record-form" onSubmit={handleSubmit}>
          <div className="form-row split">
            <label>
              <span>Debt name</span>
              <input
                autoFocus
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Main credit card"
                maxLength={80}
                required
              />
            </label>
            <label>
              <span>Debt type</span>
              <select value={type} onChange={(event) => setType(event.target.value as DebtType)}>
                <option value="credit_card">Credit card</option>
                <option value="personal_loan">Personal loan</option>
                <option value="auto_loan">Auto loan</option>
                <option value="mortgage">Mortgage</option>
                <option value="other">Other</option>
              </select>
            </label>
          </div>

          <div className="form-row split">
            <label>
              <span>Current balance</span>
              <div className="money-input">
                <b>₱</b>
                <input
                  aria-label="Current balance"
                  inputMode="decimal"
                  value={balance}
                  onChange={(event) => setBalance(event.target.value)}
                  placeholder="0.00"
                  required
                />
              </div>
            </label>
            <label>
              <span>Minimum monthly payment</span>
              <div className="money-input">
                <b>₱</b>
                <input
                  aria-label="Minimum monthly payment"
                  inputMode="decimal"
                  value={minimumPayment}
                  onChange={(event) => setMinimumPayment(event.target.value)}
                  placeholder="0.00"
                  required
                />
              </div>
            </label>
          </div>

          <div className="form-row split planning-form-three">
            <label>
              <span>APR</span>
              <div className="percentage-input">
                <input
                  aria-label="Annual percentage rate"
                  inputMode="decimal"
                  value={aprPercent}
                  onChange={(event) => setAprPercent(event.target.value)}
                  placeholder="0.00"
                  required
                />
                <b>%</b>
              </div>
            </label>
            <label>
              <span>Balance as of</span>
              <input
                type="date"
                value={balanceAsOf}
                onChange={(event) => setBalanceAsOf(event.target.value)}
                required
              />
            </label>
            <label>
              <span>Status</span>
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value as DebtStatus)}
              >
                <option value="active">Active</option>
                <option value="paid">Paid</option>
              </select>
            </label>
          </div>

          <p className="planning-form-note">
            Payoff projections use this balance, APR, and minimum payment. Zoption does not contact
            your lender.
          </p>

          {(clientError || serverError) && (
            <p className="form-error" role="alert">
              {clientError ?? serverError}
            </p>
          )}

          <div className="modal-actions">
            <button className="button secondary" type="button" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button className="button primary" type="submit" disabled={busy}>
              {busy ? "Saving…" : debt ? "Save changes" : "Add debt"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
