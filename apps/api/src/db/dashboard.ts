import {
  buildDashboardSummary,
  type DashboardSummary,
  type TransactionRecord,
} from "@budget/shared";
import { and, eq, gte, lte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

import { budgets, categories, transactions } from "../../../../db/schema";
import type { Bindings } from "../types";

const DEMO_TENANT_ID = "demo";

function sixMonthWindowStart(to: string): string {
  const endMonth = new Date(`${to.slice(0, 7)}-01T00:00:00Z`);
  endMonth.setUTCMonth(endMonth.getUTCMonth() - 5);
  return endMonth.toISOString().slice(0, 10);
}

export async function loadDashboard(
  env: Bindings,
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
    })
    .from(transactions)
    .innerJoin(categories, eq(transactions.categoryId, categories.id))
    .where(
      and(
        eq(transactions.tenantId, DEMO_TENANT_ID),
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
    .innerJoin(categories, eq(budgets.categoryId, categories.id))
    .where(and(eq(budgets.tenantId, DEMO_TENANT_ID), eq(budgets.month, budgetMonth)));

  const normalizedTransactions: TransactionRecord[] = transactionRows.map((row) => ({
    ...row,
    currency: "PHP",
    accountName: "Everyday account",
  }));

  return buildDashboardSummary(normalizedTransactions, budgetRows, period);
}
