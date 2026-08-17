import type { CashflowTrend } from "@zoption/shared";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useLayoutEffect, useRef, useState } from "react";

import {
  formatMobileTrendTick,
  formatTrendTooltipDate,
  trendXAxisInterval,
} from "../../lib/cashflowTrendFormat";
import { formatMoney } from "../../lib/formatters";
import { createMonthlyTrendAxis, formatMonthlyTrendTick } from "../../lib/monthlyTrendAxis";
import { useReducedMotion } from "../../hooks/useReducedMotion";

const CHART_HEIGHT = 232;
const PLOT = { top: 14, right: 10, bottom: 26, left: 50 } as const;
const FALLBACK_WIDTH = 320;
const TAP_DISMISS_WINDOW_MS = 500;
const DRAG_THRESHOLD_PX = 6;
const CALLOUT_HALF_WIDTH = 74;

interface Props {
  data: CashflowTrend;
}

function createLinePath(
  points: CashflowTrend["points"],
  accessor: (point: CashflowTrend["points"][number]) => number,
  xAt: (index: number) => number,
  yAt: (value: number) => number,
): string {
  return points
    .map((point, index) => {
      const command = index === 0 ? "M" : "L";
      return `${command}${xAt(index).toFixed(1)},${yAt(accessor(point)).toFixed(1)}`;
    })
    .join("");
}

function createAreaPath(
  linePath: string,
  xAt: (index: number) => number,
  baselineY: number,
  count: number,
): string {
  const firstX = xAt(0).toFixed(1);
  const lastX = xAt(Math.max(0, count - 1)).toFixed(1);
  return `${linePath}L${lastX},${baselineY.toFixed(1)}L${firstX},${baselineY.toFixed(1)}Z`;
}

/**
 * Touch-first cashflow chart for narrow screens. Hand-rolled SVG so the
 * Android WebView renders it without a charting library: tap or drag across
 * the chart to scrub values, tap the same point again to dismiss the callout.
 * Vertical swipes still scroll the dashboard (touch-action: pan-y).
 */
export function MobileCashflowChart({ data }: Props) {
  const reduceMotion = useReducedMotion();
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState<number>(FALLBACK_WIDTH);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const dragStateRef = useRef({ moved: false, startX: 0, lastTapIndex: -1, lastTapAt: 0 });

  useLayoutEffect(() => {
    const element = wrapperRef.current;
    if (!element) return undefined;
    const measure = () => {
      setWidth(element.clientWidth > 0 ? element.clientWidth : FALLBACK_WIDTH);
    };
    measure();
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(measure);
      observer.observe(element);
      return () => observer.disconnect();
    }
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const points = data.points;
  if (points.length === 0) return null;

  const maximumMinor = points.reduce(
    (maximum, point) => Math.max(maximum, point.incomeMinor, point.expenseMinor),
    0,
  );
  const axis = createMonthlyTrendAxis(maximumMinor);
  const domainMax = axis.domain[1];
  const plotWidth = Math.max(0, width - PLOT.left - PLOT.right);
  const plotHeight = CHART_HEIGHT - PLOT.top - PLOT.bottom;
  const step = points.length > 1 ? plotWidth / (points.length - 1) : 0;
  const xAt = (index: number) => PLOT.left + index * step;
  const yAt = (value: number) => PLOT.top + (1 - value / domainMax) * plotHeight;
  const baselineY = PLOT.top + plotHeight;

  const incomePath = createLinePath(points, (point) => point.incomeMinor, xAt, yAt);
  const expensePath = createLinePath(points, (point) => point.expenseMinor, xAt, yAt);
  const incomeArea = createAreaPath(incomePath, xAt, baselineY, points.length);
  const expenseArea = createAreaPath(expensePath, xAt, baselineY, points.length);
  const xTickInterval = trendXAxisInterval(data);

  function indexForClientX(clientX: number): number {
    const rect = wrapperRef.current?.getBoundingClientRect();
    if (!rect || step <= 0) return 0;
    const relative = clientX - rect.left;
    const raw = (relative - PLOT.left) / step;
    return Math.min(points.length - 1, Math.max(0, Math.round(raw)));
  }

  function handlePointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      // Pointer capture can be unavailable; tap and drag still work without it.
    }
    const drag = dragStateRef.current;
    drag.moved = false;
    drag.startX = event.clientX;
    setActiveIndex(indexForClientX(event.clientX));
  }

  function handlePointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    const captured =
      typeof event.currentTarget.hasPointerCapture === "function"
        ? event.currentTarget.hasPointerCapture(event.pointerId)
        : true;
    if (!captured) return;
    const drag = dragStateRef.current;
    if (Math.abs(event.clientX - drag.startX) >= DRAG_THRESHOLD_PX) drag.moved = true;
    setActiveIndex(indexForClientX(event.clientX));
  }

  function handlePointerUp(event: ReactPointerEvent<SVGSVGElement>) {
    const drag = dragStateRef.current;
    const index = indexForClientX(event.clientX);
    if (!drag.moved) {
      const now = Date.now();
      if (drag.lastTapIndex === index && now - drag.lastTapAt < TAP_DISMISS_WINDOW_MS) {
        drag.lastTapIndex = -1;
        drag.lastTapAt = 0;
        setActiveIndex(null);
      } else {
        drag.lastTapIndex = index;
        drag.lastTapAt = now;
        setActiveIndex(index);
      }
    }
    drag.moved = false;
  }

  function handlePointerCancel() {
    dragStateRef.current.moved = false;
  }

  const activePoint = activeIndex !== null ? points[activeIndex] : undefined;
  const activeX = activeIndex !== null ? xAt(activeIndex) : 0;
  const calloutLeft = activeX
    ? Math.min(Math.max(activeX, CALLOUT_HALF_WIDTH), width - CALLOUT_HALF_WIDTH)
    : CALLOUT_HALF_WIDTH;

  return (
    <div ref={wrapperRef} className={`trend-chart-mobile${reduceMotion ? "" : " is-animated"}`}>
      {activePoint && (
        <div className="trend-chart-callout" style={{ left: calloutLeft }} aria-hidden="true">
          <strong>{formatTrendTooltipDate(activePoint.date, data.granularity)}</strong>
          <span className="trend-chart-callout-row">
            <i className="income" />
            Income
            <span className="trend-chart-callout-value">
              {formatMoney(activePoint.incomeMinor)}
            </span>
          </span>
          <span className="trend-chart-callout-row">
            <i className="expense" />
            Expenses
            <span className="trend-chart-callout-value">
              {formatMoney(activePoint.expenseMinor)}
            </span>
          </span>
        </div>
      )}
      <svg
        width={width}
        height={CHART_HEIGHT}
        viewBox={`0 0 ${width} ${CHART_HEIGHT}`}
        role="img"
        aria-label="Money in and out chart"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
      >
        {axis.ticks.map((tick) => {
          const tickY = yAt(tick);
          return (
            <g key={tick}>
              <line
                x1={PLOT.left}
                x2={width - PLOT.right}
                y1={tickY}
                y2={tickY}
                stroke="var(--chart-grid)"
                strokeWidth={1}
              />
              <text
                x={PLOT.left - 7}
                y={tickY + 3.5}
                textAnchor="end"
                fontSize={10}
                fill="var(--chart-axis)"
              >
                {formatMonthlyTrendTick(tick)}
              </text>
            </g>
          );
        })}
        <path
          className="trend-mobile-area"
          d={incomeArea}
          fill="var(--chart-income)"
          fillOpacity={0.08}
        />
        <path
          className="trend-mobile-area"
          d={expenseArea}
          fill="var(--chart-expense)"
          fillOpacity={0.07}
        />
        <path
          d={incomePath}
          fill="none"
          stroke="var(--chart-income)"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <path
          d={expensePath}
          fill="none"
          stroke="var(--chart-expense)"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {points.map((point, index) => {
          const shouldShow =
            xTickInterval === undefined
              ? true
              : xTickInterval === 0
                ? true
                : index % (xTickInterval + 1) === 0 || index === points.length - 1;
          if (!shouldShow) return null;
          const anchor = index === 0 ? "start" : index === points.length - 1 ? "end" : "middle";
          return (
            <text
              key={point.date}
              x={xAt(index)}
              y={CHART_HEIGHT - 7}
              textAnchor={anchor}
              fontSize={10}
              fill="var(--chart-axis)"
            >
              {formatMobileTrendTick(point.date, data.granularity)}
            </text>
          );
        })}
        {activeIndex !== null && (
          <g aria-hidden="true">
            <line
              x1={activeX}
              x2={activeX}
              y1={PLOT.top}
              y2={baselineY}
              stroke="var(--chart-crosshair)"
              strokeWidth={1}
              strokeDasharray="3 4"
            />
            <circle
              cx={activeX}
              cy={yAt(points[activeIndex]!.incomeMinor)}
              r={4.5}
              fill="var(--chart-income)"
              stroke="var(--chart-tooltip-bg)"
              strokeWidth={2}
            />
            <circle
              cx={activeX}
              cy={yAt(points[activeIndex]!.expenseMinor)}
              r={4.5}
              fill="var(--chart-expense)"
              stroke="var(--chart-tooltip-bg)"
              strokeWidth={2}
            />
          </g>
        )}
      </svg>
    </div>
  );
}
