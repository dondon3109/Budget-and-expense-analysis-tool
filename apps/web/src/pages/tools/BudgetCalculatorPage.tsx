import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { MoneyParseError, parseAmountToMinor } from "@zoption/shared";

import { LegalPageLayout } from "../../components/legal/LegalPageLayout";
import { formatMoney } from "../../lib/formatters";
import {
  allocateBudget,
  DEFAULT_PERCENTAGES,
  type BudgetRulePercentages,
} from "./allocateBudget";
import "./BudgetCalculatorPage.css";

export const BUDGET_CALCULATOR_LAST_UPDATED = "August 31, 2026";

const EXAMPLE_INCOMES_MINOR = [1_800_000, 3_000_000, 5_000_000];

const BUCKET_COPY = [
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
] as const satisfies ReadonlyArray<{ key: keyof BudgetRulePercentages; label: string; blurb: string }>;

export function BudgetCalculatorPage() {
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
    <LegalPageLayout
      title="50/30/20 Budget Calculator for Philippine Pesos"
      summary="Split your monthly take-home pay into needs, wants, and savings with exact centavo accuracy. Runs entirely in your browser — nothing you type is sent anywhere, and you do not need an account."
      lastUpdated={BUDGET_CALCULATOR_LAST_UPDATED}
    >
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
            Use your take-home pay — what actually lands in your account after SSS,
            Pag-IBIG, PhilHealth, and withholding tax.
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
              The three percentages must add up to 100. They currently add up to{" "}
              {percentageTotal}.
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
                <p className="calc-result-amount">{formatMoney(allocation[bucket.key])}</p>
                <p className="calc-result-pct">
                  {percentages[bucket.key]}% of {formatMoney(allocation.total)}
                </p>
                <p className="calc-result-blurb">{bucket.blurb}</p>
              </article>
            ))
          : null}
      </section>

      {allocation ? (
        <p className="calc-exact">
          These three amounts add up to exactly {formatMoney(allocation.total)}. Nothing is
          lost to rounding: every centavo is assigned, so the split always reconciles with
          the number you typed.
        </p>
      ) : null}

      <h2>Worked examples</h2>
      <table className="calc-table">
        <thead>
          <tr>
            <th scope="col">Monthly take-home</th>
            <th scope="col">Needs (50%)</th>
            <th scope="col">Wants (30%)</th>
            <th scope="col">Savings (20%)</th>
          </tr>
        </thead>
        <tbody>
          {EXAMPLE_INCOMES_MINOR.map((incomeMinor) => {
            const example = allocateBudget(incomeMinor, DEFAULT_PERCENTAGES);
            return (
              <tr key={incomeMinor}>
                <th scope="row">{formatMoney(incomeMinor)}</th>
                <td>{formatMoney(example.needs)}</td>
                <td>{formatMoney(example.wants)}</td>
                <td>{formatMoney(example.savings)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <h2>How the 50/30/20 rule works in pesos</h2>
      <p>
        The rule is a starting frame, not a law. Take-home pay is split three ways: 50%
        for needs you cannot drop, 30% for wants you could drop, and 20% for savings and
        paying down debt faster than the minimum. Filipino households often run needs
        well above 50% once rent, utilities, and transport are counted, especially in
        Metro Manila — if that is you, treat the target as a direction rather than a
        scorecard and move one percentage point at a time.
      </p>
      <p>
        Two local details change the picture. First, budget from take-home pay, because
        SSS, Pag-IBIG, PhilHealth, and withholding tax are already gone before the money
        reaches you. Second, treat your 13th month pay and any bonus as savings or debt
        payoff rather than as spendable monthly income — it arrives once a year, and a
        budget that quietly assumes thirteen months will run short every January.
      </p>
      <p>
        The percentages above are adjustable because the standard split is not universal.
        Someone carrying high-interest credit card debt is better served by a larger
        savings bucket until that balance clears; someone with stable housing can often
        push savings higher.
      </p>

      <h2>Why centavo accuracy matters</h2>
      <p>
        Most calculators round each bucket independently and quietly drop the difference.
        Split ₱30,000.01 three ways and the naive result can lose a centavo, which sounds
        trivial until your ledger no longer matches your bank. Zoption stores money as
        whole centavos and does the same in this calculator, so the three buckets always
        sum to exactly what you entered.
      </p>

      <h2>Keep the split honest</h2>
      <p>
        A plan only survives contact with real spending. Import your BDO, BPI, or MariBank
        statement and Zoption will categorize it against the budget you just set, so you
        can see which bucket actually grew last month. See{" "}
        <Link to="/import">what you can import</Link> or read the{" "}
        <Link to="/import/bdo-statement">BDO statement guide</Link>.
      </p>

      <p className="calc-cta">
        <Link className="calc-cta-link" to="/">
          Try Zoption free
        </Link>
      </p>
    </LegalPageLayout>
  );
}
