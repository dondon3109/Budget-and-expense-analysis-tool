import {
  buildCashflowTrend,
  buildCashflowTrendFromDayTotals,
  buildDashboardSummary,
  buildTransferFeeInsight,
  summarizeAccountBalances,
  type CashflowTrend,
  type CashflowTrendView,
  type Currency,
  type DashboardSummary,
  type TransferFeeActivityRow,
  type TransferFeeInsight,
  type TransferFeeTotalsByCurrency,
  type TransactionRecord,
} from "@zoption/shared";
import { and, eq, gte, lte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

import { accounts, budgets, categories, transactions } from "../../../../db/schema";
import { loadUsdToPhp } from "../fx/rates";
import { accountRepository } from "./accounts";
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
  // Aggregate per day in SQL and convert USD subtotals to a PHP base with the
  // stored daily rate. FLOOR(x + 0.5) mirrors Math.round exactly in IEEE
  // doubles, keeping per-row conversion identical to the JS implementation.
  // Transfers are excluded by buildCashflowTrendFromDayTotals' input contract.
  // A missing rate row falls back to the latest stored rate.
  const usdToPhp = await loadUsdToPhp(env);
  const totalsResult = await env.DB.prepare(
      `SELECT date,
              COALESCE(SUM(CASE WHEN kind = 'income' THEN convertedMinor ELSE 0 END), 0) AS incomeMinor,
              COALESCE(SUM(CASE WHEN kind = 'expense' THEN convertedMinor ELSE 0 END), 0) AS expenseMinor
       FROM (
         SELECT date,
                kind,
                CASE WHEN currency = 'USD'
                     THEN ABS(CAST(FLOOR((amount_minor / 100.0) * ?1 + 0.5) AS INTEGER) * 100)
                     ELSE ABS(amount_minor)
                END AS convertedMinor
         FROM transactions
         WHERE tenant_id = ?2 AND kind != 'transfer' AND date >= ?3 AND date <= ?4
       )
       GROUP BY date`,
    )
      .bind(usdToPhp, tenantId, preview.range.from, preview.range.to)
      .all<{ date: string; incomeMinor: number; expenseMinor: number }>();

  return buildCashflowTrendFromDayTotals(
    totalsResult.results.map((row) => ({
      date: row.date,
      incomeMinor: Number(row.incomeMinor),
      expenseMinor: Number(row.expenseMinor),
    })),
    query.view,
    query.anchorDate,
  );
}

async function loadBalancesByCurrency(
  env: Bindings,
  tenantId: string,
): Promise<Record<Currency, number>> {
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

  const balances: Record<Currency, number> = { PHP: 0, USD: 0 };
  for (const row of result.results) {
    if (row.currency === "PHP" || row.currency === "USD") {
      balances[row.currency] += Number(row.total ?? 0);
    }
  }
  return balances;
}

export async function loadDashboard(
  env: Bindings,
  tenantId: string,
  period: { from: string; to: string },
  accountId?: string,
): Promise<DashboardSummary> {
  const db = drizzle(env.DB);
  const trendFrom = sixMonthWindowStart(period.to);
  const queryFrom = period.from < trendFrom ? period.from : trendFrom;
  const budgetMonth = `${period.from.slice(0, 7)}-01`;
  const [transactionRows, budgetRows, accountRows, overallBalances] = await Promise.all([
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
  ]);

  const normalizedTransactions: TransactionRecord[] = transactionRows.map((row) => ({
    ...row,
    currency: row.currency as Currency,
    accountName: row.accountName ?? "Unassigned",
  }));

  const accountSummary = summarizeAccountBalances(accountRows);

  return buildDashboardSummary(normalizedTransactions, budgetRows, period, {
    ...accountSummary,
    overallBalanceMinor: overallBalances.PHP,
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
    if (row.currency !== "PHP" && row.currency !== "USD") continue;
    totals.push({
      currency: row.currency,
      transfers: Number(row.transfers ?? 0),
      feeChargedTransfers: Number(row.feeChargedTransfers ?? 0),
      feesMinor: Number(row.totalFeesMinor ?? 0),
    });
  }

  return buildTransferFeeInsight({
    totals,
    recent: recentResult.results.map((row) => ({
      date: row.date,
      currency: row.currency === "USD" ? "USD" : "PHP",
      transferFeeMinor: row.transferFeeMinor,
    })),
  });
}
