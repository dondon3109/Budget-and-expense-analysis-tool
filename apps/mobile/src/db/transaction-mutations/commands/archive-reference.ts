import type { z } from "zod";

import type { LocalCommandContext } from "../context";
import {
  LocalMutationError,
  accountSnapshot,
  categorySnapshot,
  syncEntityTable,
  uuidSchema,
  type accountRowSchema,
  type categoryRowSchema,
} from "../model";

export function archiveReferenceEntity(
  ctx: LocalCommandContext,
  entityType: "account" | "category",
  id: string,
): Promise<void> {
  return ctx.writer.run(async () => {
    await ctx.database.withTransactionAsync(async () => {
      const current =
        entityType === "account"
          ? await ctx.store.currentAccount(id)
          : await ctx.store.currentCategory(id);
      if (current.system === 1) {
        throw new LocalMutationError(
          `Permanent ${entityType}s cannot be archived.`,
          "mutation_blocked",
        );
      }
      if (current.sync_state === "failed" || current.sync_state === "conflicted") {
        throw new LocalMutationError(
          `Resolve this ${entityType}'s synchronization state before archiving it.`,
          "mutation_blocked",
        );
      }
      const outbox = await ctx.store.currentOutbox(entityType, id);
      if (outbox && (outbox.state !== "pending" || outbox.attempt_count > 0)) {
        throw new LocalMutationError(
          `Wait for the current synchronization attempt before archiving this ${entityType}.`,
          "mutation_blocked",
        );
      }
      if (current.server_revision === 0 && outbox?.operation_type === "create") {
        await ctx.store.assertNoOutboxDependents(outbox.operation_id);
        await ctx.database.runAsync(
          "DELETE FROM sync_outbox WHERE operation_id = ?",
          outbox.operation_id,
        );
        await ctx.database.runAsync(`DELETE FROM ${syncEntityTable(entityType)} WHERE id = ?`, id);
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
          ) VALUES (?, ?, ?, ?, 'delete', ?, '{}', '[]', ?, ?)`,
          uuidSchema.parse(ctx.randomUuid()),
          uuidSchema.parse(ctx.randomUuid()),
          entityType,
          id,
          current.server_revision,
          JSON.stringify(
            entityType === "account"
              ? accountSnapshot(current as z.infer<typeof accountRowSchema>)
              : categorySnapshot(current as z.infer<typeof categoryRowSchema>),
          ),
          await ctx.store.nextSequence(),
        );
      }
      await ctx.database.runAsync(
        `UPDATE ${syncEntityTable(entityType)} SET archived = 1, sync_state = 'pending' WHERE id = ?`,
        id,
      );
    });
  });
}
