import { useRef, useState } from "react";
import { MoneyParseError, parseAmountToMinor } from "@zoption/shared/money";

import { appUrl, NEW_TAB } from "../../lib/appUrl";
import { formatPeso } from "../../lib/formatters";
import { announceSiteEvent, SUBSCRIPTION_CALCULATOR_SIGNUP_PATH } from "../../lib/siteEvents";
import {
  BILLING_CYCLES,
  isBillingCycle,
  subscriptionTotals,
  yearlyCostMinor,
  type BillingCycle,
} from "./subscriptionCosts";

const CYCLE_LABELS: Record<BillingCycle, string> = {
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Every 3 months",
  yearly: "Yearly",
};

/** Enough for any household; the cap keeps the page from growing without limit. */
export const MAX_SUBSCRIPTIONS = 30;

type Row = { id: number; name: string; amountInput: string; cycle: BillingCycle };

/**
 * Example rows, not price claims: the visitor replaces them with what they pay.
 * Generic names keep the page from quoting a provider's price that later changes.
 */
const EXAMPLE_ROWS: readonly Row[] = [
  { id: 1, name: "Video streaming", amountInput: "549.00", cycle: "monthly" },
  { id: 2, name: "Music streaming", amountInput: "169.00", cycle: "monthly" },
  { id: 3, name: "Cloud storage", amountInput: "49.00", cycle: "monthly" },
  { id: 4, name: "Gym membership", amountInput: "1,500.00", cycle: "monthly" },
  { id: 5, name: "Antivirus", amountInput: "1,299.00", cycle: "yearly" },
];

function parseRowAmount(input: string): { amountMinor: number } | { error: string } {
  if (!input.trim()) return { error: "Enter the amount you pay." };
  try {
    return { amountMinor: parseAmountToMinor(input) };
  } catch (error) {
    return { error: error instanceof MoneyParseError ? error.message : "Enter a valid amount." };
  }
}

/**
 * The calculator island. Its first render is the example list, which is what the
 * static HTML shows before it hydrates. Names and amounts never leave the page.
 */
export function SubscriptionCalculator() {
  const [rows, setRows] = useState<Row[]>(() => [...EXAMPLE_ROWS]);
  const nextIdRef = useRef(EXAMPLE_ROWS.length + 1);
  const usedRef = useRef(false);

  // Counts a visitor who changed the list, once per page load. Nothing typed is sent.
  function markUsed() {
    if (usedRef.current) return;
    usedRef.current = true;
    announceSiteEvent("subscription_calculator_used");
  }

  function updateRow(id: number, patch: Partial<Omit<Row, "id">>) {
    markUsed();
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  function addRow() {
    markUsed();
    const id = nextIdRef.current;
    nextIdRef.current += 1;
    setRows((current) => [...current, { id, name: "", amountInput: "", cycle: "monthly" }]);
  }

  function removeRow(id: number) {
    markUsed();
    setRows((current) => current.filter((row) => row.id !== id));
  }

  const parsedRows = rows.map((row) => ({ row, amount: parseRowAmount(row.amountInput) }));
  const charges = parsedRows.flatMap(({ row, amount }) =>
    "amountMinor" in amount ? [{ amountMinor: amount.amountMinor, cycle: row.cycle }] : [],
  );
  const totals = subscriptionTotals(charges);
  const skipped = rows.length - charges.length;

  return (
    <>
      <section className="calc-panel sub-panel" aria-label="Your subscriptions">
        <ol className="sub-list">
          {parsedRows.map(({ row, amount }, index) => {
            const label = row.name.trim() || `Subscription ${index + 1}`;
            return (
              <li className="sub-row" key={row.id}>
                <input
                  className="sub-name"
                  type="text"
                  value={row.name}
                  placeholder={`Subscription ${index + 1}`}
                  aria-label={`Name of subscription ${index + 1}`}
                  maxLength={60}
                  onChange={(event) => updateRow(row.id, { name: event.target.value })}
                />
                <div className="calc-input-row sub-amount">
                  <span className="calc-currency">₱</span>
                  <input
                    className="calc-input"
                    type="text"
                    inputMode="decimal"
                    value={row.amountInput}
                    aria-label={`Amount for ${label}`}
                    onChange={(event) => updateRow(row.id, { amountInput: event.target.value })}
                  />
                </div>
                <select
                  className="sub-cycle"
                  value={row.cycle}
                  aria-label={`How often ${label} charges you`}
                  onChange={(event) => {
                    if (isBillingCycle(event.target.value)) {
                      updateRow(row.id, { cycle: event.target.value });
                    }
                  }}
                >
                  {BILLING_CYCLES.map((cycle) => (
                    <option key={cycle} value={cycle}>
                      {CYCLE_LABELS[cycle]}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="calc-reset sub-remove"
                  aria-label={`Remove ${label}`}
                  onClick={() => removeRow(row.id)}
                >
                  Remove
                </button>
                <p className="sub-row-note">
                  {"amountMinor" in amount ? (
                    `${formatPeso(yearlyCostMinor(amount.amountMinor, row.cycle))} a year`
                  ) : (
                    <span className="calc-error">{amount.error}</span>
                  )}
                </p>
              </li>
            );
          })}
        </ol>
        {rows.length < MAX_SUBSCRIPTIONS ? (
          <button type="button" className="calc-reset sub-add" onClick={addRow}>
            Add a subscription
          </button>
        ) : (
          <p className="calc-hint">That is the most this calculator holds.</p>
        )}
      </section>

      <section className="calc-results sub-results" aria-live="polite">
        <article className="calc-result">
          <h2 className="calc-result-label">Per year</h2>
          <p className="calc-result-amount">{formatPeso(totals.yearlyMinor)}</p>
          <p className="calc-result-pct">
            {charges.length} {charges.length === 1 ? "subscription" : "subscriptions"}
          </p>
        </article>
        <article className="calc-result">
          <h2 className="calc-result-label">Per month, on average</h2>
          <p className="calc-result-amount">{formatPeso(totals.monthlyMinor)}</p>
          <p className="calc-result-pct">The yearly total spread over 12 months</p>
        </article>
      </section>

      {skipped > 0 ? (
        <p className="calc-exact">
          {skipped === 1 ? "One row is" : `${skipped} rows are`} left out of the totals until the
          amount is filled in correctly.
        </p>
      ) : null}

      <p className="calc-cta">
        <a
          className="calc-cta-link"
          href={appUrl(SUBSCRIPTION_CALCULATOR_SIGNUP_PATH)}
          data-site-event="subscription_calculator_signup_clicked"
          {...NEW_TAB}
        >
          Track these renewals in Zoption — start free
        </a>
      </p>
      <p className="calc-hint">
        Zoption keeps a calendar of every subscription and shows what renews this month, so a charge
        you forgot about does not surprise you.
      </p>
    </>
  );
}
