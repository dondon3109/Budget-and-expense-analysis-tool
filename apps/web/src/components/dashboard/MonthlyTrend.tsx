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
import { useEffect, useRef, useState } from "react";

import { useReducedMotion } from "../../hooks/useReducedMotion";
import { isBillingEnforcementError } from "../../lib/api";
import {
  formatTrendDate,
  formatTrendTooltipDate,
  trendXAxisInterval,
} from "../../lib/cashflowTrendFormat";
import { formatMoney, formatPeriod } from "../../lib/formatters";
import { createMonthlyTrendAxis, formatMonthlyTrendTick } from "../../lib/monthlyTrendAxis";
import { UpgradePrompt } from "../billing/UpgradePrompt";
import { MobileCashflowChart } from "./MobileCashflowChart";

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

const NARROW_VIEWPORT_QUERY = "(max-width: 760px)";

function getNarrowViewport(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(NARROW_VIEWPORT_QUERY).matches
    : false;
}

/** True on phone-sized viewports, where the chart switches to the touch-first SVG renderer. */
function useNarrowViewport(): boolean {
  const [narrow, setNarrow] = useState(getNarrowViewport);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return undefined;

    const mediaQuery = window.matchMedia(NARROW_VIEWPORT_QUERY);
    const handleChange = () => setNarrow(mediaQuery.matches);

    handleChange();
    mediaQuery.addEventListener?.("change", handleChange);

    return () => mediaQuery.removeEventListener?.("change", handleChange);
  }, []);

  return narrow;
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
  const narrowViewport = useNarrowViewport();
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
          {narrowViewport ? (
            <MobileCashflowChart data={data} />
          ) : (
            <div className="trend-chart" aria-hidden="true">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.points} margin={{ top: 12, right: 6, left: -10, bottom: 0 }}>
                  <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(date) => formatTrendDate(String(date), data.granularity)}
                    interval={trendXAxisInterval(data)}
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
                    cursor={{
                      stroke: "var(--chart-crosshair)",
                      strokeWidth: 1,
                      strokeDasharray: "3 4",
                    }}
                    labelFormatter={(label) =>
                      formatTrendTooltipDate(String(label), data.granularity)
                    }
                    formatter={(value, name) => `${name}: ${formatMoney(Number(value))}`}
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
                      marginBottom: 6,
                      color: "var(--ink)",
                      fontFamily: "var(--font-ui)",
                      fontWeight: 700,
                    }}
                    itemStyle={{ color: "var(--ink)", padding: "2px 0" }}
                  />
                  <Area
                    type="linear"
                    dataKey="incomeMinor"
                    name="Income"
                    stroke="var(--chart-income)"
                    strokeWidth={2}
                    fill="var(--chart-income)"
                    fillOpacity={0.08}
                    dot={false}
                    activeDot={{
                      r: 4,
                      fill: "var(--chart-income)",
                      stroke: "var(--chart-tooltip-bg)",
                      strokeWidth: 2,
                    }}
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
                    fill="var(--chart-expense)"
                    fillOpacity={0.07}
                    dot={false}
                    activeDot={{
                      r: 4,
                      fill: "var(--chart-expense)",
                      stroke: "var(--chart-tooltip-bg)",
                      strokeWidth: 2,
                    }}
                    isAnimationActive={!reduceMotion}
                    animationDuration={520}
                    animationEasing="ease-out"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
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
