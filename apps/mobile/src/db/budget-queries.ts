// Local reads for budget plans and the occasion budgets shown on the calendars.

import { EVERY_MONTH_KEY, type BudgetQuery, type Currency } from "@zoption/shared";
import type { SQLiteDatabase } from "expo-sqlite";
import { z } from "zod";

import { localCategoryOptionSchema } from "./transaction-form-data";
import type {
  BudgetMonthItem,
  LocalBudgetOccasion,
  LocalBudgetPlanData,
  LocalEventItem,
} from "./view-models";

const budgetLimitRowSchema = z.object({
  id: z.string(),
  category_id: z.string(),
  month: z.string(),
  category_name: z.string(),
  category_color: z.string(),
  limit_minor: z.number().int().safe(),
  sync_state: z.enum(["synced", "pending", "failed", "conflicted"]),
});

const budgetSpendingRowSchema = z.object({
  category_id: z.string(),
  spent_minor: z.number().int().safe(),
});

const budgetOccasionRowSchema = z.object({
  event_id: z.string(),
  title: z.string(),
  date: z.string(),
  total_limit_minor: z.number().int().safe(),
  total_spent_minor: z.number().int().safe(),
});

/**
 * Reads one budget plan: a month (its own limits over the every-month defaults), the every-month
 * defaults, or an occasion. Limits are in the workspace `currency`, so only spending in it
 * counts against them. A month counts the whole month's spending; an occasion counts its date.
 */
export async function readBudgetPlan(
  database: SQLiteDatabase,
  period: BudgetQuery,
  currency: Currency,
  event: LocalEventItem | null,
): Promise<LocalBudgetPlanData> {
  const window =
    period.scope === "month"
      ? { start: period.month, end: nextMonthStart(period.month) }
      : event
        ? { start: event.date, end: nextDate(event.date) }
        : null;
  const limitFilter =
    period.scope === "month"
      ? {
          sql: "b.occasion_id IS NULL AND b.month IN (?, ?)",
          args: [period.month, EVERY_MONTH_KEY],
        }
      : period.scope === "every-month"
        ? { sql: "b.occasion_id IS NULL AND b.month = ?", args: [EVERY_MONTH_KEY] }
        : { sql: "b.occasion_id = ?", args: [period.eventId] };
  const [limitRows, spendingRows, categoryRows] = await Promise.all([
    database.getAllAsync(
      `SELECT b.id, b.category_id, b.month, c.name AS category_name, c.color AS category_color,
        b.limit_minor, b.sync_state
       FROM budgets b
       INNER JOIN categories c ON c.id = b.category_id AND c.deleted_at IS NULL
       WHERE b.deleted_at IS NULL AND ${limitFilter.sql}
       ORDER BY c.name COLLATE NOCASE`,
      ...limitFilter.args,
    ),
    window
      ? database.getAllAsync(
          `SELECT category_id, SUM(ABS(amount_minor)) AS spent_minor FROM transactions
           WHERE deleted_at IS NULL AND kind = 'expense' AND currency = ?
             AND date >= ? AND date < ?
           GROUP BY category_id`,
          currency,
          window.start,
          window.end,
        )
      : Promise.resolve([]),
    // Every active expense category can hold a budget, as on the web and the Worker. A plan
    // lock only blocks new entries, and custom categories made during the Pro trial lock when
    // it ends, so filtering on it left little more than the system Debt payment category.
    database.getAllAsync(
      `SELECT id, name, kind, color, icon_emoji AS iconEmoji,
        CASE WHEN server_revision = 0 THEN 1 ELSE 0 END AS pending
       FROM categories
       WHERE deleted_at IS NULL AND archived = 0 AND kind = 'expense'
       ORDER BY name COLLATE NOCASE, id`,
    ),
  ]);
  const spending = new Map(
    z
      .array(budgetSpendingRowSchema)
      .parse(spendingRows)
      .map((row) => [row.category_id, row.spent_minor]),
  );
  // A month's own row wins over the every-month default, so the default is read first.
  const byCategory = new Map<string, BudgetMonthItem>();
  for (const row of z
    .array(budgetLimitRowSchema)
    .parse(limitRows)
    .sort(
      (left, right) =>
        Number(left.month !== EVERY_MONTH_KEY) - Number(right.month !== EVERY_MONTH_KEY),
    )) {
    byCategory.set(row.category_id, {
      id: row.id,
      categoryId: row.category_id,
      categoryName: row.category_name,
      categoryColor: row.category_color,
      limitMinor: row.limit_minor,
      spentMinor: spending.get(row.category_id) ?? 0,
      source:
        period.scope === "occasion"
          ? "occasion"
          : row.month === EVERY_MONTH_KEY
            ? "every-month"
            : "month",
      syncState: row.sync_state,
    });
  }
  return {
    budgets: [...byCategory.values()].sort((left, right) =>
      left.categoryName.localeCompare(right.categoryName),
    ),
    categories: z.array(localCategoryOptionSchema).parse(categoryRows),
    event: event ? { id: event.id, title: event.title, date: event.date } : null,
  };
}

/** Occasions on the calendar in `month`, each with its total limit and what its day spent. */
export async function readBudgetOccasions(
  database: SQLiteDatabase,
  month: string,
  currency: Currency,
): Promise<LocalBudgetOccasion[]> {
  const rows = await database.getAllAsync(
    `SELECT e.id AS event_id, e.title, e.date, SUM(b.limit_minor) AS total_limit_minor,
      COALESCE((
        SELECT SUM(ABS(t.amount_minor)) FROM transactions t
        WHERE t.deleted_at IS NULL AND t.kind = 'expense' AND t.currency = ? AND t.date = e.date
          AND t.category_id IN (
            SELECT category_id FROM budgets
            WHERE occasion_id = e.id AND deleted_at IS NULL AND limit_minor > 0
          )
      ), 0) AS total_spent_minor
     FROM calendar_events e
     INNER JOIN budgets b
       ON b.occasion_id = e.id AND b.deleted_at IS NULL AND b.limit_minor > 0
     WHERE e.deleted_at IS NULL AND e.date >= ? AND e.date < ?
     GROUP BY e.id
     ORDER BY e.date, e.title COLLATE NOCASE`,
    currency,
    month,
    nextMonthStart(month),
  );
  return z
    .array(budgetOccasionRowSchema)
    .parse(rows)
    .map((row) => ({
      eventId: row.event_id,
      title: row.title,
      date: row.date,
      totalLimitMinor: row.total_limit_minor,
      totalSpentMinor: row.total_spent_minor,
    }));
}

export function nextMonthStart(month: string): string {
  const date = new Date(`${month}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + 1);
  return date.toISOString().slice(0, 10);
}

function nextDate(date: string): string {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}
