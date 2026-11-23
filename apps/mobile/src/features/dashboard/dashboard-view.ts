import {
  buildCashflowTrend,
  buildDashboardSummary,
  OPENING_BALANCE_CATEGORY_SYSTEM_KEY,
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

const ESTABLISHED_LEDGER_DAYS = 7;
const ESTABLISHED_LEDGER_TX_COUNT = 5;

function isoDateDaysAgo(anchorDate: string, days: number): string {
  const [year, month, day] = anchorDate.split("-").map(Number);
  const cutoff = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, (day ?? 1) - days));
  return cutoff.toISOString().slice(0, 10);
}

/**
 * True when the local ledger already looks like an active or returning workspace, so a fresh
 * install does not greet an existing account with the "Quick start guide" tutorial card.
 */
export function isEstablishedLedger(data: LocalDashboardData, anchorDate: string): boolean {
  if (data.budgets.some((item) => item.limitMinor > 0)) return true;
  if (data.accounts.some((item) => !item.system)) return true;
  const realTransactions = data.transactions.filter(
    (item) => item.categorySystemKey !== OPENING_BALANCE_CATEGORY_SYSTEM_KEY,
  );
  if (realTransactions.length >= ESTABLISHED_LEDGER_TX_COUNT) return true;
  const cutoff = isoDateDaysAgo(anchorDate, ESTABLISHED_LEDGER_DAYS);
  if (realTransactions.some((item) => item.date < cutoff)) return true;
  return data.recentTransactions.some(
    (item) => item.categorySystemKey !== OPENING_BALANCE_CATEGORY_SYSTEM_KEY && item.date < cutoff,
  );
}
