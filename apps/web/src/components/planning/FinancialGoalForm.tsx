import {
  financialGoalInputSchema,
  financialGoalUpdateSchema,
  parseAmountToMinor,
  type FinancialGoal,
  type FinancialGoalInput,
  type FinancialGoalUpdate,
  type FinancialGoalStatus,
} from "@zoption/shared";
import { X } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";

interface FinancialGoalFormProps {
  goal?: FinancialGoal;
  busy: boolean;
  serverError?: string;
  onSubmit: (input: FinancialGoalInput | FinancialGoalUpdate) => Promise<void>;
  onClose: () => void;
}

function amountFromMinor(value: number): string {
  return (value / 100).toFixed(2);
}

export function FinancialGoalForm({
  goal,
  busy,
  serverError,
  onSubmit,
  onClose,
}: FinancialGoalFormProps) {
  const [name, setName] = useState(goal?.name ?? "");
  const [targetAmount, setTargetAmount] = useState(
    goal ? amountFromMinor(goal.targetAmountMinor) : "",
  );
  const [currentAmount, setCurrentAmount] = useState(
    goal ? amountFromMinor(goal.currentAmountMinor) : "0.00",
  );
  const [targetDate, setTargetDate] = useState(goal?.targetDate ?? "");
  const [status, setStatus] = useState<FinancialGoalStatus>(goal?.status ?? "active");
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

    let targetAmountMinor: number;
    let currentAmountMinor: number;
    try {
      targetAmountMinor = parseAmountToMinor(targetAmount);
      currentAmountMinor = parseAmountToMinor(currentAmount);
    } catch (error) {
      setClientError(error instanceof Error ? error.message : "Enter valid amounts.");
      return;
    }

    const input = { name, targetAmountMinor, currentAmountMinor, targetDate, status };
    const parsed = (goal ? financialGoalUpdateSchema : financialGoalInputSchema).safeParse(input);
    if (!parsed.success) {
      setClientError(parsed.error.issues[0]?.message ?? "Check the goal details.");
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
        aria-labelledby="financial-goal-form-title"
      >
        <header className="modal-header">
          <div>
            <p className="eyebrow">Savings target</p>
            <h2 id="financial-goal-form-title">{goal ? "Edit goal" : "Add a goal"}</h2>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close goal form"
          >
            <X size={19} aria-hidden="true" />
          </button>
        </header>

        <form className="transaction-form planning-record-form" onSubmit={handleSubmit}>
          <label>
            <span>Goal name</span>
            <input
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Emergency fund"
              maxLength={80}
              required
            />
          </label>

          <div className="form-row split">
            <label>
              <span>Target amount</span>
              <div className="money-input">
                <b>₱</b>
                <input
                  aria-label="Target amount"
                  inputMode="decimal"
                  value={targetAmount}
                  onChange={(event) => setTargetAmount(event.target.value)}
                  placeholder="0.00"
                  required
                />
              </div>
            </label>
            <label>
              <span>Saved so far</span>
              <div className="money-input">
                <b>₱</b>
                <input
                  aria-label="Saved so far"
                  inputMode="decimal"
                  value={currentAmount}
                  onChange={(event) => setCurrentAmount(event.target.value)}
                  placeholder="0.00"
                  required
                />
              </div>
            </label>
          </div>

          <div className="form-row split">
            <label>
              <span>Target date</span>
              <input
                type="date"
                value={targetDate}
                onChange={(event) => setTargetDate(event.target.value)}
                required
              />
            </label>
            <label>
              <span>Status</span>
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value as FinancialGoalStatus)}
              >
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="completed">Completed</option>
              </select>
            </label>
          </div>

          <p className="planning-form-note">
            The assistant may read this goal for savings projections, but it cannot change it.
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
              {busy ? "Saving…" : goal ? "Save changes" : "Add goal"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
