import {
  buildDashboardSummary,
  type DashboardSummary,
  type TransactionRecord,
} from "@zoption/shared";
import { and, eq, gte, lte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

import { accounts, budgets, categories, transactions } from "../../../../db/schema";
import type { Bindings } from "../types";

function sixMonthWindowStart(to: string): string {
  const endMonth = new Date(`${to.slice(0, 7)}-01T00:00:00Z`);
  endMonth.setUTCMonth(endMonth.getUTCMonth() - 5);
  return endMonth.toISOString().slice(0, 10);
}

export async function loadDashboard(
  env: Bindings,
  tenantId: string,
  period: { from: string; to: string },
): Promise<DashboardSummary> {
  const db = drizzle(env.DB);
  const trendFrom = sixMonthWindowStart(period.to);
  const queryFrom = period.from < trendFrom ? period.from : trendFrom;
  const budgetMonth = `${period.from.slice(0, 7)}-01`;
  const transactionRows = await db
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
        gte(transactions.date, queryFrom),
        lte(transactions.date, period.to),
      ),
    );

  const budgetRows = await db
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
    .where(and(eq(budgets.tenantId, tenantId), eq(budgets.month, budgetMonth)));

  const normalizedTransactions: TransactionRecord[] = transactionRows.map((row) => ({
    ...row,
    currency: "PHP",
    accountName: row.accountName ?? "Unassigned",
  }));

  return buildDashboardSummary(normalizedTransactions, budgetRows, period);
}
