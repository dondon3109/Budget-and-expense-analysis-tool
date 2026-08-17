import type { CashflowTrend } from "@zoption/shared";

const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const MONTHS_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export const CHART_HEIGHT = 180;
export const CHART_GUTTER_LEFT = 48;
export const CHART_GUTTER_RIGHT = 8;
export const CHART_GUTTER_TOP = 12;
export const CHART_GUTTER_BOTTOM = 24;
export const CALLOUT_HALF_WIDTH = 82;

export interface CashflowAxis {
  ticks: number[];
  domainMax: number;
}

function niceStep(roughStep: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const normalizedStep = roughStep / magnitude;
  const multiplier =
    normalizedStep <= 1 ? 1 : normalizedStep <= 2 ? 2 : normalizedStep <= 5 ? 5 : 10;
  return multiplier * magnitude;
}

/**
 * Five labeled gridlines from zero, matching the website chart's axis so the
 * same numbers appear on both platforms. A quiet period still gets a readable
 * ₱10,000 ceiling.
 */
export function createCashflowAxis(maxMinor: number): CashflowAxis {
  const safeMaximum = Number.isFinite(maxMinor) ? Math.max(0, maxMinor) : 0;
  const maximumForAxis = Math.max(1_000_000, safeMaximum);
  const stepMinor = maximumForAxis === 1_000_000 ? 250_000 : niceStep(maximumForAxis / 4);
  return {
    ticks: [0, stepMinor, stepMinor * 2, stepMinor * 3, stepMinor * 4],
    domainMax: stepMinor * 4,
  };
}

export function formatAxisTick(valueMinor: number): string {
  return `₱${Math.round(valueMinor / 100).toLocaleString("en-US")}`;
}

export function compactDateLabel(date: string, granularity: CashflowTrend["granularity"]): string {
  if (granularity === "month") {
    return MONTHS_SHORT[Number(date.slice(5, 7)) - 1] ?? date.slice(0, 7);
  }
  return String(Number(date.slice(8, 10)));
}

export function fullDateLabel(date: string, granularity: CashflowTrend["granularity"]): string {
  const month = Number(date.slice(5, 7)) - 1;
  const day = Number(date.slice(8, 10));
  const year = date.slice(0, 4);
  const monthName = MONTHS_LONG[month] ?? date.slice(0, 7);
  if (granularity === "month") return `${monthName} ${year}`;
  return `${monthName} ${day}, ${year}`;
}

export function xAxisInterval(
  pointCount: number,
  granularity: CashflowTrend["granularity"],
): number {
  if (granularity === "month" || pointCount <= 8) return 0;
  return Math.ceil(pointCount / 7) - 1;
}

export function indexForPosition(x: number, width: number, pointCount: number): number | null {
  if (width <= 0 || pointCount <= 0) return null;
  const plotWidth = width - CHART_GUTTER_LEFT - CHART_GUTTER_RIGHT;
  if (plotWidth <= 0 || x < CHART_GUTTER_LEFT - 8 || x > width - CHART_GUTTER_RIGHT + 8)
    return null;
  if (pointCount === 1) return 0;
  const step = plotWidth / (pointCount - 1);
  const raw = (x - CHART_GUTTER_LEFT) / step;
  return Math.min(pointCount - 1, Math.max(0, Math.round(raw)));
}

export interface ChartGeometry {
  plotWidth: number;
  plotHeight: number;
  baselineY: number;
  xAt: (index: number) => number;
  yAt: (valueMinor: number) => number;
}

export function buildChartGeometry(
  width: number,
  pointCount: number,
  domainMax: number,
): ChartGeometry {
  const plotWidth = Math.max(0, width - CHART_GUTTER_LEFT - CHART_GUTTER_RIGHT);
  const plotHeight = CHART_HEIGHT - CHART_GUTTER_TOP - CHART_GUTTER_BOTTOM;
  const step = pointCount > 1 ? plotWidth / (pointCount - 1) : 0;
  const xAt = (index: number) => CHART_GUTTER_LEFT + index * step;
  const yAt = (valueMinor: number) =>
    CHART_GUTTER_TOP + (1 - Math.max(0, Math.min(domainMax, valueMinor)) / domainMax) * plotHeight;
  return { plotWidth, plotHeight, baselineY: CHART_GUTTER_TOP + plotHeight, xAt, yAt };
}

export function linePathD(
  points: CashflowTrend["points"],
  accessor: (point: CashflowTrend["points"][number]) => number,
  geometry: ChartGeometry,
): string {
  return points
    .map((point, index) => {
      const command = index === 0 ? "M" : "L";
      return `${command}${geometry.xAt(index).toFixed(1)},${geometry.yAt(accessor(point)).toFixed(1)}`;
    })
    .join("");
}

export function areaPathD(lineD: string, geometry: ChartGeometry, pointCount: number): string {
  const firstX = geometry.xAt(0).toFixed(1);
  const lastX = geometry.xAt(Math.max(0, pointCount - 1)).toFixed(1);
  const baseline = geometry.baselineY.toFixed(1);
  return `${lineD}L${lastX},${baseline}L${firstX},${baseline}Z`;
}

export function chartSummaryLabel(cashflow: CashflowTrend): string {
  const perPoint = cashflow.points
    .map((point) => {
      const date = fullDateLabel(point.date, cashflow.granularity);
      return `${date}: income ${formatAxisTick(point.incomeMinor)}, expense ${formatAxisTick(point.expenseMinor)}`;
    })
    .join(". ");
  return `Money in and out chart. ${perPoint}.`;
}
