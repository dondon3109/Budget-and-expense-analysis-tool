import {
  EVERY_MONTH_KEY,
  type BudgetOccasionSummary,
  type BudgetPlan,
  type BudgetPlanItem,
  type BudgetQuery,
  type BudgetUpsert,
} from "@zoption/shared";
import { and, eq, gte, lt, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

import { budgets, calendarEvents, categories, transactions } from "../../../../db/schema";
import { HttpError } from "../errors";
import type { Bindings } from "../types";
import { loadWorkspaceCurrency } from "./workspace-settings";

export interface BudgetRepository {
  get(env: Bindings, tenantId: string, query: BudgetQuery): Promise<BudgetPlan>;
  listOccasions(env: Bindings, tenantId: string, month: string): Promise<BudgetOccasionSummary[]>;
  upsert(env: Bindings, tenantId: string, input: BudgetUpsert): Promise<BudgetPlan>;
}

interface PeriodLimit {
  limitMinor: number;
  source: BudgetPlanItem["source"];
}

/** The period key budget rows are stored under for an occasion. */
function occasionKey(eventId: string): string {
  return `occasion:${eventId}`;
}

function nextMonth(month: string): string {
  const year = Number(month.slice(0, 4));
  const monthNumber = Number(month.slice(5, 7));
  return monthNumber === 12
    ? `${String(year + 1).padStart(4, "0")}-01-01`
    : `${String(year).padStart(4, "0")}-${String(monthNumber + 1).padStart(2, "0")}-01`;
}

function nextDay(date: string): string {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

function roundPercent(value: number): number {
  return Math.round(value * 10) / 10;
}

async function readLimits(
  env: Bindings,
  tenantId: string,
  period: string,
): Promise<Map<string, number>> {
  const rows = await drizzle(env.DB)
    .select({ categoryId: budgets.categoryId, limitMinor: budgets.limitMinor })
    .from(budgets)
    .where(and(eq(budgets.tenantId, tenantId), eq(budgets.month, period)));
  return new Map(rows.map((row) => [row.categoryId, row.limitMinor]));
}

async function readEvent(env: Bindings, tenantId: string, eventId: string) {
  const [event] = await drizzle(env.DB)
    .select({ id: calendarEvents.id, title: calendarEvents.title, date: calendarEvents.date })
    .from(calendarEvents)
    .where(and(eq(calendarEvents.tenantId, tenantId), eq(calendarEvents.id, eventId)))
    .limit(1);
  if (!event) throw new HttpError(404, "event_not_found", "That calendar event no longer exists.");
  return event;
}

export const budgetRepository: BudgetRepository = {
  async get(env, tenantId, query) {
    const db = drizzle(env.DB);
    // Limits are in the workspace currency, so only spending in it counts against them.
    const currency = await loadWorkspaceCurrency(env, tenantId);

    // Each scope resolves to its limits and the date window whose spending counts against them.
    let limits: Map<string, PeriodLimit>;
    let window: { start: string; end: string } | null = null;
    let plan: Pick<BudgetPlan, "scope" | "month" | "eventId" | "title" | "date">;
    if (query.scope === "month") {
      const [own, defaults] = await Promise.all([
        readLimits(env, tenantId, query.month),
        readLimits(env, tenantId, EVERY_MONTH_KEY),
      ]);
      // A month's own row wins, even at zero, so a month can switch a default category off.
      limits = new Map(
        [...defaults.keys(), ...own.keys()].map((categoryId): [string, PeriodLimit] => {
          const ownLimit = own.get(categoryId);
          return ownLimit === undefined
            ? [categoryId, { limitMinor: defaults.get(categoryId) ?? 0, source: "every-month" }]
            : [categoryId, { limitMinor: ownLimit, source: "month" }];
        }),
      );
      window = { start: query.month, end: nextMonth(query.month) };
      plan = { scope: "month", month: query.month, eventId: null, title: null, date: null };
    } else if (query.scope === "every-month") {
      limits = new Map(
        [...(await readLimits(env, tenantId, EVERY_MONTH_KEY))].map(([categoryId, limitMinor]) => [
          categoryId,
          { limitMinor, source: "every-month" },
        ]),
      );
      plan = { scope: "every-month", month: null, eventId: null, title: null, date: null };
    } else {
      const event = await readEvent(env, tenantId, query.eventId);
      limits = new Map(
        [...(await readLimits(env, tenantId, occasionKey(event.id)))].map(
          ([categoryId, limitMinor]) => [categoryId, { limitMinor, source: "occasion" }],
        ),
      );
      window = { start: event.date, end: nextDay(event.date) };
      plan = {
        scope: "occasion",
        month: null,
        eventId: event.id,
        title: event.title,
        date: event.date,
      };
    }

    const [categoryRows, spendingRows] = await Promise.all([
      db
        .select({ id: categories.id, name: categories.name, color: categories.color })
        .from(categories)
        .where(
          and(
            eq(categories.tenantId, tenantId),
            eq(categories.kind, "expense"),
            eq(categories.archived, false),
          ),
        )
        .orderBy(categories.name),
      window
        ? db
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
                eq(transactions.currency, currency),
                gte(transactions.date, window.start),
                lt(transactions.date, window.end),
              ),
            )
            .groupBy(transactions.categoryId)
        : Promise.resolve([]),
    ]);

    const spending = new Map(spendingRows.map((row) => [row.categoryId, row.spentMinor]));
    const items: BudgetPlanItem[] = categoryRows.map((category) => {
      const limit = limits.get(category.id);
      const limitMinor = limit?.limitMinor ?? 0;
      const spentMinor = spending.get(category.id) ?? 0;
      return {
        categoryId: category.id,
        categoryName: category.name,
        categoryColor: category.color,
        limitMinor,
        spentMinor,
        remainingMinor: limitMinor === 0 ? 0 : limitMinor - spentMinor,
        usedPercent: limitMinor === 0 ? 0 : roundPercent((spentMinor / limitMinor) * 100),
        source: limit?.source ?? "none",
      };
    });
    const totalLimitMinor = items.reduce((sum, item) => sum + item.limitMinor, 0);
    const totalSpentMinor = items.reduce(
      (sum, item) => sum + (item.limitMinor > 0 ? item.spentMinor : 0),
      0,
    );
    return {
      ...plan,
      currency,
      totalLimitMinor,
      totalSpentMinor,
      remainingMinor: totalLimitMinor - totalSpentMinor,
      usedPercent:
        totalLimitMinor === 0 ? 0 : roundPercent((totalSpentMinor / totalLimitMinor) * 100),
      items,
    };
  },

  async listOccasions(env, tenantId, month) {
    const currency = await loadWorkspaceCurrency(env, tenantId);
    const rows = await env.DB.prepare(
      `SELECT e.id AS eventId, e.title, e.date,
        SUM(b.limit_minor) AS totalLimitMinor,
        COALESCE((
          SELECT SUM(ABS(t.amount_minor)) FROM transactions t
          WHERE t.tenant_id = e.tenant_id AND t.kind = 'expense' AND t.currency = ?
            AND t.date = e.date
            AND t.category_id IN (
              SELECT category_id FROM budgets
              WHERE tenant_id = e.tenant_id AND occasion_id = e.id AND limit_minor > 0
            )
        ), 0) AS totalSpentMinor
       FROM calendar_events e
       JOIN budgets b ON b.tenant_id = e.tenant_id AND b.occasion_id = e.id AND b.limit_minor > 0
       WHERE e.tenant_id = ? AND e.date >= ? AND e.date < ?
       GROUP BY e.id
       ORDER BY e.date, e.title`,
    )
      .bind(currency, tenantId, month, nextMonth(month))
      .all<BudgetOccasionSummary>();
    return rows.results;
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

    let period: string;
    let eventId: string | null = null;
    let query: BudgetQuery;
    if (input.scope === "month") {
      period = input.month;
      query = { scope: "month", month: input.month };
    } else if (input.scope === "every-month") {
      period = EVERY_MONTH_KEY;
      query = { scope: "every-month" };
    } else {
      eventId = (await readEvent(env, tenantId, input.eventId)).id;
      period = occasionKey(eventId);
      query = { scope: "occasion", eventId };
    }

    await env.DB.batch(
      input.items.map((item) =>
        env.DB.prepare(
          `INSERT INTO budgets (id, tenant_id, category_id, month, occasion_id, limit_minor)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT (tenant_id, month, category_id)
           DO UPDATE SET limit_minor = excluded.limit_minor, updated_at = datetime('now')`,
        ).bind(crypto.randomUUID(), tenantId, item.categoryId, period, eventId, item.limitMinor),
      ),
    );
    return this.get(env, tenantId, query);
  },
};
