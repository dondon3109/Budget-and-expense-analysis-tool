import type { BudgetMonthPlan, BudgetUpsert } from "@budget/shared";
import { and, eq, gte, lt, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

import { budgets, categories, transactions } from "../../../../db/schema";
import { HttpError } from "../errors";
import type { Bindings } from "../types";

export interface BudgetRepository {
  list(env: Bindings, tenantId: string, month: string): Promise<BudgetMonthPlan>;
  upsert(env: Bindings, tenantId: string, input: BudgetUpsert): Promise<BudgetMonthPlan>;
}

function nextMonth(month: string): string {
  const year = Number(month.slice(0, 4));
  const monthNumber = Number(month.slice(5, 7));
  return monthNumber === 12
    ? `${String(year + 1).padStart(4, "0")}-01-01`
    : `${String(year).padStart(4, "0")}-${String(monthNumber + 1).padStart(2, "0")}-01`;
}

function roundPercent(value: number): number {
  return Math.round(value * 10) / 10;
}

export const budgetRepository: BudgetRepository = {
  async list(env, tenantId, month) {
    const db = drizzle(env.DB);
    const end = nextMonth(month);
    const [categoryRows, budgetRows, spendingRows, totalRows] = await Promise.all([
      db
        .select({
          id: categories.id,
          name: categories.name,
          color: categories.color,
        })
        .from(categories)
        .where(
          and(
            eq(categories.tenantId, tenantId),
            eq(categories.kind, "expense"),
            eq(categories.archived, false),
          ),
        )
        .orderBy(categories.name),
      db
        .select({ categoryId: budgets.categoryId, limitMinor: budgets.limitMinor })
        .from(budgets)
        .where(and(eq(budgets.tenantId, tenantId), eq(budgets.month, month))),
      db
        .select({
          categoryId: transactions.categoryId,
          spentMinor: sql<number>`coalesce(sum(abs(${transactions.amountMinor})), 0)`.mapWith(
            Number,
          ),
        })
        .from(transactions)
        .where(
          and(
            eq(transactions.tenantId, tenantId),
            eq(transactions.kind, "expense"),
            gte(transactions.date, month),
            lt(transactions.date, end),
          ),
        )
        .groupBy(transactions.categoryId),
      db
        .select({
          spentMinor: sql<number>`coalesce(sum(abs(${transactions.amountMinor})), 0)`.mapWith(
            Number,
          ),
        })
        .from(transactions)
        .where(
          and(
            eq(transactions.tenantId, tenantId),
            eq(transactions.kind, "expense"),
            gte(transactions.date, month),
            lt(transactions.date, end),
          ),
        ),
    ]);

    const limits = new Map(budgetRows.map((row) => [row.categoryId, row.limitMinor]));
    const spending = new Map(spendingRows.map((row) => [row.categoryId, row.spentMinor]));
    const items = categoryRows.map((category) => {
      const limitMinor = limits.get(category.id) ?? 0;
      const spentMinor = spending.get(category.id) ?? 0;
      return {
        categoryId: category.id,
        categoryName: category.name,
        categoryColor: category.color,
        limitMinor,
        spentMinor,
        remainingMinor: limitMinor - spentMinor,
        usedPercent: limitMinor === 0 ? 0 : roundPercent((spentMinor / limitMinor) * 100),
      };
    });
    const totalLimitMinor = items.reduce((sum, item) => sum + item.limitMinor, 0);
    const totalSpentMinor = totalRows[0]?.spentMinor ?? 0;
    return {
      month,
      currency: "PHP",
      totalLimitMinor,
      totalSpentMinor,
      remainingMinor: totalLimitMinor - totalSpentMinor,
      usedPercent:
        totalLimitMinor === 0 ? 0 : roundPercent((totalSpentMinor / totalLimitMinor) * 100),
      items,
    };
  },

  async upsert(env, tenantId, input) {
    const db = drizzle(env.DB);
    const categoryRows = await db
      .select({ id: categories.id })
      .from(categories)
      .where(
        and(
          eq(categories.tenantId, tenantId),
          eq(categories.kind, "expense"),
          eq(categories.archived, false),
        ),
      );
    const validCategoryIds = new Set(categoryRows.map((category) => category.id));
    if (input.items.some((item) => !validCategoryIds.has(item.categoryId))) {
      throw new HttpError(400, "invalid_budget_category", "Choose active expense categories only.");
    }

    await env.DB.batch(
      input.items.map((item) =>
        env.DB.prepare(
          `INSERT INTO budgets (id, tenant_id, category_id, month, limit_minor)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT (tenant_id, month, category_id)
           DO UPDATE SET limit_minor = excluded.limit_minor, updated_at = datetime('now')`,
        ).bind(crypto.randomUUID(), tenantId, item.categoryId, input.month, item.limitMinor),
      ),
    );
    return this.list(env, tenantId, input.month);
  },
};
