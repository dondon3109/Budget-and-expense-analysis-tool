import {
  financialGoalInputSchema,
  financialGoalUpdateSchema,
  type FinancialGoalInput,
  type FinancialGoalUpdate,
} from "@zoption/shared";

import type { LocalCommandContext } from "../context";
import { LocalMutationError, goalSnapshot, uuidSchema } from "../model";

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
      await ctx.database.runAsync(
        `INSERT INTO sync_outbox (
          operation_id, idempotency_key, entity_type, entity_id, operation_type,
          base_revision, payload_json, dependency_ids_json, base_json, created_sequence
        ) VALUES (?, ?, 'goal', ?, 'create', 0, ?, '[]', '{}', ?)`,
        uuidSchema.parse(ctx.randomUuid()),
        uuidSchema.parse(ctx.randomUuid()),
        entityId,
        JSON.stringify({
          name: input.name,
          targetAmountMinor: input.targetAmountMinor,
          currentAmountMinor: input.currentAmountMinor,
          targetDate: input.targetDate,
          status: input.status,
        }),
        await ctx.store.nextSequence(),
      );
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
      if (current.sync_state === "failed" || current.sync_state === "conflicted") {
        throw new LocalMutationError(
          "Resolve this goal's synchronization state before editing it.",
          "mutation_blocked",
        );
      }
      const outbox = await ctx.store.currentOutbox("goal", id);
      if (outbox?.operation_type === "delete") {
        throw new LocalMutationError(
          "This goal is already waiting to be deleted.",
          "mutation_blocked",
        );
      }
      if (outbox && (outbox.state !== "pending" || outbox.attempt_count > 0)) {
        throw new LocalMutationError(
          "Wait for the current synchronization attempt before editing this goal.",
          "mutation_blocked",
        );
      }
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
      if (outbox) {
        await ctx.database.runAsync(
          `UPDATE sync_outbox SET payload_json = ?, state = 'pending', attempt_count = 0,
            next_attempt_at = NULL, last_error_code = NULL WHERE operation_id = ?`,
          JSON.stringify(merged),
          outbox.operation_id,
        );
      } else {
        await ctx.database.runAsync(
          `INSERT INTO sync_outbox (
            operation_id, idempotency_key, entity_type, entity_id, operation_type,
            base_revision, payload_json, dependency_ids_json, base_json, created_sequence
          ) VALUES (?, ?, 'goal', ?, 'update', ?, ?, '[]', ?, ?)`,
          uuidSchema.parse(ctx.randomUuid()),
          uuidSchema.parse(ctx.randomUuid()),
          id,
          current.server_revision,
          JSON.stringify(merged),
          JSON.stringify(goalSnapshot(current)),
          await ctx.store.nextSequence(),
        );
      }
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
      if (current.sync_state === "failed" || current.sync_state === "conflicted") {
        throw new LocalMutationError(
          "Resolve this goal's synchronization state before deleting it.",
          "mutation_blocked",
        );
      }
      const outbox = await ctx.store.currentOutbox("goal", id);
      if (outbox && (outbox.state !== "pending" || outbox.attempt_count > 0)) {
        throw new LocalMutationError(
          "Wait for the current synchronization attempt before deleting this goal.",
          "mutation_blocked",
        );
      }
      if (current.server_revision === 0 && outbox?.operation_type === "create") {
        await ctx.database.runAsync(
          "DELETE FROM sync_outbox WHERE operation_id = ?",
          outbox.operation_id,
        );
        await ctx.database.runAsync("DELETE FROM financial_goals WHERE id = ?", id);
        return;
      }
      if (outbox) {
        await ctx.database.runAsync(
          `UPDATE sync_outbox SET operation_type = 'delete', payload_json = '{}',
            state = 'pending', attempt_count = 0, next_attempt_at = NULL,
            last_error_code = NULL WHERE operation_id = ?`,
          outbox.operation_id,
        );
      } else {
        await ctx.database.runAsync(
          `INSERT INTO sync_outbox (
            operation_id, idempotency_key, entity_type, entity_id, operation_type,
            base_revision, payload_json, dependency_ids_json, base_json, created_sequence
          ) VALUES (?, ?, 'goal', ?, 'delete', ?, '{}', '[]', ?, ?)`,
          uuidSchema.parse(ctx.randomUuid()),
          uuidSchema.parse(ctx.randomUuid()),
          id,
          current.server_revision,
          JSON.stringify(goalSnapshot(current)),
          await ctx.store.nextSequence(),
        );
      }
      await ctx.database.runAsync(
        "UPDATE financial_goals SET deleted_at = ?, sync_state = 'pending' WHERE id = ?",
        ctx.now().toISOString(),
        id,
      );
    });
  });
}
