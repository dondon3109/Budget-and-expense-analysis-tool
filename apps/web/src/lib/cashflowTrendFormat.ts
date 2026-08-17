import type { CashflowTrend } from "@zoption/shared";

import { formatMonth } from "./formatters";

/**
 * Date labels for cashflow chart axes and tooltips. Kept in one module so the
 * desktop (recharts) and mobile (native SVG) renderers label the same periods
 * identically.
 */

export function formatTrendDate(date: string, granularity: CashflowTrend["granularity"]): string {
  if (granularity === "month") return formatMonth(date.slice(0, 7));

  return new Intl.DateTimeFormat("en-PH", {
    weekday: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

/** Compact axis label for narrow screens: "21" for days, "Jun" for months. */
export function formatMobileTrendTick(
  date: string,
  granularity: CashflowTrend["granularity"],
): string {
  if (granularity === "month") return formatMonth(date.slice(0, 7));
  return new Intl.DateTimeFormat("en-PH", { day: "numeric", timeZone: "UTC" }).format(
    new Date(`${date}T00:00:00Z`),
  );
}

export function formatTrendTooltipDate(
  date: string,
  granularity: CashflowTrend["granularity"],
): string {
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

export function trendXAxisInterval(data: CashflowTrend): number | undefined {
  if (data.granularity === "month" || data.points.length <= 8) return 0;
  return Math.ceil(data.points.length / 7) - 1;
}
