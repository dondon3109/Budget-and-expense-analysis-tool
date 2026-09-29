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

export interface DashboardView {
  summary: DashboardSummary;
  cashflow: CashflowTrend;
  accountBalances: AccountBalanceSummary;
}

function monthPeriod(anchorDate: string): { from: string; to: string } {
  const month = anchorDate.slice(0, 7);
  const year = Number(month.slice(0, 4));
  const monthIndex = Number(month.slice(5, 7)) - 1;
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(lastDay).padStart(2, "0")}` };
}

export function buildDashboardView(
  data: LocalDashboardData,
  anchorDate: string,
  cashflowView: CashflowTrend["view"] = "weekly",
  workspaceCurrency: Currency = "PHP",
): DashboardView {
  const accountBalances = summarizeAccountBalances(data.accounts, workspaceCurrency);
  return {
    summary: buildDashboardSummary(
      data.transactions,
      data.budgets,
      monthPeriod(anchorDate),
      accountBalances,
    ),
    // Mobile has no exchange rate, so the trend counts only workspace-currency entries.
    cashflow: buildCashflowTrend(
      data.transactions.filter((transaction) => transaction.currency === workspaceCurrency),
      cashflowView,
      anchorDate,
    ),
    accountBalances,
  };
}

export function localIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
