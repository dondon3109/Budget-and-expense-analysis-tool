import {
  addToCurrencyTotal,
  buildCashflowTrend,
  buildCashflowTrendFromDayTotals,
  buildDashboardSummary,
  buildTransferFeeInsight,
  isCurrency,
  OPENING_BALANCE_CATEGORY_SYSTEM_KEY,
  summarizeAccountBalances,
  type CashflowTrend,
  type CashflowTrendView,
  type Currency,
  type CurrencyTotals,
  type DashboardSummary,
  type TransferFeeActivityRow,
  type TransferFeeInsight,
  type TransferFeeTotalsByCurrency,
  type TransactionRecord,
} from "@zoption/shared";
import { and, eq, gte, lte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

import { accounts, budgets, categories, transactions } from "../../../../db/schema";
import { convertMinor, loadUnitsPerUsd } from "../fx/rates";
import { accountRepository } from "./accounts";
import { loadWorkspaceCurrency } from "./workspace-settings";
import type { Bindings } from "../types";

function sixMonthWindowStart(to: string): string {
  const endMonth = new Date(`${to.slice(0, 7)}-01T00:00:00Z`);
  endMonth.setUTCMonth(endMonth.getUTCMonth() - 5);
  return endMonth.toISOString().slice(0, 10);
}

export async function loadCashflowTrend(
  env: Bindings,
  tenantId: string,
  query: { view: CashflowTrendView; anchorDate: string },
): Promise<CashflowTrend> {
  const preview = buildCashflowTrend([], query.view, query.anchorDate);
  // Aggregate per day and currency in SQL, then convert each currency's daily subtotal into the
  // workspace currency with the latest stored rate.
  // Transfers are excluded by buildCashflowTrendFromDayTotals' input contract.
  const [rates, workspaceCurrency] = await Promise.all([
    loadUnitsPerUsd(env),
    loadWorkspaceCurrency(env, tenantId),
  ]);
  const totalsResult = await env.DB.prepare(
    `SELECT date,
            currency,
            COALESCE(SUM(CASE WHEN kind = 'income' THEN ABS(amount_minor) ELSE 0 END), 0) AS incomeMinor,
            COALESCE(SUM(CASE WHEN kind = 'expense' THEN ABS(amount_minor) ELSE 0 END), 0) AS expenseMinor
     FROM transactions
     WHERE tenant_id = ?1 AND kind != 'transfer' AND date >= ?2 AND date <= ?3
       AND category_id NOT IN (
         SELECT id FROM categories
         WHERE tenant_id = ?1 AND system_key = '${OPENING_BALANCE_CATEGORY_SYSTEM_KEY}')
     GROUP BY date, currency`,
  )
    .bind(tenantId, preview.range.from, preview.range.to)
    .all<{ date: string; currency: string; incomeMinor: number; expenseMinor: number }>();

  const byDate = new Map<string, { date: string; incomeMinor: number; expenseMinor: number }>();
  for (const row of totalsResult.results) {
    if (!isCurrency(row.currency)) continue;
    const day = byDate.get(row.date) ?? { date: row.date, incomeMinor: 0, expenseMinor: 0 };
    day.incomeMinor += convertMinor(Number(row.incomeMinor), row.currency, workspaceCurrency, rates);
    day.expenseMinor += convertMinor(
      Number(row.expenseMinor),
      row.currency,
      workspaceCurrency,
      rates,
    );
    byDate.set(row.date, day);
  }

  return buildCashflowTrendFromDayTotals([...byDate.values()], query.view, query.anchorDate);
}

async function loadBalancesByCurrency(
  env: Bindings,
  tenantId: string,
): Promise<CurrencyTotals> {
  const result = await env.DB.prepare(
    `SELECT currency AS currency,
            COALESCE(SUM(CASE
              WHEN kind != 'transfer' OR transfer_group_id IS NOT NULL THEN amount_minor
              ELSE 0
            END), 0) AS total
     FROM transactions
     WHERE tenant_id = ?
     GROUP BY currency`,
  )
    .bind(tenantId)
    .all<{ currency: string; total: number | null }>();

  const balances: CurrencyTotals = {};
  for (const row of result.results) {
    if (isCurrency(row.currency)) {
      addToCurrencyTotal(balances, row.currency, Number(row.total ?? 0));
    }
  }
  return balances;
}

export async function loadDashboard(
  env: Bindings,
  tenantId: string,
  period: { from: string; to: string },
  accountId?: string,
  /** Counts only transactions in this currency; the assistant passes the workspace currency. */
  currency?: Currency,
): Promise<DashboardSummary> {
  const db = drizzle(env.DB);
  const trendFrom = sixMonthWindowStart(period.to);
  const queryFrom = period.from < trendFrom ? period.from : trendFrom;
  const budgetMonth = `${period.from.slice(0, 7)}-01`;
  const [transactionRows, budgetRows, accountRows, overallBalances, workspaceCurrency] =
    await Promise.all([
      db
        .select({
          id: transactions.id,
          date: transactions.date,
          description: transactions.description,
          amountMinor: transactions.amountMinor,
          currency: transactions.currency,
          kind: transactions.kind,
          categoryId: categories.id,
          categoryName: categories.name,
          categoryColor: categories.color,
          categoryIconEmoji: categories.iconEmoji,
          categorySystemKey: categories.systemKey,
          accountName: accounts.name,
        })
        .from(transactions)
        .innerJoin(
          categories,
          and(eq(transactions.categoryId, categories.id), eq(categories.tenantId, tenantId)),
        )
        .leftJoin(
          accounts,
          and(eq(transactions.accountId, accounts.id), eq(accounts.tenantId, tenantId)),
        )
        .where(
          and(
            eq(transactions.tenantId, tenantId),
            ...(accountId ? [eq(transactions.accountId, accountId)] : []),
            ...(currency ? [eq(transactions.currency, currency)] : []),
            gte(transactions.date, queryFrom),
            lte(transactions.date, period.to),
          ),
        ),
      db
        .select({
          categoryId: categories.id,
          categoryName: categories.name,
          categoryColor: categories.color,
          month: budgets.month,
          limitMinor: budgets.limitMinor,
        })
        .from(budgets)
        .innerJoin(
          categories,
          and(eq(budgets.categoryId, categories.id), eq(categories.tenantId, tenantId)),
        )
        .where(and(eq(budgets.tenantId, tenantId), eq(budgets.month, budgetMonth))),
      accountRepository.list(env, tenantId),
      loadBalancesByCurrency(env, tenantId),
      loadWorkspaceCurrency(env, tenantId),
    ]);

  const normalizedTransactions: TransactionRecord[] = transactionRows.map((row) => ({
    ...row,
    currency: row.currency as Currency,
    accountName: row.accountName ?? "Unassigned",
  }));

  const accountSummary = summarizeAccountBalances(accountRows, workspaceCurrency);

  return buildDashboardSummary(normalizedTransactions, budgetRows, period, {
    ...accountSummary,
    overallBalanceMinor: overallBalances[workspaceCurrency] ?? 0,
    balancesByCurrency: overallBalances,
  });
}

const RECENT_FEE_WEEK_WINDOW_DAYS = 56;

function recentTransferFeeWindowStart(referenceDate: string): string {
  const date = new Date(`${referenceDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - RECENT_FEE_WEEK_WINDOW_DAYS);
  return date.toISOString().slice(0, 10);
}

export async function loadTransferFeeInsight(
  env: Bindings,
  tenantId: string,
  referenceDate: string,
): Promise<TransferFeeInsight> {
  const windowStart = recentTransferFeeWindowStart(referenceDate);
  const [totalsResult, recentResult] = await Promise.all([
    env.DB.prepare(
      `SELECT currency AS currency,
              COUNT(*) AS transfers,
              SUM(CASE WHEN transfer_fee_minor IS NOT NULL THEN 1 ELSE 0 END) AS feeChargedTransfers,
              SUM(transfer_fee_minor) AS totalFeesMinor
       FROM transactions
       WHERE tenant_id = ? AND kind = 'transfer' AND amount_minor < 0
       GROUP BY currency`,
    )
      .bind(tenantId)
      .all<{
        currency: string;
        transfers: number | null;
        feeChargedTransfers: number | null;
        totalFeesMinor: number | null;
      }>(),
    env.DB.prepare(
      `SELECT t.date AS date,
              t.currency AS currency,
              t.transfer_fee_minor AS transferFeeMinor
       FROM transactions t
       WHERE t.tenant_id = ? AND t.kind = 'transfer' AND t.amount_minor < 0
         AND t.date >= ?
       ORDER BY t.date, t.id`,
    )
      .bind(tenantId, windowStart)
      .all<TransferFeeActivityRow>(),
  ]);

  const totals: TransferFeeTotalsByCurrency[] = [];
  for (const row of totalsResult.results) {
    if (!isCurrency(row.currency)) continue;
    totals.push({
      currency: row.currency,
      transfers: Number(row.transfers ?? 0),
      feeChargedTransfers: Number(row.feeChargedTransfers ?? 0),
      feesMinor: Number(row.totalFeesMinor ?? 0),
    });
  }

  return buildTransferFeeInsight({
    totals,
    recent: recentResult.results.filter((row) => isCurrency(row.currency)),
  });
}
