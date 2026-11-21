import {
  buildCashflowTrend,
  buildDashboardSummary,
  summarizeAccountBalances,
  type AccountBalanceSummary,
  type CashflowTrend,
  type Currency,
  type DashboardSummary,
} from "@zoption/shared";

import type { LocalDashboardData } from "@/db/view-models";

export interface DashboardOverview {
  summary: DashboardSummary;
  accountBalances: AccountBalanceSummary;
}

export interface DashboardView extends DashboardOverview {
  cashflow: CashflowTrend;
}

function monthPeriod(anchorDate: string): { from: string; to: string } {
  const month = anchorDate.slice(0, 7);
  const year = Number(month.slice(0, 4));
  const monthIndex = Number(month.slice(5, 7)) - 1;
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(lastDay).padStart(2, "0")}` };
}

export function buildDashboardOverview(
  data: LocalDashboardData,
  anchorDate: string,
  workspaceCurrency: Currency = "PHP",
): DashboardOverview {
  const accountBalances = summarizeAccountBalances(data.accounts, workspaceCurrency);
  return {
    summary: buildDashboardSummary(
      data.transactions,
      data.budgets,
      monthPeriod(anchorDate),
      accountBalances,
    ),
    accountBalances,
  };
}

export function buildDashboardCashflow(
  data: LocalDashboardData,
  anchorDate: string,
  cashflowView: CashflowTrend["view"] = "weekly",
  workspaceCurrency: Currency = "PHP",
): CashflowTrend {
  // Mobile has no exchange rate, so the trend counts only workspace-currency entries.
  return buildCashflowTrend(
    data.transactions.filter((transaction) => transaction.currency === workspaceCurrency),
    cashflowView,
    anchorDate,
  );
}

export function buildDashboardView(
  data: LocalDashboardData,
  anchorDate: string,
  cashflowView: CashflowTrend["view"] = "weekly",
  workspaceCurrency: Currency = "PHP",
): DashboardView {
  const overview = buildDashboardOverview(data, anchorDate, workspaceCurrency);
  return {
    ...overview,
    cashflow: buildDashboardCashflow(data, anchorDate, cashflowView, workspaceCurrency),
  };
}

export function localIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
