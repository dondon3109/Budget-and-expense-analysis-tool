import {
  categoryInputSchema,
  categoryUpdateSchema,
  type CategoryInput,
  type CategoryUpdate,
} from "@zoption/shared";

import type { LocalCommandContext } from "../context";
import { LocalMutationError, categorySnapshot, uuidSchema } from "../model";
import {
  assertNotQueuedForRemoval,
  assertNoAttemptInFlight,
  queueCreate,
  queueUpdate,
} from "./outbox-writes";

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
      await queueCreate(ctx, "category", entityId, input);
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
      assertNotQueuedForRemoval(outbox, "category", "archived");
      assertNoAttemptInFlight(outbox, "category", "editing");
      const merged: CategoryInput = {
        name: next.name ?? current.name,
        kind: current.kind,
        color: next.color ?? current.color,
        iconEmoji: next.iconEmoji !== undefined ? next.iconEmoji : current.icon_emoji,
      };
      const changes = {
        name: merged.name,
        color: merged.color,
        iconEmoji: merged.iconEmoji ?? null,
        archived: next.archived ?? current.archived === 1,
      };
      // An unsynced create still carries the full input; a queued update carries only changes.
      await queueUpdate(ctx, outbox, {
        entityType: "category",
        entityId: id,
        baseRevision: current.server_revision,
        payload: outbox?.operation_type === "create" ? merged : changes,
        base: () => categorySnapshot(current),
      });
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
