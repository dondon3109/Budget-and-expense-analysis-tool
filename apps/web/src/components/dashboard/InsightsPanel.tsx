import type { DashboardSummary } from "@zoption/shared";
import { PiggyBank, Repeat2 } from "lucide-react";

import { formatMoney } from "../../lib/formatters";

interface InsightsPanelProps {
  data: DashboardSummary["insights"];
  monthLabel: string;
}

function formatMonth(value: string): string {
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}-01T00:00:00Z`));
}

export function InsightsPanel({ data, monthLabel }: InsightsPanelProps) {
  const hasIncome = data.savingsRatePercent !== null;
  return (
    <section className="panel insights-panel" aria-labelledby="insights-title">
      <div className="panel-heading">
        <div>
          <h2 id="insights-title">Savings and recurring costs</h2>
          <p>Results for {monthLabel} and recurring costs from the six months ending then.</p>
        </div>
      </div>
      <div className="insights-layout">
        <article
          className="savings-insight"
          data-state={data.savingsMinor >= 0 ? "positive" : "negative"}
        >
          <span className="insight-icon" aria-hidden="true">
            <PiggyBank size={18} />
          </span>
          <div>
            <span>
              {data.savingsMinor >= 0 ? "Income left after expenses" : "Expenses exceeded income by"}
            </span>
            <strong>{formatMoney(Math.abs(data.savingsMinor))}</strong>
            <p>
              {hasIncome
                ? `${data.savingsRatePercent}% of ${monthLabel} income remained after expenses. Transfers are excluded.`
                : `No income was recorded in ${monthLabel}. Transfers are excluded.`}
            </p>
          </div>
        </article>
        <div className="recurring-insight">
          <div className="recurring-heading">
            <Repeat2 size={17} aria-hidden="true" />
            <strong>Recurring expenses</strong>
          </div>
          {data.recurringExpenses.length === 0 ? (
            <p className="insight-empty">No expense repeated in at least three recent months.</p>
          ) : (
            <ul>
              {data.recurringExpenses.map((expense) => (
                <li key={`${expense.categoryName}-${expense.description}`}>
                  <div>
                    <strong>{expense.description}</strong>
                    <span>
                      {expense.categoryName} · {expense.occurrenceCount} months through{" "}
                      {formatMonth(expense.latestMonth)}
                    </span>
                  </div>
                  <b>{formatMoney(expense.averageMinor)} avg.</b>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
