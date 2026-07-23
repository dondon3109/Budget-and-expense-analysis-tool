import type { DashboardSummary } from "@zoption/shared";
import { Link } from "react-router-dom";

import { formatMoney } from "../../lib/formatters";

interface Props {
  data: DashboardSummary["budgetProgress"];
}

export function BudgetProgress({ data }: Props) {
  return (
    <section className="panel budget-panel" aria-labelledby="budget-title">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Monthly plan</p>
          <h2 id="budget-title">Budget progress</h2>
        </div>
        <Link to="/app/budgets" className="text-button">
          Edit budgets
        </Link>
      </div>
      {data.length === 0 ? (
        <div className="panel-empty">
          <strong>No budget plan for this month</strong>
          <p>Set category limits to compare your plan with actual spending.</p>
        </div>
      ) : (
        <div className="budget-list">
          {data.map((item) => {
            const isOver = item.usedPercent > 100;
            return (
              <div className="budget-row" key={item.categoryId}>
                <div className="budget-label">
                  <strong>{item.name}</strong>
                  <span>
                    {formatMoney(item.spentMinor)} of {formatMoney(item.limitMinor)}
                  </span>
                </div>
                <div
                  className="progress-track"
                  aria-label={`${item.name}: ${item.usedPercent}% used`}
                  role="progressbar"
                  aria-valuenow={Math.min(item.usedPercent, 100)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <span
                    className={isOver ? "over" : ""}
                    style={{
                      width: `${Math.min(item.usedPercent, 100)}%`,
                      backgroundColor: isOver ? undefined : item.color,
                    }}
                  />
                </div>
                <span className={isOver ? "budget-value over" : "budget-value"}>
                  {item.usedPercent}%
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
