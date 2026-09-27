import {
  categoryInputSchema,
  categoryUpdateSchema,
  type CategoryInput,
  type CategoryUpdate,
} from "@zoption/shared";

import type { LocalCommandContext } from "../context";
import { LocalMutationError, categorySnapshot, uuidSchema } from "../model";

export function createCategory(ctx: LocalCommandContext, value: CategoryInput): Promise<string> {
  const input = categoryInputSchema.parse(value);
  return ctx.writer.run(async () => {
    let entityId = "";
    await ctx.database.withTransactionAsync(async () => {
      await ctx.store.assertUniqueName("category", input.name);
      await ctx.clientId();
      entityId = uuidSchema.parse(ctx.randomUuid());
      await ctx.database.runAsync(
        `INSERT INTO categories (
          id, name, kind, color, icon_emoji, archived, system, origin, required_plan, locked,
          server_revision, server_updated_at, deleted_at, sync_state
        ) VALUES (?, ?, ?, ?, ?, 0, 0, 'custom', 'free', 0, 0, NULL, NULL, 'pending')`,
        entityId,
        input.name,
        input.kind,
        input.color,
        input.iconEmoji ?? null,
      );
      await ctx.database.runAsync(
        `INSERT INTO sync_outbox (
          operation_id, idempotency_key, entity_type, entity_id, operation_type,
          base_revision, payload_json, dependency_ids_json, base_json, created_sequence
        ) VALUES (?, ?, 'category', ?, 'create', 0, ?, '[]', '{}', ?)`,
        uuidSchema.parse(ctx.randomUuid()),
        uuidSchema.parse(ctx.randomUuid()),
        entityId,
        JSON.stringify(input),
        await ctx.store.nextSequence(),
      );
    });
    return entityId;
  });
}

export function updateCategory(
  ctx: LocalCommandContext,
  id: string,
  value: CategoryUpdate,
): Promise<void> {
  const update = categoryUpdateSchema.parse(value);
  return ctx.writer.run(async () => {
    await ctx.database.withTransactionAsync(async () => {
      const current = await ctx.store.currentCategory(id);
      if (
        current.system === 1 ||
        current.sync_state === "failed" ||
        current.sync_state === "conflicted"
      ) {
        throw new LocalMutationError(
          "This category cannot be edited until its synchronization state is resolved.",
          "mutation_blocked",
        );
      }
      const next: CategoryUpdate = {
        ...(update.name !== undefined ? { name: update.name } : {}),
        ...(update.color !== undefined ? { color: update.color } : {}),
        ...(update.iconEmoji !== undefined ? { iconEmoji: update.iconEmoji } : {}),
        ...(update.archived !== undefined ? { archived: update.archived } : {}),
      };
      if (next.name) await ctx.store.assertUniqueName("category", next.name, id);
      const outbox = await ctx.store.currentOutbox("category", id);
      if (outbox?.operation_type === "delete") {
        throw new LocalMutationError(
          "This category is already waiting to be archived.",
          "mutation_blocked",
        );
      }
      if (outbox && (outbox.state !== "pending" || outbox.attempt_count > 0)) {
        throw new LocalMutationError(
          "Wait for the current synchronization attempt before editing this category.",
          "mutation_blocked",
        );
      }
      const merged: CategoryInput = {
        name: next.name ?? current.name,
        kind: current.kind,
        color: next.color ?? current.color,
        iconEmoji: next.iconEmoji !== undefined ? next.iconEmoji : current.icon_emoji,
      };
      if (outbox) {
        await ctx.database.runAsync(
          `UPDATE sync_outbox SET payload_json = ?, state = 'pending', attempt_count = 0,
            next_attempt_at = NULL, last_error_code = NULL WHERE operation_id = ?`,
          JSON.stringify(
            outbox.operation_type === "create"
              ? merged
              : {
                  name: merged.name,
                  color: merged.color,
                  iconEmoji: merged.iconEmoji ?? null,
                  archived: next.archived ?? current.archived === 1,
                },
          ),
          outbox.operation_id,
        );
      } else {
        await ctx.database.runAsync(
          `INSERT INTO sync_outbox (
            operation_id, idempotency_key, entity_type, entity_id, operation_type,
            base_revision, payload_json, dependency_ids_json, base_json, created_sequence
          ) VALUES (?, ?, 'category', ?, 'update', ?, ?, '[]', ?, ?)`,
          uuidSchema.parse(ctx.randomUuid()),
          uuidSchema.parse(ctx.randomUuid()),
          id,
          current.server_revision,
          JSON.stringify({
            name: merged.name,
            color: merged.color,
            iconEmoji: merged.iconEmoji ?? null,
            archived: next.archived ?? current.archived === 1,
          }),
          JSON.stringify(categorySnapshot(current)),
          await ctx.store.nextSequence(),
        );
      }
      await ctx.database.runAsync(
        `UPDATE categories SET name = ?, color = ?, icon_emoji = ?, archived = ?, sync_state = 'pending'
         WHERE id = ?`,
        merged.name,
        merged.color,
        merged.iconEmoji ?? null,
        (next.archived ?? current.archived === 1) ? 1 : 0,
        id,
      );
    });
  });
}
