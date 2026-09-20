import {
  parseAmountToMinor,
  projectCashflow,
  type CashflowForecastOptions,
  type CashflowForecastResult,
  type SubscriptionMonthItem,
} from "@zoption/shared";
import {
  AlertCircle,
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock,
  DollarSign,
  Info,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { useLayoutEffect, useMemo, useRef, useState } from "react";

import { formatMoney } from "../../lib/formatters";
import "./CashflowForecastSection.css";

export interface CashflowAccountOption {
  id: string;
  name: string;
  balanceMinor: number | null;
}

export interface CashflowForecastSectionProps {
  items: SubscriptionMonthItem[];
  accounts?: CashflowAccountOption[];
  totalBalanceMinor?: number;
}

type ForecastHorizon = 30 | 60 | 90;

const HORIZONS: readonly ForecastHorizon[] = [30, 60, 90];

const CHART_HEIGHT = 264;
/** Leaves room for the y tick labels, the x date labels, and the lowest-point label above the line. */
const CHART_PLOT = { top: 24, right: 18, bottom: 30, left: 76 } as const;
const FALLBACK_CHART_WIDTH = 640;
/** The hover callout is centred on its day, so half its width bounds how far it may travel. */
const CALLOUT_HALF_WIDTH = 112;
/** A flat projection still needs a scale: never squeeze the axis below a ₱10 span. */
const MINIMUM_AXIS_SPAN_MINOR = 1_000;

function formatDisplayDate(dateStr: string): string {
  if (!dateStr) return "";
  try {
    return new Intl.DateTimeFormat("en-PH", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${dateStr}T00:00:00Z`));
  } catch {
    return dateStr;
  }
}

function formatFullDate(dateStr: string): string {
  if (!dateStr) return "";
  try {
    return new Intl.DateTimeFormat("en-PH", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${dateStr}T00:00:00Z`));
  } catch {
    return dateStr;
  }
}

interface BalanceAxis {
  min: number;
  max: number;
  ticks: number[];
}

/** Round an axis step to the next 1 / 2 / 2.5 / 5 × 10ⁿ so the tick labels read as round money. */
function niceMoneyStep(rawStep: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(rawStep, 1)));
  const normalized = rawStep / magnitude;
  if (normalized <= 1) return magnitude;
  if (normalized <= 2) return 2 * magnitude;
  if (normalized <= 2.5) return 2.5 * magnitude;
  if (normalized <= 5) return 5 * magnitude;
  return 10 * magnitude;
}

/** Keeps at most three y labels, giving zero the middle slot whenever it is an interior tick. */
function selectTicks(ticks: number[]): number[] {
  if (ticks.length <= 3) return ticks;
  const middleIndex = Math.floor(ticks.length / 2);
  const zeroIndex = ticks.indexOf(0);
  const middle = zeroIndex > 0 && zeroIndex < ticks.length - 1 ? zeroIndex : middleIndex;
  return [ticks[0]!, ticks[middle]!, ticks[ticks.length - 1]!];
}

/**
 * Balance scale for the projection: the data sets the range, a safety buffer stretches the top so
 * its reference line stays on the chart, and zero joins in only when the projection reaches for it.
 * Both ends snap to round money steps so the y labels land on readable values.
 */
function createBalanceAxis(values: readonly number[], safetyBufferMinor: number): BalanceAxis {
  const lowest = values.length > 0 ? Math.min(...values) : 0;
  const highest = Math.max(...values, 1);
  const reachesZero = lowest < 0 || lowest < highest * 0.25;
  const low = reachesZero ? Math.min(lowest, 0) : lowest;
  const high = Math.max(highest, safetyBufferMinor);
  const span = Math.max(high - low, MINIMUM_AXIS_SPAN_MINOR);
  const padding = span * 0.12;
  const step = niceMoneyStep((span + padding * 2) / 2);
  const min = Math.floor((low - padding) / step) * step;
  const max = Math.ceil((high + padding) / step) * step;

  const ticks: number[] = [];
  for (let value = min; value <= max + step / 2; value += step) ticks.push(Math.round(value));
  return { min, max, ticks: selectTicks(ticks) };
}

/** Reads the typed safety buffer; an amount it cannot represent falls back to zero and says why. */
function parseSafetyBuffer(text: string): { minor: number; error?: string } {
  if (text.trim() === "") return { minor: 0 };

  let parsed: number;
  try {
    parsed = parseAmountToMinor(text);
  } catch (error) {
    return { minor: 0, error: error instanceof Error ? error.message : "Enter a valid amount." };
  }

  if (parsed < 0) return { minor: 0, error: "Enter a reserve of zero or more." };
  return { minor: parsed };
}

interface CashflowProjectionChartProps {
  forecast: CashflowForecastResult;
  safetyBufferMinor: number;
}

/**
 * Hand-written SVG balance line over the horizon. The line carries the shape of the projection, the
 * shaded band below zero separates the deficit region, and every day keeps a hover target that
 * reports its date, closing balance, and the bills due that day.
 */
function CashflowProjectionChart({ forecast, safetyBufferMinor }: CashflowProjectionChartProps) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState<number>(FALLBACK_CHART_WIDTH);
  const [activeDayIndex, setActiveDayIndex] = useState<number | null>(null);
  const timeline = forecast.dailyTimeline;

  useLayoutEffect(() => {
    const element = frameRef.current;
    if (!element) return undefined;
    const measure = () => {
      setWidth(element.clientWidth > 0 ? element.clientWidth : FALLBACK_CHART_WIDTH);
    };
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const axis = useMemo(
    () =>
      createBalanceAxis(
        timeline.map((day) => day.projectedBalanceMinor),
        safetyBufferMinor,
      ),
    [timeline, safetyBufferMinor],
  );

  if (timeline.length === 0) return null;

  const plotWidth = Math.max(0, width - CHART_PLOT.left - CHART_PLOT.right);
  const plotHeight = CHART_HEIGHT - CHART_PLOT.top - CHART_PLOT.bottom;
  const baselineY = CHART_PLOT.top + plotHeight;
  const step = timeline.length > 1 ? plotWidth / (timeline.length - 1) : 0;
  const xAt = (index: number) => CHART_PLOT.left + index * step;
  const yAt = (value: number) =>
    CHART_PLOT.top + (1 - (value - axis.min) / (axis.max - axis.min)) * plotHeight;

  const linePath = timeline
    .map(
      (day, index) =>
        `${index === 0 ? "M" : "L"}${xAt(index).toFixed(1)},${yAt(day.projectedBalanceMinor).toFixed(1)}`,
    )
    .join("");
  const firstX = xAt(0).toFixed(1);
  const lastX = xAt(timeline.length - 1).toFixed(1);
  const areaPath = `${linePath}L${lastX},${baselineY}L${firstX},${baselineY}Z`;

  // Zero only earns a line when the scale reaches it; a projection far above zero leaves it off-chart.
  // Only a projection that actually crosses zero earns a zero line, a deficit band, and the legend
  // entry that names it; an axis floor that merely lands on zero would claim a deficit that is not
  // there.
  const zeroY = axis.min < 0 ? yAt(0) : null;
  const bufferY =
    safetyBufferMinor > 0 && safetyBufferMinor >= axis.min && safetyBufferMinor <= axis.max
      ? yAt(safetyBufferMinor)
      : null;

  const minimumIndex = Math.max(
    0,
    timeline.findIndex((day) => day.date === forecast.minBalanceDate),
  );
  const minimumX = xAt(minimumIndex);
  const minimumY = yAt(forecast.minProjectedBalanceMinor);
  // The low point sits on the near-vertical drop of the bill that caused it, so a label centred on
  // the marker prints straight over that line. Place the text beside the marker instead, on the side
  // that has room inside the frame.
  const minimumLabelToTheRight = minimumX < CHART_PLOT.left + plotWidth * 0.72;
  const minimumAnchor = minimumLabelToTheRight ? "start" : "end";
  const minimumLabelX = minimumX + (minimumLabelToTheRight ? 9 : -9);
  // The lowest point sits near the bottom of the scale, so its label goes above it, clamped to the frame.
  const minimumLabelY = Math.max(CHART_PLOT.top + 14, minimumY - 30);
  const minimumFill =
    forecast.minProjectedBalanceMinor < 0
      ? "var(--danger)"
      : forecast.minProjectedBalanceMinor < safetyBufferMinor
        ? "var(--amber)"
        : "var(--sage)";

  const labelIndices =
    timeline.length > 1 ? [0, Math.floor((timeline.length - 1) / 2), timeline.length - 1] : [0];
  const activeDay = activeDayIndex === null ? undefined : timeline[activeDayIndex]!;
  const activeBills = activeDay?.events.filter((event) => event.type === "bill") ?? [];
  const calloutLeft =
    activeDayIndex === null
      ? 0
      : Math.min(
          Math.max(xAt(activeDayIndex), CALLOUT_HALF_WIDTH),
          Math.max(width - CALLOUT_HALF_WIDTH, CALLOUT_HALF_WIDTH),
        );

  const chartLabel = [
    `Projected balance from ${formatFullDate(forecast.startDate)} to ${formatFullDate(forecast.endDate)}.`,
    `Starts at ${formatMoney(forecast.startingBalanceMinor)},`,
    `lowest ${formatMoney(forecast.minProjectedBalanceMinor)} on ${formatFullDate(forecast.minBalanceDate)},`,
    `ends at ${formatMoney(forecast.endingBalanceMinor)}.`,
    safetyBufferMinor > 0
      ? `Safety buffer ${formatMoney(safetyBufferMinor)}.`
      : "No safety buffer set.",
  ].join(" ");

  return (
    <div className="projection-chart">
      <div className="projection-legend">
        <span className="legend-item">
          <span className="legend-swatch legend-line" aria-hidden="true" />
          Projected balance
        </span>
        {bufferY !== null && (
          <span className="legend-item">
            <span className="legend-swatch legend-buffer" aria-hidden="true" />
            Safety buffer {formatMoney(safetyBufferMinor)}
          </span>
        )}
        {zeroY !== null && (
          <span className="legend-item">
            <span className="legend-swatch legend-deficit" aria-hidden="true" />
            Below ₱0
          </span>
        )}
      </div>

      <div className="projection-chart-frame" ref={frameRef}>
        {activeDay && (
          <div className="projection-callout" style={{ left: calloutLeft }} aria-hidden="true">
            <strong>{formatFullDate(activeDay.date)}</strong>
            <span className="projection-callout-balance">
              {formatMoney(activeDay.projectedBalanceMinor)}
            </span>
            {activeBills.length > 0 ? (
              <ul className="projection-callout-bills">
                {activeBills.map((bill) => (
                  <li key={`${bill.id}-${bill.name}`}>
                    <span>{bill.name}</span>
                    <span>−{formatMoney(bill.amountMinor)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <span className="projection-callout-note">No bills due</span>
            )}
          </div>
        )}

        <svg
          className="projection-chart-svg"
          width={width}
          height={CHART_HEIGHT}
          viewBox={`0 0 ${width} ${CHART_HEIGHT}`}
          role="img"
          aria-label={chartLabel}
          onMouseLeave={() => setActiveDayIndex(null)}
        >
          {axis.ticks.map((tick) => (
            <g key={`tick-${tick}`}>
              <line
                x1={CHART_PLOT.left}
                x2={width - CHART_PLOT.right}
                y1={yAt(tick)}
                y2={yAt(tick)}
                stroke="var(--chart-grid)"
                strokeWidth={1}
              />
              <text
                x={CHART_PLOT.left - 9}
                y={yAt(tick) + 3.5}
                textAnchor="end"
                fontSize={11}
                fill="var(--chart-axis)"
              >
                {formatMoney(tick)}
              </text>
            </g>
          ))}

          {zeroY !== null && (
            <rect
              className="projection-deficit-band"
              x={CHART_PLOT.left}
              y={zeroY}
              width={plotWidth}
              height={Math.max(0, baselineY - zeroY)}
              fill="var(--danger-soft)"
            />
          )}

          <path className="projection-area" d={areaPath} fill="var(--sage)" fillOpacity={0.12} />
          <path
            className="projection-line"
            d={linePath}
            fill="none"
            stroke="var(--sage)"
            strokeWidth={2.5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {bufferY !== null && (
            <g>
              <line
                x1={CHART_PLOT.left}
                x2={width - CHART_PLOT.right}
                y1={bufferY}
                y2={bufferY}
                stroke="var(--amber)"
                strokeWidth={1.5}
                strokeDasharray="7 5"
              />
              <text
                x={width - CHART_PLOT.right}
                y={bufferY - 7}
                textAnchor="end"
                fontSize={11}
                fontWeight={600}
                fill="var(--amber)"
              >
                Buffer {formatMoney(safetyBufferMinor)}
              </text>
            </g>
          )}

          {zeroY !== null && (
            <line
              className="projection-zero-line"
              x1={CHART_PLOT.left}
              x2={width - CHART_PLOT.right}
              y1={zeroY}
              y2={zeroY}
              stroke="var(--chart-axis)"
              strokeWidth={1}
              strokeDasharray="3 4"
            />
          )}

          {timeline.map((day, index) =>
            day.events.some((event) => event.type === "bill") ? (
              <circle
                key={`bill-${day.date}`}
                className="projection-bill-dot"
                cx={xAt(index)}
                cy={yAt(day.projectedBalanceMinor)}
                r={3}
                fill="var(--chart-expense)"
              />
            ) : null,
          )}

          <g className="projection-minimum">
            <circle
              cx={minimumX}
              cy={minimumY}
              r={4.5}
              fill={minimumFill}
              stroke="var(--surface)"
              strokeWidth={2}
            />
            <text
              x={minimumLabelX}
              y={minimumLabelY}
              textAnchor={minimumAnchor}
              fontSize={11}
              fontWeight={700}
              fill="var(--ink)"
              // Halve the risk of the line running through the glyphs wherever the label lands.
              stroke="var(--surface)"
              strokeWidth={3}
              paintOrder="stroke"
            >
              <tspan x={minimumLabelX}>{formatMoney(forecast.minProjectedBalanceMinor)}</tspan>
              <tspan
                x={minimumLabelX}
                dy={13}
                fontSize={10}
                fontWeight={500}
                fill="var(--chart-axis)"
              >
                {formatDisplayDate(forecast.minBalanceDate)}
              </tspan>
            </text>
          </g>

          {labelIndices.map((index) => (
            <text
              key={`date-${index}`}
              x={xAt(index)}
              y={CHART_HEIGHT - 9}
              textAnchor={index === 0 ? "start" : index === timeline.length - 1 ? "end" : "middle"}
              fontSize={11}
              fill="var(--chart-axis)"
            >
              {formatDisplayDate(timeline[index]!.date)}
            </text>
          ))}

          {timeline.map((day, index) => {
            const halfStep = step > 0 ? step / 2 : plotWidth / 2;
            const left = Math.max(CHART_PLOT.left, xAt(index) - halfStep);
            const right = Math.min(width - CHART_PLOT.right, xAt(index) + halfStep);
            const bills = day.events.filter((event) => event.type === "bill");
            return (
              <rect
                key={`hit-${day.date}`}
                className="projection-day-hit"
                x={left}
                y={CHART_PLOT.top}
                width={Math.max(right - left, 1)}
                height={plotHeight}
                fill="transparent"
                onMouseEnter={() => setActiveDayIndex(index)}
              >
                <title>
                  {`${formatDisplayDate(day.date)}: ${formatMoney(day.projectedBalanceMinor)}${
                    bills.length > 0 ? ` · Bills: ${bills.map((bill) => bill.name).join(", ")}` : ""
                  }`}
                </title>
              </rect>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

export function CashflowForecastSection({
  items,
  accounts,
  totalBalanceMinor,
}: CashflowForecastSectionProps) {
  const [horizonDays, setHorizonDays] = useState<ForecastHorizon>(30);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("all");
  const [safetyBufferText, setSafetyBufferText] = useState("");
  const { minor: safetyBufferMinor, error: safetyBufferError } =
    parseSafetyBuffer(safetyBufferText);

  // Compute base starting balance
  const effectiveStartingBalance = useMemo(() => {
    if (selectedAccountId !== "all" && accounts) {
      const found = accounts.find((a) => a.id === selectedAccountId);
      return found?.balanceMinor ?? 0;
    }
    if (totalBalanceMinor !== undefined) {
      return totalBalanceMinor;
    }
    if (accounts && accounts.length > 0) {
      return accounts.reduce((acc, a) => acc + (a.balanceMinor ?? 0), 0);
    }
    return 0;
  }, [selectedAccountId, accounts, totalBalanceMinor]);

  // Filter subscriptions if a specific account is selected
  const activeSubscriptions = useMemo(() => {
    return items
      .filter((item) => item.status === "active")
      .filter((item) => {
        if (selectedAccountId === "all") return true;
        return item.accountId === selectedAccountId;
      })
      .map((item) => ({
        id: item.id,
        name: item.name,
        amountMinor: item.amountMinor,
        billingCycle: item.billingCycle,
        nextBillingDate: item.nextBillingDate || item.billingDate || "",
        status: item.status,
        categoryName: item.categoryName,
      }));
  }, [items, selectedAccountId]);

  // All three horizons are projected together so the tiles can preview each ending balance.
  const forecasts = useMemo(() => {
    const shared: Omit<CashflowForecastOptions, "horizonDays"> = {
      startingBalanceMinor: effectiveStartingBalance,
      subscriptions: activeSubscriptions,
      safetyBufferMinor,
    };
    return {
      30: projectCashflow({ ...shared, horizonDays: 30 }),
      60: projectCashflow({ ...shared, horizonDays: 60 }),
      90: projectCashflow({ ...shared, horizonDays: 90 }),
    };
  }, [effectiveStartingBalance, activeSubscriptions, safetyBufferMinor]);

  const forecast = forecasts[horizonDays];

  // Determine overall status banner type
  const alertStatus = useMemo(() => {
    if (forecast.hasDeficit || forecast.minProjectedBalanceMinor < 0) {
      return "deficit";
    }
    if (
      forecast.hasBufferDip ||
      (safetyBufferMinor > 0 && forecast.minProjectedBalanceMinor < safetyBufferMinor)
    ) {
      return "low_buffer";
    }
    return "safe";
  }, [forecast, safetyBufferMinor]);

  return (
    <section className="cashflow-forecast-section" aria-labelledby="cashflow-forecast-heading">
      {/* Header with Controls */}
      <div className="forecast-header">
        <div className="forecast-title-group">
          <div className="forecast-badge">
            <CalendarClock size={16} aria-hidden="true" />
            <span>Cashflow Projection</span>
          </div>
          <h2 className="forecast-heading" id="cashflow-forecast-heading">
            Upcoming Balance &amp; Obligation Forecast
          </h2>
          <p className="forecast-subheading">
            Simulate your expected cash position based on current liquid balances and recurring
            subscription commitments.
          </p>
        </div>

        <div className="forecast-controls">
          {accounts && accounts.length > 1 && (
            <div className="forecast-control-group">
              <label htmlFor="account-filter-select" className="forecast-control-label">
                Account
              </label>
              <select
                id="account-filter-select"
                className="forecast-select"
                value={selectedAccountId}
                onChange={(e) => setSelectedAccountId(e.target.value)}
              >
                <option value="all">All Liquid Accounts</option>
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name} ({formatMoney(acc.balanceMinor ?? 0)})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="forecast-control-group">
            <span className="forecast-control-label" id="forecast-horizon-label">
              Forecast horizon
            </span>
            <div
              className="forecast-horizon-tiles"
              role="group"
              aria-labelledby="forecast-horizon-label"
            >
              {HORIZONS.map((days) => {
                const selected = horizonDays === days;
                const endingBalanceMinor = forecasts[days].endingBalanceMinor;
                return (
                  <button
                    key={days}
                    type="button"
                    className={`horizon-tile ${selected ? "active" : ""}`}
                    aria-pressed={selected}
                    onClick={() => setHorizonDays(days)}
                  >
                    <span className="horizon-tile-days">{days} days</span>
                    <span
                      className={`horizon-tile-balance ${endingBalanceMinor < 0 ? "negative" : ""}`}
                    >
                      {formatMoney(endingBalanceMinor)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="forecast-control-group">
            <label htmlFor="safety-buffer-input" className="forecast-control-label">
              Safety buffer
            </label>
            <div className="forecast-money-input">
              <b aria-hidden="true">₱</b>
              <input
                id="safety-buffer-input"
                inputMode="decimal"
                value={safetyBufferText}
                onChange={(event) => setSafetyBufferText(event.target.value)}
                placeholder="0.00"
                aria-invalid={safetyBufferError ? true : undefined}
                aria-describedby={safetyBufferError ? "safety-buffer-error" : "safety-buffer-hint"}
              />
            </div>
            {safetyBufferError ? (
              <small id="safety-buffer-error" className="field-error">
                {safetyBufferError}
              </small>
            ) : (
              <small id="safety-buffer-hint" className="forecast-control-hint">
                Reserve left untouched
              </small>
            )}
          </div>
        </div>
      </div>

      {/* Proactive Alert Banner */}
      {alertStatus === "deficit" && (
        <div className="forecast-alert-banner alert-deficit" role="alert">
          <div className="alert-icon-wrap">
            <Info size={20} aria-hidden="true" />
          </div>
          <div className="alert-content">
            <strong className="alert-title">Projected Shortfall Guidance</strong>
            <p className="alert-desc">
              Your balance is projected to fall below zero on{" "}
              <strong>{formatFullDate(forecast.minBalanceDate)}</strong>, reaching a minimum of{" "}
              <span className="alert-amount negative">
                {formatMoney(forecast.minProjectedBalanceMinor)}
              </span>
              . Consider adjusting renewal dates or transferring additional funds to keep accounts
              covered.
            </p>
          </div>
        </div>
      )}

      {alertStatus === "low_buffer" && (
        <div className="forecast-alert-banner alert-warning" role="alert">
          <div className="alert-icon-wrap">
            <AlertTriangle size={20} aria-hidden="true" />
          </div>
          <div className="alert-content">
            <strong className="alert-title">Low Buffer Warning</strong>
            <p className="alert-desc">
              Your balance dips below your {formatMoney(safetyBufferMinor)} safety buffer on{" "}
              {forecast.dipDaysCount} day{forecast.dipDaysCount === 1 ? "" : "s"} in this window,
              reaching a low of{" "}
              <strong className="alert-amount">
                {formatMoney(forecast.minProjectedBalanceMinor)}
              </strong>{" "}
              on <strong>{formatFullDate(forecast.minBalanceDate)}</strong>. Keep an eye on incoming
              payments to maintain comfortable liquidity.
            </p>
          </div>
        </div>
      )}

      {alertStatus === "safe" && (
        <div className="forecast-alert-banner alert-safe" role="status">
          <div className="alert-icon-wrap">
            <ShieldCheck size={20} aria-hidden="true" />
          </div>
          <div className="alert-content">
            <strong className="alert-title">Healthy Cashflow Projection</strong>
            <p className="alert-desc">
              All upcoming bill obligations are safely covered across the next {horizonDays} days
              with a lowest projected buffer of {formatMoney(forecast.minProjectedBalanceMinor)} on{" "}
              {formatDisplayDate(forecast.minBalanceDate)}.
            </p>
          </div>
        </div>
      )}

      {/* Summary Metric Cards */}
      <div className="forecast-metrics-grid">
        <div className="forecast-metric-card">
          <div className="metric-header">
            <span className="metric-title">Starting Balance</span>
            <div className="metric-icon-box">
              <Wallet size={16} aria-hidden="true" />
            </div>
          </div>
          <div className="metric-value">{formatMoney(forecast.startingBalanceMinor)}</div>
          <div className="metric-caption">As of {formatDisplayDate(forecast.startDate)}</div>
        </div>

        <div className="forecast-metric-card">
          <div className="metric-header">
            <span className="metric-title">Projected End Balance</span>
            <div className="metric-icon-box">
              {forecast.endingBalanceMinor >= forecast.startingBalanceMinor ? (
                <TrendingUp size={16} aria-hidden="true" />
              ) : (
                <TrendingDown size={16} aria-hidden="true" />
              )}
            </div>
          </div>
          <div className={`metric-value ${forecast.endingBalanceMinor < 0 ? "negative" : ""}`}>
            {formatMoney(forecast.endingBalanceMinor)}
          </div>
          <div className="metric-caption">
            At day {horizonDays} ({formatDisplayDate(forecast.endDate)})
          </div>
        </div>

        <div className="forecast-metric-card">
          <div className="metric-header">
            <span className="metric-title">Lowest Projected Point</span>
            <div
              className={`metric-icon-box ${forecast.minProjectedBalanceMinor < 0 ? "danger" : ""}`}
            >
              <AlertCircle size={16} aria-hidden="true" />
            </div>
          </div>
          <div
            className={`metric-value ${forecast.minProjectedBalanceMinor < 0 ? "negative" : ""}`}
          >
            {formatMoney(forecast.minProjectedBalanceMinor)}
          </div>
          <div className="metric-caption">
            Expected on {formatDisplayDate(forecast.minBalanceDate)}
          </div>
        </div>

        <div className="forecast-metric-card">
          <div className="metric-header">
            <span className="metric-title">Upcoming Bill Outflows</span>
            <div className="metric-icon-box">
              <DollarSign size={16} aria-hidden="true" />
            </div>
          </div>
          <div className="metric-value">{formatMoney(forecast.totalBillsMinor)}</div>
          <div className="metric-caption">
            {forecast.upcomingBillRisks.length} renewal
            {forecast.upcomingBillRisks.length === 1 ? "" : "s"} over {horizonDays}d
          </div>
        </div>
      </div>

      {/* Visual Projection Summary */}
      <div className="forecast-projection-card">
        <div className="projection-card-header">
          <div>
            <h3 className="projection-card-title">Projected Balance Trajectory</h3>
            <p className="projection-card-subtitle">
              Daily simulation over the next {horizonDays} days highlighting bill deductions and
              minimum liquidity.
            </p>
          </div>
        </div>

        <div className="projection-chart-container">
          <CashflowProjectionChart forecast={forecast} safetyBufferMinor={safetyBufferMinor} />

          <div className="projection-summary-footer">
            <div className="summary-stat">
              <span className="summary-stat-label">Start</span>
              <strong className="summary-stat-value">
                {formatMoney(forecast.startingBalanceMinor)}
              </strong>
            </div>
            <div className="summary-stat">
              <span className="summary-stat-label">Net Movement</span>
              <strong
                className={`summary-stat-value ${
                  forecast.netChangeMinor < 0 ? "negative" : "positive"
                }`}
              >
                {forecast.netChangeMinor < 0 ? "−" : "+"}
                {formatMoney(Math.abs(forecast.netChangeMinor))}
              </strong>
            </div>
            <div className="summary-stat">
              <span className="summary-stat-label">Lowest Balance</span>
              <strong
                className={`summary-stat-value ${
                  forecast.minProjectedBalanceMinor < 0 ? "negative" : ""
                }`}
              >
                {formatMoney(forecast.minProjectedBalanceMinor)}
              </strong>
            </div>
            <div className="summary-stat">
              <span className="summary-stat-label">Horizon End</span>
              <strong
                className={`summary-stat-value ${
                  forecast.endingBalanceMinor < 0 ? "negative" : ""
                }`}
              >
                {formatMoney(forecast.endingBalanceMinor)}
              </strong>
            </div>
          </div>
        </div>
      </div>

      {/* Upcoming Bill Obligations with Risk Badges */}
      <div className="forecast-obligations-card">
        <div className="obligations-card-header">
          <div className="obligations-header-title">
            <Clock size={18} aria-hidden="true" />
            <h3 className="projection-card-title">Upcoming Bill Obligations</h3>
          </div>
          <span className="obligations-count-badge">
            {forecast.upcomingBillRisks.length} Scheduled Payment
            {forecast.upcomingBillRisks.length === 1 ? "" : "s"}
          </span>
        </div>

        {forecast.upcomingBillRisks.length === 0 ? (
          <div className="forecast-empty-state">
            <CheckCircle2 size={32} className="empty-icon" aria-hidden="true" />
            <p className="empty-title">No upcoming bills in this period</p>
            <p className="empty-desc">
              There are no active subscription renewals scheduled within the next {horizonDays}{" "}
              days.
            </p>
          </div>
        ) : (
          <div className="obligations-table-wrapper">
            <table className="obligations-table">
              <caption className="sr-only">Upcoming bill obligations</caption>
              <thead>
                <tr>
                  <th scope="col">Due Date</th>
                  <th scope="col">Subscription / Obligation</th>
                  <th scope="col" className="text-right">
                    Amount
                  </th>
                  <th scope="col" className="text-right">
                    Balance After
                  </th>
                  <th scope="col" className="text-center">
                    Risk Assessment
                  </th>
                </tr>
              </thead>
              <tbody>
                {forecast.upcomingBillRisks.map((risk, index) => {
                  let badgeClass = "badge-safe";
                  let badgeText = "Safe";
                  if (risk.riskLevel === "critical_deficit") {
                    badgeClass = "badge-deficit";
                    badgeText = "Deficit risk";
                  } else if (risk.riskLevel === "low_buffer") {
                    badgeClass = "badge-warning";
                    badgeText = "Low buffer";
                  }

                  return (
                    <tr key={`${risk.billId}-${risk.dueDate}-${index}`}>
                      <td className="due-cell">
                        <span className="due-date-text">{formatDisplayDate(risk.dueDate)}</span>
                        <span className="due-days-sub">
                          {risk.daysUntilDue === 0
                            ? "Today"
                            : risk.daysUntilDue === 1
                              ? "Tomorrow"
                              : `in ${risk.daysUntilDue} days`}
                        </span>
                      </td>
                      <td className="name-cell">
                        <strong className="obligation-name">{risk.billName}</strong>
                      </td>
                      <td className="amount-cell text-right">
                        <span className="bill-amount">−{formatMoney(risk.amountMinor)}</span>
                      </td>
                      <td className="balance-cell text-right">
                        <span
                          className={`balance-after ${
                            risk.projectedBalanceAfterMinor < 0 ? "negative" : ""
                          }`}
                        >
                          {formatMoney(risk.projectedBalanceAfterMinor)}
                        </span>
                      </td>
                      <td className="risk-cell text-center">
                        <span className={`risk-badge ${badgeClass}`}>{badgeText}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
