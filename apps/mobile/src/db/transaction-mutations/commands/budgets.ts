import {
  EVERY_MONTH_KEY,
  budgetLimitMinorSchema,
  budgetQuerySchema,
  resourceIdSchema,
  type BudgetQuery,
} from "@zoption/shared";

import type { LocalCommandContext } from "../context";
import { LocalMutationError, budgetSnapshot, uuidSchema } from "../model";
import {
  assertRowSettled,
  assertNoAttemptInFlight,
  queueCreate,
  queueUpdate,
} from "./outbox-writes";

async function writeBudgetLimitInTransaction(
  ctx: LocalCommandContext,
  parsedPeriod: BudgetQuery,
  monthValue: string,
  occasionId: string | null,
  category: string,
  limit: number,
): Promise<void> {
  const categoryRow = await ctx.store.currentCategory(category);
  if (categoryRow.kind !== "expense" || categoryRow.archived === 1) {
    throw new LocalMutationError("Choose an active expense category.", "invalid_reference");
  }
  const existing = await ctx.store.currentBudget(monthValue, occasionId, category);
  if (existing) {
    assertRowSettled(existing.sync_state, "budget", "editing");
    const outbox = await ctx.store.currentOutbox("budget", existing.id);
    assertNoAttemptInFlight(outbox, "budget", "editing");
    const payload = { limitMinor: limit };
    await queueUpdate(ctx, outbox, {
      entityType: "budget",
      entityId: existing.id,
      baseRevision: existing.server_revision,
      payload,
      base: () => budgetSnapshot(existing),
    });
    await ctx.database.runAsync(
      "UPDATE budgets SET limit_minor = ?, sync_state = 'pending' WHERE id = ?",
      limit,
      existing.id,
    );
    return;
  }
  if (limit === 0) {
    const overridesDefault =
      parsedPeriod.scope === "month" &&
      ((await ctx.store.currentBudget(EVERY_MONTH_KEY, null, category))?.limit_minor ?? 0) > 0;
    if (!overridesDefault) return;
  }
  const entityId = uuidSchema.parse(ctx.randomUuid());
  await ctx.database.runAsync(
    `INSERT INTO budgets (
      id, category_id, month, occasion_id, limit_minor, server_revision, server_updated_at,
      deleted_at, sync_state
    ) VALUES (?, ?, ?, ?, ?, 0, NULL, NULL, 'pending')`,
    entityId,
    category,
    monthValue,
    occasionId,
    limit,
  );
  await queueCreate(ctx, "budget", entityId, {
    categoryId: category,
    month: monthValue,
    occasionId,
    limitMinor: limit,
  });
}

/**
 * Sets one category's limit in a month, in every month, or in an occasion. A month limit of zero
 * on a category that has an every-month default is kept as a row: it switches that default off
 * for the month, where a missing row would let the default through.
 */
export function setBudgetLimit(
  ctx: LocalCommandContext,
  period: BudgetQuery,
  categoryId: string,
  limitMinor: number,
): Promise<void> {
  return setBudgetLimits(ctx, period, [{ categoryId, limitMinor }]);
}

/** Sets several category limits for one budget scope and their outbox rows in a single transaction. */
export function setBudgetLimits(
  ctx: LocalCommandContext,
  period: BudgetQuery,
  items: ReadonlyArray<{ categoryId: string; limitMinor: number }>,
): Promise<void> {
  const parsedPeriod = budgetQuerySchema.parse(period);
  const parsedItems = items.map((item) => ({
    category: resourceIdSchema.parse(item.categoryId),
    limit: budgetLimitMinorSchema.parse(item.limitMinor),
  }));
  if (parsedItems.length === 0) return Promise.resolve();
  // An occasion row keeps the every-month key as a placeholder month, as on the Worker.
  const monthValue = parsedPeriod.scope === "month" ? parsedPeriod.month : EVERY_MONTH_KEY;
  const occasionId = parsedPeriod.scope === "occasion" ? parsedPeriod.eventId : null;
  return ctx.writer.run(async () => {
    await ctx.database.withTransactionAsync(async () => {
      await ctx.clientId();
      for (const { category, limit } of parsedItems) {
        await writeBudgetLimitInTransaction(
          ctx,
          parsedPeriod,
          monthValue,
          occasionId,
          category,
          limit,
        );
      }
    });
  });
}
