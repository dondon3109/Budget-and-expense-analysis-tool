import type { DashboardSummary } from "@budget/shared";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Link } from "react-router-dom";

import { formatMoney } from "../../lib/formatters";

interface Props {
  data: DashboardSummary["spendingByCategory"];
}

export function SpendingByCategory({ data }: Props) {
  return (
    <section className="panel category-panel" aria-labelledby="spending-title">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Breakdown</p>
          <h2 id="spending-title">Spending by category</h2>
        </div>
        <Link to="/app/transactions" className="text-button">
          View details
        </Link>
      </div>
      {data.length === 0 ? (
        <div className="panel-empty">
          <strong>No expenses in this period</strong>
          <p>Add or import expense transactions to see how spending is distributed.</p>
        </div>
      ) : (
        <>
          <div className="donut-layout">
            <div className="chart-wrap" aria-hidden="true">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data}
                    dataKey="amountMinor"
                    innerRadius={62}
                    outerRadius={88}
                    paddingAngle={3}
                    stroke="var(--chart-slice-separator)"
                    strokeWidth={2}
                  >
                    {data.map((entry) => (
                      <Cell key={entry.categoryId} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value) => formatMoney(Number(value))}
                    contentStyle={{
                      background: "var(--chart-tooltip-bg)",
                      border: "1px solid var(--chart-tooltip-border)",
                      borderRadius: 10,
                      color: "var(--ink)",
                    }}
                    itemStyle={{ color: "var(--ink)" }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="donut-center">
                <span>Top category</span>
                <strong>{data[0]?.name}</strong>
              </div>
            </div>
            <div className="category-list">
              {data.map((item) => (
                <div className="category-row" key={item.categoryId}>
                  <span className="color-dot" style={{ backgroundColor: item.color }} />
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
                  <th>{item.name}</th>
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
