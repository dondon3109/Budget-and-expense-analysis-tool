import type { ReactNode } from "react";

import { LegalPageLayout } from "../../components/legal/LegalPageLayout";
import { formatPeso } from "../../lib/formatters";
import { allocateBudget, DEFAULT_PERCENTAGES } from "./allocateBudget";
import "./BudgetCalculatorPage.css";

export const BUDGET_CALCULATOR_LAST_UPDATED = "August 31, 2026";

const EXAMPLE_INCOMES_MINOR = [1_800_000, 3_000_000, 5_000_000];

/** Static apart from `calculator`, the Astro island that does the arithmetic. */
export function BudgetCalculatorPage({ calculator }: { calculator?: ReactNode }) {
  return (
    <LegalPageLayout
      title="50/30/20 Budget Calculator for Philippine Pesos"
      summary="Split your monthly take-home pay into needs, wants, and savings with exact centavo accuracy. Runs entirely in your browser — nothing you type is sent anywhere, and you do not need an account."
      lastUpdated={BUDGET_CALCULATOR_LAST_UPDATED}
    >
      {calculator}

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
                <th scope="row">{formatPeso(incomeMinor)}</th>
                <td>{formatPeso(example.needs)}</td>
                <td>{formatPeso(example.wants)}</td>
                <td>{formatPeso(example.savings)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <h2>How the 50/30/20 rule works in pesos</h2>
      <p>
        The rule is a starting frame, not a law. Take-home pay is split three ways: 50% for needs
        you cannot drop, 30% for wants you could drop, and 20% for savings and paying down debt
        faster than the minimum. Filipino households often run needs well above 50% once rent,
        utilities, and transport are counted, especially in Metro Manila — if that is you, treat the
        target as a direction rather than a scorecard and move one percentage point at a time.
      </p>
      <p>
        Two local details change the picture. First, budget from take-home pay, because SSS,
        Pag-IBIG, PhilHealth, and withholding tax are already gone before the money reaches you.
        Second, treat your 13th month pay and any bonus as savings or debt payoff rather than as
        spendable monthly income — it arrives once a year, and a budget that quietly assumes
        thirteen months will run short every January.
      </p>
      <p>
        The percentages above are adjustable because the standard split is not universal. Someone
        carrying high-interest credit card debt is better served by a larger savings bucket until
        that balance clears; someone with stable housing can often push savings higher.
      </p>

      <h2>Why centavo accuracy matters</h2>
      <p>
        Most calculators round each bucket independently and quietly drop the difference. Split
        ₱30,000.01 three ways and the naive result can lose a centavo, which sounds trivial until
        your ledger no longer matches your bank. Zoption stores money as whole centavos and does the
        same in this calculator, so the three buckets always sum to exactly what you entered.
      </p>

      <h2>Keep the split honest</h2>
      <p>
        A plan only survives contact with real spending. Import your BDO, BPI, or MariBank statement
        and Zoption will categorize it against the budget you just set, so you can see which bucket
        actually grew last month. See <a href="/import">what you can import</a>, read the{" "}
        <a href="/import/bdo-statement">BDO statement guide</a>, or work through the{" "}
        <a href="/guides/50-30-20-rule-pesos">50/30/20 rule in pesos</a>.
      </p>

      <p className="calc-cta">
        <a className="calc-cta-link" href="/">
          Try Zoption free
        </a>
      </p>
    </LegalPageLayout>
  );
}
