import { budgetLimitMinorSchema, monthStartSchema, resourceIdSchema } from "@zoption/shared";

import type { LocalCommandContext } from "../context";
import { LocalMutationError, budgetSnapshot, uuidSchema } from "../model";
import {
  assertRowSettled,
  assertNoAttemptInFlight,
  queueCreate,
  queueUpdate,
} from "./outbox-writes";

export function setBudgetLimit(
  ctx: LocalCommandContext,
  month: string,
  categoryId: string,
  limitMinor: number,
): Promise<void> {
  const monthValue = monthStartSchema.parse(month);
  const category = resourceIdSchema.parse(categoryId);
  const limit = budgetLimitMinorSchema.parse(limitMinor);
  return ctx.writer.run(async () => {
    await ctx.database.withTransactionAsync(async () => {
      await ctx.clientId();
      const categoryRow = await ctx.store.currentCategory(category);
      if (categoryRow.kind !== "expense" || categoryRow.archived === 1) {
        throw new LocalMutationError("Choose an active expense category.", "invalid_reference");
      }
      const existing = await ctx.store.currentBudget(monthValue, category);
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
      if (limit === 0) return;
      const entityId = uuidSchema.parse(ctx.randomUuid());
      await ctx.database.runAsync(
        `INSERT INTO budgets (
          id, category_id, month, limit_minor, server_revision, server_updated_at, deleted_at, sync_state
        ) VALUES (?, ?, ?, ?, 0, NULL, NULL, 'pending')`,
        entityId,
        category,
        monthValue,
        limit,
      );
      await queueCreate(ctx, "budget", entityId, {
        categoryId: category,
        month: monthValue,
        limitMinor: limit,
      });
    });
  });
}
