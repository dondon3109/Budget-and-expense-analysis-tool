import { ArrowRight, Calculator } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

/** Interactive Budget Planner & Safeguard Calculator. */
export function BudgetPlannerCalculator() {
  // Interactive Marketing & Budget Planner State
  const [monthlyBudget, setMonthlyBudget] = useState<number>(50000);
  const [activeBudgetCategories, setActiveBudgetCategories] = useState<number>(5);

  const annualProtectedSurplus = Math.round(monthlyBudget * 0.1) * 12;
  const annualOverrunAvoidance = activeBudgetCategories * 350 * 12;
  const annualTotalBudgetImpact = annualProtectedSurplus + annualOverrunAvoidance;

  return (
    <section className="calculator-section" id="calculator" aria-labelledby="calculator-title">
      <div className="calculator-card">
        <div className="calculator-content">
          <p className="eyebrow">
            <Calculator size={14} aria-hidden="true" /> Interactive Budget Planner
          </p>
          <h2 id="calculator-title">See how budget targets protect your money.</h2>
          <p className="calculator-lead">
            Setting practical category limits stops unmonitored spending drift and gives every peso
            a clear job before the month starts. See what structured budget envelopes save you each
            year.
          </p>

          <div className="calculator-controls">
            <div className="calculator-field">
              <div className="calculator-label-row">
                <span>Planned monthly budget</span>
                <strong>₱{monthlyBudget.toLocaleString()}</strong>
              </div>
              <input
                type="range"
                min={15000}
                max={150000}
                step={5000}
                value={monthlyBudget}
                onChange={(e) => setMonthlyBudget(Number(e.target.value))}
                aria-label="Planned monthly budget slider"
                className="calculator-slider"
              />
              <div className="slider-ticks">
                <span>₱15k</span>
                <span>₱75k</span>
                <span>₱150k</span>
              </div>
            </div>

            <div className="calculator-field">
              <div className="calculator-label-row">
                <span>Active budget categories</span>
                <strong>{activeBudgetCategories} category envelopes</strong>
              </div>
              <div className="calculator-subs-selector">
                {[3, 5, 7, 9, 12].map((count) => (
                  <button
                    type="button"
                    key={count}
                    className={activeBudgetCategories === count ? "selected" : ""}
                    onClick={() => setActiveBudgetCategories(count)}
                  >
                    {count} {count === 12 ? "+" : ""}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="calculator-result-box">
          <span className="result-badge">Projected 1-Year Budget Safeguard</span>
          <div className="result-metric">
            <small>Estimated annual budget savings</small>
            <strong>₱{annualTotalBudgetImpact.toLocaleString()}</strong>
          </div>
          <div className="result-breakdown">
            <div className="breakdown-row">
              <span>Protected monthly margin (~10%)</span>
              <b>₱{annualProtectedSurplus.toLocaleString()}/yr</b>
            </div>
            <div className="breakdown-row">
              <span>Category overrun prevention</span>
              <b>₱{annualOverrunAvoidance.toLocaleString()}/yr</b>
            </div>
          </div>
          <Link className="button primary full-width" to="/signup">
            Build your first budget — Start free <ArrowRight size={16} aria-hidden="true" />
          </Link>
          <small className="calculator-disclaimer">
            Based on an average 10% budget margin achieved through active category envelope targets
            and duplicate expense prevention.
          </small>
        </div>
      </div>
    </section>
  );
}
