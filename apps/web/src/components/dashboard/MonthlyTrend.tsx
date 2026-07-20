import type { DashboardSummary } from "@budget/shared";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatMoney, formatMonth } from "../../lib/formatters";

interface Props {
  data: DashboardSummary["monthlyTrend"];
}

export function MonthlyTrend({ data }: Props) {
  return (
    <section className="panel trend-panel" aria-labelledby="trend-title">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Six-month view</p>
          <h2 id="trend-title">Money in and out</h2>
        </div>
        {data.length > 0 && (
          <div className="chart-key">
            <span className="income-key" /> In <span className="expense-key" /> Out
          </div>
        )}
      </div>
      {data.length === 0 ? (
        <div className="panel-empty">
          <strong>No trend to show yet</strong>
          <p>Add transactions to build your six-month income and expense view.</p>
        </div>
      ) : (
        <>
          <div className="trend-chart" aria-hidden="true">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 12, right: 6, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="incomeFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3f8f74" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#3f8f74" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="expenseFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#dc8b3f" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="#dc8b3f" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#e7e2d8" vertical={false} />
                <XAxis
                  dataKey="month"
                  tickFormatter={formatMonth}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#73716b", fontSize: 12 }}
                />
                <YAxis
                  tickFormatter={(value) => `₱${Math.round(Number(value) / 100_000)}k`}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#73716b", fontSize: 11 }}
                />
                <Tooltip
                  labelFormatter={(label) => formatMonth(String(label))}
                  formatter={(value) => formatMoney(Number(value))}
                />
                <Area
                  type="monotone"
                  dataKey="incomeMinor"
                  stroke="#3f8f74"
                  strokeWidth={2.5}
                  fill="url(#incomeFill)"
                />
                <Area
                  type="monotone"
                  dataKey="expenseMinor"
                  stroke="#dc8b3f"
                  strokeWidth={2.5}
                  fill="url(#expenseFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <table className="sr-only">
            <caption>Monthly money in and money out</caption>
            <tbody>
              {data.map((item) => (
                <tr key={item.month}>
                  <th>{formatMonth(item.month)}</th>
                  <td>{formatMoney(item.incomeMinor)} in</td>
                  <td>{formatMoney(item.expenseMinor)} out</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
