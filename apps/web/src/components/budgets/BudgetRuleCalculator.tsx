import {
  allocateBudget,
  currencyMetadata,
  DEFAULT_BUDGET_RULE_PERCENTAGES,
  MoneyParseError,
  parseAmountToMinor,
  type BudgetRulePercentages,
} from "@zoption/shared";
import { useState } from "react";

import { formatMoney } from "../../lib/formatters";
import { useWorkspaceCurrency } from "../../lib/workspaceCurrency";
import "./BudgetRuleCalculator.css";

const BUCKETS = [
  { key: "needs", label: "Needs", hint: "Rent, utilities, groceries, transport, minimum debt" },
  { key: "wants", label: "Wants", hint: "Eating out, subscriptions, shopping, travel" },
  { key: "savings", label: "Savings & debt payoff", hint: "Emergency fund, goals, extra debt" },
] as const satisfies ReadonlyArray<{
  key: keyof BudgetRulePercentages;
  label: string;
  hint: string;
}>;

function parseIncome(input: string): { incomeMinor: number } | { error: string } | null {
  if (!input.trim()) return null;
  try {
    return { incomeMinor: parseAmountToMinor(input) };
  } catch (error) {
    return { error: error instanceof MoneyParseError ? error.message : "Enter a valid amount." };
  }
}

/**
 * The same 50/30/20 split as the public calculator (`allocateBudget` in `@zoption/shared`),
 * in the workspace currency. Nothing here is saved: it is a guide for setting the limits
 * in the plan above.
 */
export function BudgetRuleCalculator() {
  const currency = useWorkspaceCurrency();
  const [incomeInput, setIncomeInput] = useState("");
  const [percentages, setPercentages] = useState<BudgetRulePercentages>(
    DEFAULT_BUDGET_RULE_PERCENTAGES,
  );

  const income = parseIncome(incomeInput);
  const percentageTotal = percentages.needs + percentages.wants + percentages.savings;
  const allocation =
    income && "incomeMinor" in income && percentageTotal === 100
      ? allocateBudget(income.incomeMinor, percentages)
      : null;
  const isDefault =
    percentages.needs === DEFAULT_BUDGET_RULE_PERCENTAGES.needs &&
    percentages.wants === DEFAULT_BUDGET_RULE_PERCENTAGES.wants &&
    percentages.savings === DEFAULT_BUDGET_RULE_PERCENTAGES.savings;

  function updatePercentage(key: keyof BudgetRulePercentages, raw: string) {
    const next = Number.parseInt(raw, 10);
    setPercentages((current) => ({ ...current, [key]: Number.isNaN(next) ? 0 : next }));
  }

  return (
    <section className="budget-rule" aria-labelledby="budget-rule-title">
      <div className="budget-rule-heading">
        <h2 id="budget-rule-title">50/30/20 calculator</h2>
        <p>
          Split your monthly take-home pay into needs, wants, and savings, then use the amounts as a
          guide for the limits above. Nothing here is saved.
        </p>
      </div>

      <div className="budget-rule-inputs">
        <label className="budget-amount-input">
          <span>Monthly take-home pay</span>
          <div>
            <b>{currencyMetadata[currency].symbol}</b>
            <input
              inputMode="decimal"
              aria-label="Monthly take-home pay"
              placeholder="30,000.00"
              value={incomeInput}
              onChange={(event) => setIncomeInput(event.target.value)}
            />
          </div>
        </label>
        <fieldset className="budget-rule-split">
          <legend>Split (%)</legend>
          {BUCKETS.map((bucket) => (
            <label key={bucket.key}>
              <span>{bucket.label}</span>
              <input
                type="number"
                min={0}
                max={100}
                value={percentages[bucket.key]}
                onChange={(event) => updatePercentage(bucket.key, event.target.value)}
              />
            </label>
          ))}
          {isDefault ? null : (
            <button
              type="button"
              className="button ghost compact"
              onClick={() => setPercentages(DEFAULT_BUDGET_RULE_PERCENTAGES)}
            >
              Reset to 50 / 30 / 20
            </button>
          )}
        </fieldset>
      </div>

      {income && "error" in income ? (
        <p className="field-error" role="alert">
          {income.error}
        </p>
      ) : null}
      {percentageTotal === 100 ? null : (
        <p className="field-error" role="alert">
          The three percentages must add up to 100. They currently add up to {percentageTotal}.
        </p>
      )}

      <div className="budget-rule-results" aria-live="polite">
        {BUCKETS.map((bucket) => (
          <article key={bucket.key}>
            <span>
              {bucket.label} · {percentages[bucket.key]}%
            </span>
            <strong>{allocation ? formatMoney(allocation[bucket.key], currency) : "—"}</strong>
            <small>{bucket.hint}</small>
          </article>
        ))}
      </div>
    </section>
  );
}
