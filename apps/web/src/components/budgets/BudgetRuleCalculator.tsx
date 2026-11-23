import {
  accountSplitBalance,
  allocateBudget,
  currencyMetadata,
  DEFAULT_BUDGET_RULE_PERCENTAGES,
  distributeBucketLimits,
  formatMinorAmount,
  MoneyParseError,
  parseAmountToMinor,
  type AccountRecord,
  type BudgetRuleBucket,
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
  key: BudgetRuleBucket;
  label: string;
  hint: string;
}>;

const SHORT_BUCKET_LABEL: Record<BudgetRuleBucket, string> = {
  needs: "Needs",
  wants: "Wants",
  savings: "Savings",
};

export interface BudgetRuleCategoryOption {
  id: string;
  name: string;
  color: string;
}

export interface BudgetRuleCalculatorProps {
  /** Active or archived accounts; archived accounts are filtered out automatically. */
  accounts?: readonly AccountRecord[];
  /** Existing active expense categories eligible to receive applied budget limits. */
  categories?: readonly BudgetRuleCategoryOption[];
  /** Current planned total in the workspace currency, compared against Needs + Wants. */
  currentPlanLimitMinor?: number;
  /** Human label for the budget target, such as "July 2026" or "Every month". */
  applyTargetLabel?: string;
  /** Applies the distributed limits for assigned categories to the current budget plan. */
  onApply?: (items: Array<{ categoryId: string; limitMinor: number }>) => void | Promise<void>;
  /** Disables the apply button while an async save is running. */
  applying?: boolean;
  /** Feedback from the latest apply action. */
  applyStatus?: { kind: "success" | "error"; message: string } | null;
  /** False for read-only family viewers or closing workspaces; hides apply controls. */
  canApply?: boolean;
  /** Adjusts heading and spacing when rendered on its own page instead of below a plan. */
  standalone?: boolean;
}

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
 * in the workspace currency or a selected account's native currency. Can optionally apply the
 * split across existing expense categories without creating new ones.
 */
export function BudgetRuleCalculator({
  accounts = [],
  categories = [],
  currentPlanLimitMinor,
  applyTargetLabel,
  onApply,
  applying = false,
  applyStatus = null,
  canApply = true,
  standalone = false,
}: BudgetRuleCalculatorProps) {
  const workspaceCurrency = useWorkspaceCurrency();
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [manualIncomeInput, setManualIncomeInput] = useState("");
  const [percentages, setPercentages] = useState<BudgetRulePercentages>(
    DEFAULT_BUDGET_RULE_PERCENTAGES,
  );
  const [assignments, setAssignments] = useState<Record<string, BudgetRuleBucket>>({});

  const activeAccounts = accounts.filter((account) => !account.archived);
  const selectedAccount =
    activeAccounts.find((account) => account.id === selectedAccountId) ?? null;
  const selectedBalance = selectedAccount ? accountSplitBalance(selectedAccount) : null;
  const activeCurrency = selectedBalance ? selectedBalance.currency : workspaceCurrency;

  const displayedIncome = selectedBalance
    ? selectedBalance.balanceMinor > 0
      ? formatMinorAmount(selectedBalance.balanceMinor)
      : ""
    : manualIncomeInput;

  const income = selectedBalance
    ? selectedBalance.balanceMinor > 0
      ? { incomeMinor: selectedBalance.balanceMinor }
      : {
          error: `${selectedAccount!.name} has a ${selectedBalance.balanceMinor < 0 ? "negative" : "zero"} balance (${formatMoney(selectedBalance.balanceMinor, selectedBalance.currency)}). Choose an account with a positive balance or enter an amount manually.`,
        }
    : parseIncome(manualIncomeInput);

  const percentageTotal = percentages.needs + percentages.wants + percentages.savings;
  const allocation =
    income && "incomeMinor" in income && percentageTotal === 100
      ? allocateBudget(income.incomeMinor, percentages)
      : null;
  const isDefault =
    percentages.needs === DEFAULT_BUDGET_RULE_PERCENTAGES.needs &&
    percentages.wants === DEFAULT_BUDGET_RULE_PERCENTAGES.wants &&
    percentages.savings === DEFAULT_BUDGET_RULE_PERCENTAGES.savings;

  const bucketAssignments: Record<BudgetRuleBucket, string[]> = {
    needs: [],
    wants: [],
    savings: [],
  };
  for (const category of categories) {
    const bucket = assignments[category.id];
    if (bucket) bucketAssignments[bucket].push(category.id);
  }
  const assignedCount =
    bucketAssignments.needs.length +
    bucketAssignments.wants.length +
    bucketAssignments.savings.length;
  const plannedLimits = allocation ? distributeBucketLimits(allocation, bucketAssignments) : [];
  const previewByCategoryId = new Map(
    plannedLimits.map((item) => [item.categoryId, item.limitMinor]),
  );

  const currencyMismatch = activeCurrency !== workspaceCurrency;
  const showApplyPanel = Boolean(onApply && canApply && categories.length > 0);
  const canSubmitApply =
    Boolean(allocation) && plannedLimits.length > 0 && !applying && !currencyMismatch;

  function updatePercentage(key: BudgetRuleBucket, raw: string) {
    const next = Number.parseInt(raw, 10);
    setPercentages((current) => ({ ...current, [key]: Number.isNaN(next) ? 0 : next }));
  }

  function toggleCategoryBucket(categoryId: string, bucket: BudgetRuleBucket) {
    setAssignments((current) => {
      if (current[categoryId] === bucket) {
        const next = { ...current };
        delete next[categoryId];
        return next;
      }
      return { ...current, [categoryId]: bucket };
    });
  }

  function handleApply() {
    if (!onApply || !canSubmitApply) return;
    void onApply(plannedLimits.map(({ categoryId, limitMinor }) => ({ categoryId, limitMinor })));
  }

  return (
    <section
      id="budget-rule"
      className={standalone ? "budget-rule standalone" : "budget-rule"}
      aria-labelledby="budget-rule-title"
    >
      <div className="budget-rule-heading">
        {standalone ? (
          <h1 id="budget-rule-title">50/30/20 calculator</h1>
        ) : (
          <h2 id="budget-rule-title">50/30/20 calculator</h2>
        )}
        <p>
          Split your monthly take-home pay or a selected account balance into needs, wants, and
          savings. Nothing changes until you apply it to your categories.
        </p>
      </div>

      <div className="budget-rule-inputs">
        {activeAccounts.length > 0 && (
          <label className="budget-rule-source">
            <span>Split from</span>
            <select
              aria-label="Split from"
              value={selectedAccount ? selectedAccount.id : ""}
              onChange={(event) => {
                const nextId = event.target.value;
                setSelectedAccountId(nextId);
                if (!nextId && selectedBalance && selectedBalance.balanceMinor > 0) {
                  setManualIncomeInput(formatMinorAmount(selectedBalance.balanceMinor));
                }
              }}
            >
              <option value="">Manual take-home pay</option>
              {activeAccounts.map((account) => {
                const { balanceMinor, currency } = accountSplitBalance(account);
                return (
                  <option key={account.id} value={account.id}>
                    {account.name} ({formatMoney(balanceMinor, currency)})
                  </option>
                );
              })}
            </select>
          </label>
        )}

        <label className="budget-amount-input">
          <span>
            {selectedAccount ? `${selectedAccount.name} balance` : "Monthly take-home pay"}
          </span>
          <div>
            <b>{currencyMetadata[activeCurrency].symbol}</b>
            <input
              inputMode="decimal"
              aria-label="Monthly take-home pay"
              placeholder="30,000.00"
              value={displayedIncome}
              onChange={(event) => {
                setSelectedAccountId("");
                setManualIncomeInput(event.target.value);
              }}
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
            <strong>
              {allocation ? formatMoney(allocation[bucket.key], activeCurrency) : "—"}
            </strong>
            <small>{bucket.hint}</small>
          </article>
        ))}
      </div>

      {allocation && currentPlanLimitMinor !== undefined && !currencyMismatch ? (
        <p className="budget-rule-comparison">
          Current plan: <strong>{formatMoney(currentPlanLimitMinor, workspaceCurrency)}</strong> ·
          Needs + Wants target:{" "}
          <strong>{formatMoney(allocation.needs + allocation.wants, workspaceCurrency)}</strong>
        </p>
      ) : null}

      {showApplyPanel ? (
        <div className="budget-rule-apply">
          <div className="budget-rule-apply-header">
            <div>
              <h3>Apply to existing categories</h3>
              <p>
                Choose which existing expense categories belong to each bucket. Each bucket divides
                evenly across its chosen categories, and unassigned categories stay unchanged.
                Savings usually belong in transfers or Goals, so assigning Savings is optional.
              </p>
            </div>
            {assignedCount > 0 ? (
              <button
                type="button"
                className="button ghost compact"
                onClick={() => setAssignments({})}
              >
                Clear selection
              </button>
            ) : null}
          </div>

          <div className="budget-rule-category-list">
            {categories.map((category) => {
              const assigned = assignments[category.id];
              const previewMinor = previewByCategoryId.get(category.id);
              return (
                <div className="budget-rule-category-row" key={category.id}>
                  <div className="budget-rule-category-name">
                    <i style={{ background: category.color }} aria-hidden="true" />
                    <span>{category.name}</span>
                  </div>
                  <div
                    className="budget-rule-bucket-group"
                    role="group"
                    aria-label={`${category.name} bucket`}
                  >
                    {BUCKETS.map((bucket) => {
                      const active = assigned === bucket.key;
                      return (
                        <button
                          key={bucket.key}
                          type="button"
                          className={active ? "active" : undefined}
                          aria-pressed={active}
                          onClick={() => toggleCategoryBucket(category.id, bucket.key)}
                        >
                          {SHORT_BUCKET_LABEL[bucket.key]}
                        </button>
                      );
                    })}
                  </div>
                  <span className="budget-rule-category-preview">
                    {assigned
                      ? previewMinor !== undefined
                        ? formatMoney(previewMinor, activeCurrency)
                        : "—"
                      : "Unchanged"}
                  </span>
                </div>
              );
            })}
          </div>

          {currencyMismatch ? (
            <p className="field-error" role="alert">
              Budgets use {workspaceCurrency}. Choose a {workspaceCurrency} account or enter a
              manual amount to apply these limits.
            </p>
          ) : null}

          <div className="budget-rule-apply-actions">
            <button
              type="button"
              className="button primary"
              disabled={!canSubmitApply}
              onClick={handleApply}
            >
              {applying
                ? "Applying…"
                : applyTargetLabel
                  ? `Apply to ${applyTargetLabel}`
                  : "Apply to budgets"}
            </button>
            {applyStatus ? (
              <p
                className={applyStatus.kind === "error" ? "field-error" : "save-confirmation"}
                role={applyStatus.kind === "error" ? "alert" : "status"}
              >
                {applyStatus.message}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
