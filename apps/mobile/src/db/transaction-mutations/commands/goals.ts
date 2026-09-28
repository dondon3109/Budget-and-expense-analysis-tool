import {
  financialGoalInputSchema,
  financialGoalUpdateSchema,
  type FinancialGoalInput,
  type FinancialGoalUpdate,
} from "@zoption/shared";

import type { LocalCommandContext } from "../context";
import { LocalMutationError, goalSnapshot, uuidSchema } from "../model";
import {
  assertRowSettled,
  assertNotQueuedForRemoval,
  assertNoAttemptInFlight,
  queueCreate,
  queueUpdate,
  queueDelete,
} from "./outbox-writes";

export function createGoal(ctx: LocalCommandContext, value: FinancialGoalInput): Promise<string> {
  const input = financialGoalInputSchema.parse(value);
  return ctx.writer.run(async () => {
    let entityId = "";
    await ctx.database.withTransactionAsync(async () => {
      await ctx.store.assertUniqueName("goal", input.name);
      await ctx.clientId();
      entityId = uuidSchema.parse(ctx.randomUuid());
      await ctx.database.runAsync(
        `INSERT INTO financial_goals (
          id, name, target_amount_minor, current_amount_minor, target_date, status,
          server_revision, server_updated_at, deleted_at, sync_state
        ) VALUES (?, ?, ?, ?, ?, ?, 0, NULL, NULL, 'pending')`,
        entityId,
        input.name,
        input.targetAmountMinor,
        input.currentAmountMinor,
        input.targetDate,
        input.status,
      );
      await queueCreate(ctx, "goal", entityId, {
        name: input.name,
        targetAmountMinor: input.targetAmountMinor,
        currentAmountMinor: input.currentAmountMinor,
        targetDate: input.targetDate,
        status: input.status,
      });
    });
    return entityId;
  });
}

export function updateGoal(
  ctx: LocalCommandContext,
  id: string,
  value: FinancialGoalUpdate,
): Promise<void> {
  const update = financialGoalUpdateSchema.parse(value);
  return ctx.writer.run(async () => {
    await ctx.database.withTransactionAsync(async () => {
      const current = await ctx.store.currentGoalById(id);
      assertRowSettled(current.sync_state, "goal", "editing");
      const outbox = await ctx.store.currentOutbox("goal", id);
      assertNotQueuedForRemoval(outbox, "goal", "deleted");
      assertNoAttemptInFlight(outbox, "goal", "editing");
      const merged = {
        name: update.name ?? current.name,
        targetAmountMinor: update.targetAmountMinor ?? current.target_amount_minor,
        currentAmountMinor: update.currentAmountMinor ?? current.current_amount_minor,
        targetDate: update.targetDate ?? current.target_date,
        status: update.status ?? current.status,
      };
      if (merged.currentAmountMinor > merged.targetAmountMinor) {
        throw new LocalMutationError(
          "Current savings cannot exceed the target amount.",
          "mutation_blocked",
        );
      }
      if (update.name) await ctx.store.assertUniqueName("goal", update.name, id);
      await queueUpdate(ctx, outbox, {
        entityType: "goal",
        entityId: id,
        baseRevision: current.server_revision,
        payload: merged,
        base: () => goalSnapshot(current),
      });
      await ctx.database.runAsync(
        `UPDATE financial_goals SET
          name = ?, target_amount_minor = ?, current_amount_minor = ?, target_date = ?,
          status = ?, sync_state = 'pending' WHERE id = ?`,
        merged.name,
        merged.targetAmountMinor,
        merged.currentAmountMinor,
        merged.targetDate,
        merged.status,
        id,
      );
    });
  });
}

export function deleteGoal(ctx: LocalCommandContext, id: string): Promise<void> {
  return ctx.writer.run(async () => {
    await ctx.database.withTransactionAsync(async () => {
      const current = await ctx.store.currentGoalById(id);
      assertRowSettled(current.sync_state, "goal", "deleting");
      const outbox = await ctx.store.currentOutbox("goal", id);
      assertNoAttemptInFlight(outbox, "goal", "deleting");
      if (current.server_revision === 0 && outbox?.operation_type === "create") {
        await ctx.database.runAsync(
          "DELETE FROM sync_outbox WHERE operation_id = ?",
          outbox.operation_id,
        );
        await ctx.database.runAsync("DELETE FROM financial_goals WHERE id = ?", id);
        return;
      }
      await queueDelete(ctx, outbox, {
        entityType: "goal",
        entityId: id,
        baseRevision: current.server_revision,
        base: () => goalSnapshot(current),
      });
      await ctx.database.runAsync(
        "UPDATE financial_goals SET deleted_at = ?, sync_state = 'pending' WHERE id = ?",
        ctx.now().toISOString(),
        id,
      );
    });
  });
}
