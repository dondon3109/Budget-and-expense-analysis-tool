import { z } from "zod";
import { monthStartSchema, resourceIdSchema } from "@zoption/shared";

import type { LocalCommandContext } from "../context";
import { LocalMutationError, budgetSnapshot, uuidSchema } from "../model";

export function setBudgetLimit(
  ctx: LocalCommandContext,
  month: string,
  categoryId: string,
  limitMinor: number,
): Promise<void> {
  const monthValue = monthStartSchema.parse(month);
  const category = resourceIdSchema.parse(categoryId);
  const limit = z.number().int().safe().min(0).max(1_000_000_000_00).parse(limitMinor);
  return ctx.writer.run(async () => {
    await ctx.database.withTransactionAsync(async () => {
      await ctx.clientId();
      const categoryRow = await ctx.store.currentCategory(category);
      if (categoryRow.kind !== "expense" || categoryRow.archived === 1) {
        throw new LocalMutationError("Choose an active expense category.", "invalid_reference");
      }
      const existing = await ctx.store.currentBudget(monthValue, category);
      if (existing) {
        if (existing.sync_state === "failed" || existing.sync_state === "conflicted") {
          throw new LocalMutationError(
            "Resolve this budget's synchronization state before editing it.",
            "mutation_blocked",
          );
        }
        const outbox = await ctx.store.currentOutbox("budget", existing.id);
        if (outbox && (outbox.state !== "pending" || outbox.attempt_count > 0)) {
          throw new LocalMutationError(
            "Wait for the current synchronization attempt before editing this budget.",
            "mutation_blocked",
          );
        }
        const payload = { limitMinor: limit };
        if (outbox) {
          await ctx.database.runAsync(
            `UPDATE sync_outbox SET payload_json = ?, state = 'pending', attempt_count = 0,
              next_attempt_at = NULL, last_error_code = NULL WHERE operation_id = ?`,
            JSON.stringify(payload),
            outbox.operation_id,
          );
        } else {
          await ctx.database.runAsync(
            `INSERT INTO sync_outbox (
              operation_id, idempotency_key, entity_type, entity_id, operation_type,
              base_revision, payload_json, dependency_ids_json, base_json, created_sequence
            ) VALUES (?, ?, 'budget', ?, 'update', ?, ?, '[]', ?, ?)`,
            uuidSchema.parse(ctx.randomUuid()),
            uuidSchema.parse(ctx.randomUuid()),
            existing.id,
            existing.server_revision,
            JSON.stringify(payload),
            JSON.stringify(budgetSnapshot(existing)),
            await ctx.store.nextSequence(),
          );
        }
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
      await ctx.database.runAsync(
        `INSERT INTO sync_outbox (
          operation_id, idempotency_key, entity_type, entity_id, operation_type,
          base_revision, payload_json, dependency_ids_json, base_json, created_sequence
        ) VALUES (?, ?, 'budget', ?, 'create', 0, ?, '[]', '{}', ?)`,
        uuidSchema.parse(ctx.randomUuid()),
        uuidSchema.parse(ctx.randomUuid()),
        entityId,
        JSON.stringify({ categoryId: category, month: monthValue, limitMinor: limit }),
        await ctx.store.nextSequence(),
      );
    });
  });
}
