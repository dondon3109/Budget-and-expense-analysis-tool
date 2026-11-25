import { useMemo, useRef, useState } from "react";
import { MoneyParseError, parseAmountToMinor } from "@zoption/shared/money";

import { appUrl, NEW_TAB } from "../../lib/appUrl";
import { formatPeso } from "../../lib/formatters";
import { announceSiteEvent, BUDGET_CALCULATOR_SIGNUP_PATH } from "../../lib/siteEvents";
import {
  allocateBudget,
  DEFAULT_BUDGET_RULE_PERCENTAGES,
  type BudgetRuleBucket,
  type BudgetRulePercentages,
} from "@zoption/shared/budget-rule";

const INCOME_PRESETS = [
  { label: "₱18k", value: "18,000.00" },
  { label: "₱25k", value: "25,000.00" },
  { label: "₱30k", value: "30,000.00" },
  { label: "₱50k", value: "50,000.00" },
  { label: "₱80k", value: "80,000.00" },
] as const;

const SPLIT_PRESETS: ReadonlyArray<{
  label: string;
  hint: string;
  percentages: BudgetRulePercentages;
}> = [
  {
    label: "50 / 30 / 20",
    hint: "Classic",
    percentages: DEFAULT_BUDGET_RULE_PERCENTAGES,
  },
  {
    label: "60 / 20 / 20",
    hint: "High bills",
    percentages: { needs: 60, wants: 20, savings: 20 },
  },
  {
    label: "70 / 20 / 10",
    hint: "Starting out",
    percentages: { needs: 70, wants: 20, savings: 10 },
  },
  {
    label: "40 / 30 / 30",
    hint: "Save faster",
    percentages: { needs: 40, wants: 30, savings: 30 },
  },
];

export const BUCKET_COPY = [
  {
    key: "needs",
    label: "Needs",
    shortLabel: "Needs",
    summary: "Essentials your household cannot drop next month.",
    examples: ["Rent", "Utilities", "Groceries", "Transport", "Medicine", "Min. debt"],
  },
  {
    key: "wants",
    label: "Wants",
    shortLabel: "Wants",
    summary: "Nice-to-haves you could pause without stalling your month.",
    examples: ["Dining out", "Subscriptions", "Shopping", "Travel", "Hobbies"],
  },
  {
    key: "savings",
    label: "Savings & debt payoff",
    shortLabel: "Savings",
    summary: "Future buffer and extra payments above minimums.",
    examples: ["Emergency fund", "MP2 / Savings", "Insurance", "Extra debt"],
  },
] as const satisfies ReadonlyArray<{
  key: BudgetRuleBucket;
  label: string;
  shortLabel: string;
  summary: string;
  examples: readonly string[];
}>;

function matchesSplit(a: BudgetRulePercentages, b: BudgetRulePercentages): boolean {
  return a.needs === b.needs && a.wants === b.wants && a.savings === b.savings;
}

/**
 * The calculator island. Its first render is the default ₱30,000 split, which
 * is what the static HTML shows before it hydrates.
 */
export function BudgetCalculator() {
  const [incomeInput, setIncomeInput] = useState("30,000.00");
  const [percentages, setPercentages] = useState<BudgetRulePercentages>(
    DEFAULT_BUDGET_RULE_PERCENTAGES,
  );
  const [copied, setCopied] = useState(false);
  const usedRef = useRef(false);

  // Counts a visitor who changed the default inputs, once per page load. Nothing typed is sent.
  function markUsed() {
    if (usedRef.current) return;
    usedRef.current = true;
    announceSiteEvent("budget_calculator_used");
  }

  const percentageTotal = percentages.needs + percentages.wants + percentages.savings;
  const percentagesValid = percentageTotal === 100;
  const percentageDiff = 100 - percentageTotal;

  const parsed = useMemo(() => {
    try {
      const incomeMinor = parseAmountToMinor(incomeInput);
      // allocateBudget throws on a negative amount, and it runs during render.
      if (incomeMinor < 0) return { incomeMinor: null, error: "Enter an amount of zero or more." };
      return { incomeMinor, error: null };
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

  function setIncome(value: string) {
    markUsed();
    setCopied(false);
    setIncomeInput(value);
  }

  function applySplitPreset(next: BudgetRulePercentages) {
    markUsed();
    setCopied(false);
    setPercentages(next);
  }

  function updatePercentage(key: BudgetRuleBucket, raw: string) {
    markUsed();
    setCopied(false);
    const next = Number.parseInt(raw, 10);
    const clamped = Number.isNaN(next) ? 0 : Math.min(100, Math.max(0, next));
    setPercentages((current) => ({ ...current, [key]: clamped }));
  }

  function nudgePercentage(key: BudgetRuleBucket, delta: number) {
    markUsed();
    setCopied(false);
    setPercentages((current) => {
      const next = Math.min(100, Math.max(0, current[key] + delta));
      return { ...current, [key]: next };
    });
  }

  function balanceToHundred() {
    markUsed();
    setCopied(false);
    setPercentages((current) => {
      const diff = 100 - (current.needs + current.wants + current.savings);
      if (diff === 0) return current;
      // Add leftover to Savings first, or trim Wants then Needs when over 100%.
      if (diff > 0) {
        return { ...current, savings: current.savings + diff };
      }
      let excess = -diff;
      const trimWants = Math.min(current.wants, excess);
      excess -= trimWants;
      const trimNeeds = Math.min(current.needs, excess);
      excess -= trimNeeds;
      const trimSavings = Math.min(current.savings, excess);
      return {
        needs: current.needs - trimNeeds,
        wants: current.wants - trimWants,
        savings: current.savings - trimSavings,
      };
    });
  }

  async function copySplit() {
    if (!allocation || typeof navigator === "undefined" || !navigator.clipboard) return;
    const text = [
      `Monthly take-home: ${formatPeso(allocation.total)}`,
      ...BUCKET_COPY.map(
        (bucket) =>
          `- ${bucket.label} (${percentages[bucket.key]}%): ${formatPeso(allocation[bucket.key])}`,
      ),
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <>
      <section className="calc-panel calc-panel-guided">
        <div className="calc-step">
          <div className="calc-step-head">
            <span className="calc-step-badge" aria-hidden="true">
              1
            </span>
            <label className="calc-label" htmlFor="calc-income">
              Monthly take-home pay
            </label>
          </div>
          <div className="calc-input-row">
            <span className="calc-currency">₱</span>
            <input
              id="calc-income"
              className="calc-input"
              type="text"
              inputMode="decimal"
              value={incomeInput}
              onChange={(event) => setIncome(event.target.value)}
              aria-describedby="calc-income-hint"
            />
          </div>
          <div className="calc-presets" role="group" aria-label="Sample monthly salaries">
            <span className="calc-presets-label">Try:</span>
            {INCOME_PRESETS.map((preset) => {
              const active =
                parsed.incomeMinor !== null &&
                parsed.incomeMinor === parseAmountToMinor(preset.value);
              return (
                <button
                  key={preset.label}
                  type="button"
                  className={active ? "calc-chip active" : "calc-chip"}
                  aria-pressed={active}
                  onClick={() => setIncome(preset.value)}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
          <p className="calc-hint" id="calc-income-hint">
            Use what lands in your account each month after SSS, Pag-IBIG, PhilHealth, and
            withholding tax.
          </p>
          {parsed.error ? (
            <p className="calc-error" role="alert">
              {parsed.error}
            </p>
          ) : null}
        </div>

        <fieldset className="calc-step calc-splits-step">
          <div className="calc-step-head calc-step-head-spread">
            <div className="calc-step-head">
              <span className="calc-step-badge" aria-hidden="true">
                2
              </span>
              <legend className="calc-label">Choose your split</legend>
            </div>
            <span
              className={percentagesValid ? "calc-total-pill valid" : "calc-total-pill invalid"}
              aria-live="polite"
            >
              Total: {percentageTotal}%
            </span>
          </div>

          <div className="calc-presets" role="group" aria-label="Split presets">
            {SPLIT_PRESETS.map((preset) => {
              const active = matchesSplit(percentages, preset.percentages);
              return (
                <button
                  key={preset.label}
                  type="button"
                  className={active ? "calc-chip active" : "calc-chip"}
                  aria-pressed={active}
                  onClick={() => applySplitPreset(preset.percentages)}
                >
                  <strong>{preset.label}</strong> · {preset.hint}
                </button>
              );
            })}
          </div>

          <div className="calc-split-grid">
            {BUCKET_COPY.map((bucket) => (
              <div className={`calc-split-card calc-bucket-${bucket.key}`} key={bucket.key}>
                <label className="calc-split-card-label" htmlFor={`calc-split-${bucket.key}`}>
                  <i className="calc-bucket-dot" aria-hidden="true" />
                  <span>{bucket.shortLabel}</span>
                </label>
                <div className="calc-split-control">
                  <button
                    type="button"
                    className="calc-step-btn"
                    aria-label={`Decrease ${bucket.label} by 5%`}
                    disabled={percentages[bucket.key] <= 0}
                    onClick={() => nudgePercentage(bucket.key, -5)}
                  >
                    −
                  </button>
                  <div className="calc-split-number">
                    <input
                      id={`calc-split-${bucket.key}`}
                      className="calc-split-input"
                      type="number"
                      min={0}
                      max={100}
                      value={percentages[bucket.key]}
                      onChange={(event) => updatePercentage(bucket.key, event.target.value)}
                    />
                    <span className="calc-split-pct">%</span>
                  </div>
                  <button
                    type="button"
                    className="calc-step-btn"
                    aria-label={`Increase ${bucket.label} by 5%`}
                    disabled={percentages[bucket.key] >= 100}
                    onClick={() => nudgePercentage(bucket.key, 5)}
                  >
                    +
                  </button>
                </div>
              </div>
            ))}
          </div>

          {percentagesValid ? null : (
            <div className="calc-balance-banner" role="alert">
              <p className="calc-error">
                {percentageDiff > 0
                  ? `${percentageDiff}% left to assign so the split adds up to 100%.`
                  : `${Math.abs(percentageDiff)}% over 100%. Lower a bucket or auto-balance.`}
              </p>
              <div className="calc-balance-actions">
                <button type="button" className="calc-chip active" onClick={balanceToHundred}>
                  Balance to 100%
                </button>
                <button
                  type="button"
                  className="calc-reset"
                  onClick={() => applySplitPreset(DEFAULT_BUDGET_RULE_PERCENTAGES)}
                >
                  Reset 50 / 30 / 20
                </button>
              </div>
            </div>
          )}
        </fieldset>
      </section>

      {allocation ? (
        <div
          className="calc-bar"
          role="img"
          aria-label={`Budget split: ${percentages.needs}% needs, ${percentages.wants}% wants, ${percentages.savings}% savings and debt payoff`}
        >
          {BUCKET_COPY.map((bucket) =>
            percentages[bucket.key] > 0 ? (
              <span
                key={bucket.key}
                className={`calc-bar-segment calc-bucket-${bucket.key}`}
                style={{ width: `${percentages[bucket.key]}%` }}
              />
            ) : null,
          )}
        </div>
      ) : null}

      <section className="calc-results" aria-live="polite">
        {allocation
          ? BUCKET_COPY.map((bucket) => {
              const paydayMinor = Math.floor(allocation[bucket.key] / 2);
              return (
                <article
                  className={`calc-result calc-result-bucket calc-bucket-${bucket.key}`}
                  key={bucket.key}
                >
                  <div className="calc-result-top">
                    <h2 className="calc-result-label">
                      <i className="calc-bucket-dot" aria-hidden="true" />
                      {bucket.label}
                    </h2>
                    <span className="calc-result-badge">{percentages[bucket.key]}%</span>
                  </div>
                  <p className="calc-result-amount">{formatPeso(allocation[bucket.key])}</p>
                  <p className="calc-result-pct">
                    per month · ~{formatPeso(paydayMinor)} per payday (15th &amp; 30th)
                  </p>
                  <p className="calc-result-blurb">{bucket.summary}</p>
                  <ul className="calc-example-tags" aria-label={`${bucket.label} examples`}>
                    {bucket.examples.map((example) => (
                      <li key={example}>{example}</li>
                    ))}
                  </ul>
                </article>
              );
            })
          : null}
      </section>

      {allocation ? (
        <p className="calc-exact">
          These three amounts add up to exactly {formatPeso(allocation.total)}. Every centavo is
          assigned so your split reconciles with the take-home pay you entered.
        </p>
      ) : null}

      <div className="calc-cta calc-cta-row">
        <a
          className="calc-cta-link"
          href={appUrl(BUDGET_CALCULATOR_SIGNUP_PATH)}
          data-site-event="budget_calculator_signup_clicked"
          {...NEW_TAB}
        >
          Track this split in Zoption — start free
        </a>
        {allocation ? (
          <button type="button" className="calc-copy-btn" onClick={() => void copySplit()}>
            {copied ? "Copied split" : "Copy split"}
          </button>
        ) : null}
      </div>
      <p className="calc-hint">
        Zoption shows what you actually spend in each category against your budget, from voice
        entries, receipt photos, or an imported bank statement.
      </p>
    </>
  );
}
