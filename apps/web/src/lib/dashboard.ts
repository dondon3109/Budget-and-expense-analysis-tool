import type { CashflowTrend, DashboardSummary } from "@zoption/shared";

export type TrendState = "positive" | "negative" | "neutral";

export function isDashboardEmpty(
  data: DashboardSummary,
  cashflowTrend?: CashflowTrend,
  transactionCount?: number,
): boolean {
  const hasCashflowActivity = cashflowTrend?.points.some(
    (point) => point.incomeMinor !== 0 || point.expenseMinor !== 0,
  );
  return (
    (transactionCount === undefined || transactionCount === 0) &&
    !hasCashflowActivity &&
    data.metrics.moneyInMinor === 0 &&
    data.metrics.moneyOutMinor === 0 &&
    data.spendingByCategory.length === 0 &&
    data.budgetProgress.length === 0
  );
}

export function calculatePercentageChange(current: number, previous: number): number {
  if (previous === 0) return current === 0 ? 0 : current > 0 ? 100 : -100;
  return Math.round(((current - previous) / Math.abs(previous)) * 1_000) / 10;
}

export function trendState(percentage: number, increaseIsPositive = true): TrendState {
  if (percentage === 0) return "neutral";
  const increased = percentage > 0;
  return increased === increaseIsPositive ? "positive" : "negative";
}
