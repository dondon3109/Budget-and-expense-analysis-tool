import {
  currencyMetadata,
  debtInputSchema,
  debtUpdateSchema,
  formatMinorAmount,
  parseAmountToMinor,
  type Debt,
  type DebtInput,
  type DebtStatus,
  type DebtType,
  type DebtUpdate,
} from "@zoption/shared";
import { X } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import {
  isAgentSubmit,
  readFormText,
  respondToAgent,
  webMcpFormProps,
  webMcpParamProps,
} from "@zoption/web-common/webmcp";

import { useFocusTrap } from "../../hooks/useFocusTrap";
import { useRootLock } from "../../hooks/useRootLock";
import { useWorkspaceCurrency } from "../../lib/workspaceCurrency";

interface DebtFormProps {
  debt?: Debt;
  busy: boolean;
  serverError?: string;
  onSubmit: (input: DebtInput | DebtUpdate) => Promise<void>;
  onClose: () => void;
}

export function DebtForm({ debt, busy, serverError, onSubmit, onClose }: DebtFormProps) {
  const currencySymbol = currencyMetadata[useWorkspaceCurrency()].symbol;
  const [name, setName] = useState(debt?.name ?? "");
  const [type, setType] = useState<DebtType>(debt?.type ?? "credit_card");
  const [balance, setBalance] = useState(debt ? formatMinorAmount(debt.balanceMinor) : "");
  const [aprPercent, setAprPercent] = useState(debt ? (debt.aprBasisPoints / 100).toFixed(2) : "");
  const [minimumPayment, setMinimumPayment] = useState(
    debt ? formatMinorAmount(debt.minimumPaymentMinor) : "",
  );
  const [balanceAsOf, setBalanceAsOf] = useState(debt?.balanceAsOf ?? "");
  const [status, setStatus] = useState<DebtStatus>(debt?.status ?? "active");
  const [clientError, setClientError] = useState<string>();
  const dialogRef = useRef<HTMLElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useRootLock(true);

  const handleKeyDown = useFocusTrap(dialogRef, {
    initialFocusRef: nameRef,
    onEscape: () => {
      if (!busy) onClose();
    },
  });

  async function runSubmit(formData?: FormData) {
    setClientError(undefined);

    const nextName = formData ? readFormText(formData, "name") : name;
    const nextType = formData ? (readFormText(formData, "type", type) as DebtType) : type;
    const nextBalance = formData ? readFormText(formData, "balance") : balance;
    const nextMinimumPayment = formData ? readFormText(formData, "minimumPayment") : minimumPayment;
    const nextAprPercent = formData ? readFormText(formData, "aprPercent") : aprPercent;
    const nextBalanceAsOf = formData ? readFormText(formData, "balanceAsOf") : balanceAsOf;
    const nextStatus = formData ? (readFormText(formData, "status", status) as DebtStatus) : status;

    if (formData) {
      setName(nextName);
      setType(nextType);
      setBalance(nextBalance);
      setMinimumPayment(nextMinimumPayment);
      setAprPercent(nextAprPercent);
      setBalanceAsOf(nextBalanceAsOf);
      setStatus(nextStatus);
    }

    let balanceMinor: number;
    let minimumPaymentMinor: number;
    try {
      balanceMinor = parseAmountToMinor(nextBalance);
      minimumPaymentMinor = parseAmountToMinor(nextMinimumPayment);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Enter valid amounts.";
      setClientError(message);
      return { error: message };
    }

    const parsedApr = Number(nextAprPercent);
    if (!Number.isFinite(parsedApr)) {
      const message = "Enter a valid annual percentage rate.";
      setClientError(message);
      return { error: message };
    }
    const input = {
      name: nextName,
      type: nextType,
      balanceMinor,
      aprBasisPoints: Math.round(parsedApr * 100),
      minimumPaymentMinor,
      balanceAsOf: nextBalanceAsOf,
      status: nextStatus,
    };
    const parsed = (debt ? debtUpdateSchema : debtInputSchema).safeParse(input);
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? "Check the debt details.";
      setClientError(message);
      return { error: message };
    }

    try {
      await onSubmit(parsed.data);
      return { saved: true, debt: parsed.data };
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Could not save debt." };
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isAgentSubmit(event)) {
      const formData = new FormData(event.currentTarget);
      respondToAgent(event, runSubmit(formData));
      return;
    }
    void runSubmit();
  }

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
        className="form-modal planning-form-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="debt-form-title"
        onKeyDown={handleKeyDown}
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

        <form
          className="transaction-form planning-record-form"
          onSubmit={handleSubmit}
          {...webMcpFormProps({
            name: "save-debt",
            description:
              "Prepare or update a debt record for payoff tracking and user confirmation.",
          })}
        >
          <div className="form-row split">
            <label>
              <span>Debt name</span>
              <input
                ref={nameRef}
                name="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Main credit card"
                maxLength={80}
                required
              />
            </label>
            <label>
              <span>Debt type</span>
              <select
                name="type"
                value={type}
                onChange={(event) => setType(event.target.value as DebtType)}
              >
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
                <b>{currencySymbol}</b>
                <input
                  name="balance"
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
                <b>{currencySymbol}</b>
                <input
                  name="minimumPayment"
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
              <span>Interest rate (APR)</span>
              <div className="percentage-input">
                <input
                  name="aprPercent"
                  aria-describedby="debt-apr-hint"
                  aria-label="Annual percentage rate"
                  inputMode="decimal"
                  value={aprPercent}
                  onChange={(event) => setAprPercent(event.target.value)}
                  placeholder="0.00"
                  required
                />
                <b>%</b>
              </div>
              <small id="debt-apr-hint">
                Yearly interest your lender charges. Enter 0 if there is none.
              </small>
            </label>
            <label>
              <span>Balance as of</span>
              <input
                name="balanceAsOf"
                type="date"
                value={balanceAsOf}
                onChange={(event) => setBalanceAsOf(event.target.value)}
                required
                {...webMcpParamProps("Balance snapshot date in YYYY-MM-DD format.")}
              />
            </label>
            <label>
              <span>Status</span>
              <select
                name="status"
                value={status}
                onChange={(event) => setStatus(event.target.value as DebtStatus)}
              >
                <option value="active">Active</option>
                <option value="paid">Paid</option>
              </select>
            </label>
          </div>

          <p className="planning-form-note">
            Payoff projections use this balance, interest rate, and minimum payment. Zoption does
            not contact your lender.
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
    </div>,
    document.body,
  );
}
