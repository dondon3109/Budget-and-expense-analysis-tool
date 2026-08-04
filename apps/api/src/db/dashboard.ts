import {
  buildCashflowTrend,
  buildDashboardSummary,
  summarizeAccountBalances,
  type CashflowTrend,
  type CashflowTrendView,
  type Currency,
  type DashboardSummary,
  type TransactionRecord,
} from "@zoption/shared";
import { and, eq, gte, lte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

import { accounts, budgets, categories, transactions } from "../../../../db/schema";
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
  const db = drizzle(env.DB);
  const rows = await db
    .select({
      date: transactions.date,
      amountMinor: transactions.amountMinor,
      kind: transactions.kind,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.tenantId, tenantId),
        gte(transactions.date, preview.range.from),
        lte(transactions.date, preview.range.to),
      ),
    );

  return buildCashflowTrend(rows, query.view, query.anchorDate);
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
