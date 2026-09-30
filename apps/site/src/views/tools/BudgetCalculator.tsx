import { useMemo, useState } from "react";
import { MoneyParseError, parseAmountToMinor } from "@zoption/shared/money";

import { formatPeso } from "../../lib/formatters";
import { allocateBudget, DEFAULT_PERCENTAGES, type BudgetRulePercentages } from "./allocateBudget";

export const BUCKET_COPY = [
  {
    key: "needs",
    label: "Needs",
    blurb:
      "Rent or amortization, utilities, groceries, transport to work, medicine, minimum debt payments, and statutory contributions (SSS, Pag-IBIG, PhilHealth).",
  },
  {
    key: "wants",
    label: "Wants",
    blurb:
      "Eating out, streaming subscriptions, shopping, travel, hobbies, and anything you could drop next month without your household grinding to a halt.",
  },
  {
    key: "savings",
    label: "Savings & debt payoff",
    blurb:
      "Emergency fund, MP2 or other savings, insurance, investments, and any extra you throw at high-interest debt above the minimum.",
  },
] as const satisfies ReadonlyArray<{
  key: keyof BudgetRulePercentages;
  label: string;
  blurb: string;
}>;

/**
 * The calculator island. Its first render is the default ₱30,000 split, which
 * is what the static HTML shows before it hydrates.
 */
export function BudgetCalculator() {
  const [incomeInput, setIncomeInput] = useState("30,000.00");
  const [percentages, setPercentages] = useState<BudgetRulePercentages>(DEFAULT_PERCENTAGES);

  const percentageTotal = percentages.needs + percentages.wants + percentages.savings;
  const percentagesValid = percentageTotal === 100;

  const parsed = useMemo(() => {
    try {
      return { incomeMinor: parseAmountToMinor(incomeInput), error: null };
    } catch (error) {
      return {
        incomeMinor: null,
        error: error instanceof MoneyParseError ? error.message : "Enter a valid amount.",
      };
    }
  }, [incomeInput]);

  const allocation = useMemo(() => {
    if (parsed.incomeMinor === null || !percentagesValid) return null;
    return allocateBudget(parsed.incomeMinor, percentages);
  }, [parsed.incomeMinor, percentages, percentagesValid]);

  function updatePercentage(key: keyof BudgetRulePercentages, raw: string) {
    const next = Number.parseInt(raw, 10);
    setPercentages((current) => ({
      ...current,
      [key]: Number.isNaN(next) ? 0 : next,
    }));
  }

  return (
    <>
      <section className="calc-panel">
        <div className="calc-field">
          <label className="calc-label" htmlFor="calc-income">
            Monthly take-home pay
          </label>
          <div className="calc-input-row">
            <span className="calc-currency">₱</span>
            <input
              id="calc-income"
              className="calc-input"
              type="text"
              inputMode="decimal"
              value={incomeInput}
              onChange={(event) => setIncomeInput(event.target.value)}
              aria-describedby="calc-income-hint"
            />
          </div>
          <p className="calc-hint" id="calc-income-hint">
            Use your take-home pay — what actually lands in your account after SSS, Pag-IBIG,
            PhilHealth, and withholding tax.
          </p>
          {parsed.error ? <p className="calc-error">{parsed.error}</p> : null}
        </div>

        <fieldset className="calc-field calc-splits">
          <legend className="calc-label">Split</legend>
          {(["needs", "wants", "savings"] as const).map((key) => (
            <label className="calc-split" key={key}>
              <span className="calc-split-label">
                {BUCKET_COPY.find((bucket) => bucket.key === key)?.label}
              </span>
              <input
                className="calc-split-input"
                type="number"
                min={0}
                max={100}
                value={percentages[key]}
                onChange={(event) => updatePercentage(key, event.target.value)}
              />
              <span className="calc-split-pct">%</span>
            </label>
          ))}
          {percentagesValid ? null : (
            <p className="calc-error">
              The three percentages must add up to 100. They currently add up to {percentageTotal}.
            </p>
          )}
          {percentagesValid &&
          (percentages.needs !== DEFAULT_PERCENTAGES.needs ||
            percentages.wants !== DEFAULT_PERCENTAGES.wants ||
            percentages.savings !== DEFAULT_PERCENTAGES.savings) ? (
            <button
              type="button"
              className="calc-reset"
              onClick={() => setPercentages(DEFAULT_PERCENTAGES)}
            >
              Reset to 50 / 30 / 20
            </button>
          ) : null}
        </fieldset>
      </section>

      <section className="calc-results" aria-live="polite">
        {allocation
          ? BUCKET_COPY.map((bucket) => (
              <article className="calc-result" key={bucket.key}>
                <h2 className="calc-result-label">{bucket.label}</h2>
                <p className="calc-result-amount">{formatPeso(allocation[bucket.key])}</p>
                <p className="calc-result-pct">
                  {percentages[bucket.key]}% of {formatPeso(allocation.total)}
                </p>
                <p className="calc-result-blurb">{bucket.blurb}</p>
              </article>
            ))
          : null}
      </section>

      {allocation ? (
        <p className="calc-exact">
          These three amounts add up to exactly {formatPeso(allocation.total)}. Nothing is lost to
          rounding: every centavo is assigned, so the split always reconciles with the number you
          typed.
        </p>
      ) : null}
    </>
  );
}
