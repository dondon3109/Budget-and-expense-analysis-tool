import type { CashflowForecastResult } from "./cashflowForecast";

/**
 * Why the user is warned about overspending. A projected deficit wins over a spent-out week:
 * a balance forecast to go below zero already caps safe to spend at zero, so it is the cause
 * worth naming.
 */
export type OverspendingAlert =
  { kind: "deficit_risk"; deficitDate: string } | { kind: "overspent" };

export interface OverspendingAlertInput {
  /** The "Safe to spend this week" figure, in integer minor units. */
  safeToSpendMinor: number;
  /** The forecast that figure was capped by. */
  forecast: Pick<CashflowForecastResult, "dailyTimeline">;
  /** False for an account with no balance or budget; it is never "spent out". Defaults to true. */
  hasBasis?: boolean;
}

/**
 * Whether there is any balance or budget to spend from. Zero safe to spend with neither is a new
 * or empty account, not a spent-out week, so it earns a getting-started line instead of an alert.
 */
export function hasSpendingBasis({
  startingBalanceMinor,
  remainingBudgetMinor,
}: {
  startingBalanceMinor: number;
  remainingBudgetMinor?: number;
}): boolean {
  return startingBalanceMinor !== 0 || remainingBudgetMinor !== undefined;
}

/** The alert for the current safe-to-spend figure and forecast, or null when spending is on track. */
export function overspendingAlert({
  safeToSpendMinor,
  forecast,
  hasBasis = true,
}: OverspendingAlertInput): OverspendingAlert | null {
  const firstDeficitDay = forecast.dailyTimeline.find((day) => day.isDeficit);
  if (firstDeficitDay) return { kind: "deficit_risk", deficitDate: firstDeficitDay.date };
  if (hasBasis && safeToSpendMinor <= 0) return { kind: "overspent" };
  return null;
}

/** The words web and mobile show for an alert, in the app and in a notification. */
export function overspendingAlertMessage(alert: OverspendingAlert): {
  title: string;
  body: string;
} {
  if (alert.kind === "deficit_risk") {
    return {
      title: "Deficit risk ahead",
      body: `Your balance is projected to fall below zero on ${alert.deficitDate}. Nothing is safe to spend this week until then.`,
    };
  }
  return {
    title: "You've used up what's safe to spend",
    body: "Nothing is left that's safe to spend this week. Hold off on non-essential spending until your next deposit.",
  };
}
