import type { CashflowTrend, CashflowTrendView } from "@zoption/shared";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useRef } from "react";

import { useReducedMotion } from "../../hooks/useReducedMotion";
import { isBillingEnforcementError } from "../../lib/api";
import { formatMoney, formatMonth, formatPeriod } from "../../lib/formatters";
import { UpgradePrompt } from "../billing/UpgradePrompt";
import { createMonthlyTrendAxis, formatMonthlyTrendTick } from "../../lib/monthlyTrendAxis";

const trendOptions: Array<{ value: CashflowTrendView; label: string }> = [
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "sixMonth", label: "Six-month" },
];

interface Props {
  data?: CashflowTrend;
  selectedView: CashflowTrendView;
  onViewChange: (view: CashflowTrendView) => void;
  isLoading?: boolean;
  error?: Error | null;
  onRetry?: () => void;
  showSubscribeToPro?: boolean;
  onSubscribeToPro?: (trigger: HTMLButtonElement) => void;
}

function formatTrendDate(date: string, granularity: CashflowTrend["granularity"]): string {
  if (granularity === "month") return formatMonth(date.slice(0, 7));

  return new Intl.DateTimeFormat("en-PH", {
    weekday: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

function formatTrendTooltipDate(date: string, granularity: CashflowTrend["granularity"]): string {
  if (granularity === "month") {
    return new Intl.DateTimeFormat("en-PH", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${date}T00:00:00Z`));
  }

  return new Intl.DateTimeFormat("en-PH", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

function xAxisInterval(data: CashflowTrend): number | undefined {
  if (data.granularity === "month" || data.points.length <= 8) return 0;
  return Math.ceil(data.points.length / 7) - 1;
}

export function MonthlyTrend({
  data,
  selectedView,
  onViewChange,
  isLoading = false,
  error,
  onRetry,
  showSubscribeToPro = false,
  onSubscribeToPro,
}: Props) {
  const reduceMotion = useReducedMotion();
  const optionRefs = useRef<Partial<Record<CashflowTrendView, HTMLButtonElement | null>>>({});
  const maximumMinor = data?.points.reduce(
    (maximum, item) => Math.max(maximum, item.incomeMinor, item.expenseMinor),
    0,
  );
  const axis = createMonthlyTrendAxis(maximumMinor ?? 0);
  const selectedLabel = trendOptions.find((option) => option.value === selectedView)?.label;
  const hasActivity = Boolean(
    data?.points.some((point) => point.incomeMinor !== 0 || point.expenseMinor !== 0),
  );

  function handleOptionKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number | undefined;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = (index + 1) % trendOptions.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = (index - 1 + trendOptions.length) % trendOptions.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = trendOptions.length - 1;
    }

    if (nextIndex === undefined) return;
    event.preventDefault();
    const nextOption = trendOptions[nextIndex];
    if (!nextOption) return;
    onViewChange(nextOption.value);
    optionRefs.current[nextOption.value]?.focus();
  }

  return (
    <section className="panel trend-panel" aria-labelledby="trend-title" aria-busy={isLoading}>
      <div className="panel-heading trend-panel-heading">
        <div>
          <p className="eyebrow">{selectedLabel} view</p>
          <h2 id="trend-title">Money in and out</h2>
          {data && (
            <p className="trend-period">
              {formatPeriod(data.range.from, data.range.to)}
              <span className="trend-currency-note"> · USD converted to ₱</span>
            </p>
          )}
        </div>
        <div className="trend-panel-actions">
          <div className="trend-view-options" role="radiogroup" aria-label="Cashflow time range">
            {trendOptions.map((option, index) => {
              const selected = option.value === selectedView;
              return (
                <button
                  key={option.value}
                  ref={(element) => {
                    optionRefs.current[option.value] = element;
                  }}
                  className="trend-view-option"
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  tabIndex={selected ? 0 : -1}
                  data-selected={selected || undefined}
                  onClick={() => onViewChange(option.value)}
                  onKeyDown={(event) => handleOptionKeyDown(event, index)}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          {hasActivity && (
            <div className="chart-key" aria-label="Chart legend">
              <span className="income-key" aria-hidden="true" /> <span>Income</span>
              <span className="expense-key" aria-hidden="true" /> <span>Expenses</span>
            </div>
          )}
        </div>
      </div>
      {isLoading ? (
        <div className="panel-empty trend-panel-loading" role="status">
          <strong>Updating your cashflow view</strong>
          <p>Loading the selected time range.</p>
        </div>
      ) : error ? (
        isBillingEnforcementError(error) ? (
          <UpgradePrompt error={error} />
        ) : (
          <div className="panel-empty trend-panel-error" role="alert">
            <strong>The cashflow view could not be loaded.</strong>
            <p>{error.message}</p>
            {onRetry && (
              <button className="button secondary" type="button" onClick={onRetry}>
                Try again
              </button>
            )}
          </div>
        )
      ) : !hasActivity || !data ? (
        <div className="panel-empty trend-panel-empty">
          {data && selectedView === "weekly" ? (
            <>
              <strong>No money in or out for this week</strong>
              <p>
                No transactions fall within {formatPeriod(data.range.from, data.range.to)}.
                Transactions outside these displayed dates are not included in the weekly view.
              </p>
              {showSubscribeToPro && onSubscribeToPro && (
                <button
                  className="button primary compact"
                  type="button"
                  onClick={(event) => onSubscribeToPro(event.currentTarget)}
                >
                  Subscribe to Pro
                </button>
              )}
            </>
          ) : (
            <>
              <strong>No money in or out for this period</strong>
              <p>
                Add transactions dated within this {selectedLabel?.toLocaleLowerCase("en")} range to
                see your cashflow here.
              </p>
            </>
          )}
        </div>
      ) : (
        <>
          <div className="trend-chart" aria-hidden="true">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.points} margin={{ top: 12, right: 6, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="incomeFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-income)" stopOpacity={0.16} />
                    <stop offset="100%" stopColor="var(--chart-income)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="expenseFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-expense)" stopOpacity={0.13} />
                    <stop offset="100%" stopColor="var(--chart-expense)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={(date) => formatTrendDate(String(date), data.granularity)}
                  interval={xAxisInterval(data)}
                  minTickGap={14}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "var(--chart-axis)", fontSize: 12 }}
                />
                <YAxis
                  ticks={axis.ticks}
                  domain={axis.domain}
                  interval={0}
                  allowDecimals={false}
                  tickFormatter={(value) => formatMonthlyTrendTick(Number(value))}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "var(--chart-axis)", fontSize: 11 }}
                />
                <Tooltip
                  labelFormatter={(label) =>
                    formatTrendTooltipDate(String(label), data.granularity)
                  }
                  formatter={(value, name) =>
                    `${name}: ${formatMoney(Number(value))}`
                  }
                  contentStyle={{
                    background: "var(--chart-tooltip-bg)",
                    border: "1px solid var(--chart-tooltip-border)",
                    borderRadius: 10,
                    color: "var(--ink)",
                  }}
                  labelStyle={{ color: "var(--ink)" }}
                />
                <Area
                  type="linear"
                  dataKey="incomeMinor"
                  name="Income"
                  stroke="var(--chart-income)"
                  strokeWidth={2}
                  fill="url(#incomeFill)"
                  isAnimationActive={!reduceMotion}
                  animationDuration={520}
                  animationEasing="ease-out"
                />
                <Area
                  type="linear"
                  dataKey="expenseMinor"
                  name="Expenses"
                  stroke="var(--chart-expense)"
                  strokeWidth={2}
                  fill="url(#expenseFill)"
                  isAnimationActive={!reduceMotion}
                  animationDuration={520}
                  animationEasing="ease-out"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <table className="sr-only">
            <caption>{selectedLabel} money in and expenses</caption>
            <thead>
              <tr>
                <th scope="col">Period</th>
                <th scope="col">Income (₱)</th>
                <th scope="col">Expenses (₱)</th>
              </tr>
            </thead>
            <tbody>
              {data.points.map((item) => (
                <tr key={item.date}>
                  <th scope="row">{formatTrendTooltipDate(item.date, data.granularity)}</th>
                  <td>{formatMoney(item.incomeMinor)}</td>
                  <td>{formatMoney(item.expenseMinor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
