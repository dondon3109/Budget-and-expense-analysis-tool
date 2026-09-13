import type { DashboardSummary } from "@zoption/shared";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Link } from "react-router-dom";

import { useReducedMotion } from "../../hooks/useReducedMotion";
import { formatMoney } from "../../lib/formatters";
import { MonthSelector } from "../month/MonthSelector";

interface Props {
  data: DashboardSummary["spendingByCategory"];
  month: string;
  maxMonth: string;
  isLoading?: boolean;
  error?: Error | null;
  onMonthChange: (month: string) => void;
  onRetry?: () => void;
}

export function SpendingByCategory({
  data,
  month,
  maxMonth,
  isLoading = false,
  error,
  onMonthChange,
  onRetry,
}: Props) {
  const reduceMotion = useReducedMotion();

  return (
    <section className="panel category-panel" aria-labelledby="spending-title">
      <div className="panel-heading category-panel-heading">
        <div>
          <p className="eyebrow">Breakdown</p>
          <h2 id="spending-title">Spending by category</h2>
        </div>
        <div className="category-panel-actions">
          <MonthSelector
            className="category-month-picker"
            label="Spending breakdown month"
            value={month}
            max={maxMonth}
            onChange={onMonthChange}
          />
          <Link to="/app/transactions" className="text-button">
            View details
          </Link>
        </div>
      </div>
      {isLoading ? (
        <div className="panel-empty">
          <strong>Loading category spending…</strong>
        </div>
      ) : error ? (
        <div className="panel-empty" role="alert">
          <strong>Category spending could not be loaded.</strong>
          <p>{error.message}</p>
          {onRetry && (
            <button type="button" className="text-button" onClick={onRetry}>
              Try again
            </button>
          )}
        </div>
      ) : data.length === 0 ? (
        <div className="panel-empty">
          <strong>No expenses in this Month</strong>
          <p>Add or import expense transactions to see how spending is distributed.</p>
        </div>
      ) : (
        <>
          <div className="donut-layout">
            {/* Not aria-hidden: recharts hardcodes tabindex="-1" on every pie sector
                (Pie.js:308/319) with no prop to remove it, so hiding this container left
                focusable nodes inside a hidden subtree. The accessible equivalent of this
                chart is the category list beside it; here the chart simply stays out of the
                tab order instead of pretending to be hidden. */}
            <div className="chart-wrap">
              <ResponsiveContainer width="100%" height="100%">
                {/* Decorative: the category list beside it carries the same data. */}
                <PieChart accessibilityLayer={false}>
                  <Pie
                    data={data}
                    dataKey="amountMinor"
                    innerRadius={64}
                    outerRadius={90}
                    paddingAngle={2}
                    cornerRadius={5}
                    stroke="var(--chart-slice-separator)"
                    strokeWidth={2}
                    activeShape={{ outerRadius: 94 }}
                    isAnimationActive={!reduceMotion}
                    animationDuration={460}
                    animationEasing="ease-out"
                  >
                    {data.map((entry) => (
                      <Cell key={entry.categoryId} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value) => formatMoney(Number(value))}
                    contentStyle={{
                      padding: "10px 12px",
                      background: "var(--chart-tooltip-bg)",
                      border: "1px solid var(--chart-tooltip-border)",
                      borderRadius: "var(--radius-md)",
                      boxShadow: "var(--shadow-raised)",
                      color: "var(--ink)",
                      fontFamily: "var(--font-mono)",
                      fontSize: 11,
                    }}
                    labelStyle={{
                      marginBottom: 5,
                      color: "var(--ink)",
                      fontFamily: "var(--font-ui)",
                      fontWeight: 700,
                    }}
                    itemStyle={{ color: "var(--ink)", padding: 0 }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="donut-center">
                <span>Top category</span>
                <strong>{data[0]?.name}</strong>
              </div>
            </div>
            <div
              className="category-list"
              role="region"
              aria-label="Category spending list"
              // Always focusable. This is a capped scroll container (max-height 280px), and
              // gating the tab stop on a row count was a guess at the row height, so a list
              // that did overflow could still be unreachable by keyboard.
              tabIndex={0}
            >
              {data.map((item) => (
                <div className="category-row" key={item.categoryId}>
                  {item.iconEmoji ? (
                    <span className="category-chip-emoji" aria-hidden="true">
                      {item.iconEmoji}
                    </span>
                  ) : (
                    <span className="color-dot" style={{ backgroundColor: item.color }} />
                  )}
                  <div>
                    <strong>{item.name}</strong>
                    <span>{item.sharePercent}% of spending</span>
                  </div>
                  <b>{formatMoney(item.amountMinor)}</b>
                </div>
              ))}
            </div>
          </div>
          <table className="sr-only">
            <caption>Spending by category</caption>
            <tbody>
              {data.map((item) => (
                <tr key={item.categoryId}>
                  <th scope="row">{item.name}</th>
                  <td>{formatMoney(item.amountMinor)}</td>
                  <td>{item.sharePercent}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
