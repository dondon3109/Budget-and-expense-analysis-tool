// Conflicts on a monthly budget limit.

import { mobileSyncBudgetSnapshotSchema } from "@zoption/shared";

import type { LocalMutationContext } from "../context";
import {
  LocalMutationError,
  conflictRowSchema,
  uuidSchema,
  type LocalBudgetConflict,
} from "../model";

export function getBudgetConflict(
  ctx: LocalMutationContext,
  entityId: string,
): Promise<LocalBudgetConflict | null> {
  return ctx.writer.run(async () => {
    const local = await ctx.store.currentBudgetById(entityId);
    const row = await ctx.database.getFirstAsync(
      `SELECT conflict_id, operation_id, base_json, local_json, server_json,
        server_revision, created_at
       FROM sync_conflicts
       WHERE entity_type = 'budget' AND entity_id = ? AND resolved_at IS NULL
       ORDER BY created_at DESC
       LIMIT 1`,
      entityId,
    );
    if (!row) return null;
    const conflict = conflictRowSchema.parse(row);
    let serverValue: unknown;
    try {
      serverValue = JSON.parse(conflict.server_json) as unknown;
    } catch {
      throw new LocalMutationError("The preserved conflict is invalid.", "invalid_outbox");
    }
    const category = await ctx.store.currentCategory(local.category_id);
    const serverSnapshot =
      serverValue === null ? null : mobileSyncBudgetSnapshotSchema.parse(serverValue);
    const serverCategory = serverSnapshot
      ? await ctx.store.currentCategory(serverSnapshot.categoryId)
      : null;
    return {
      id: conflict.conflict_id,
      entityId,
      local: {
        month: local.month,
        categoryId: local.category_id,
        categoryName: category.name,
        categoryColor: category.color,
        limitMinor: local.limit_minor,
      },
      server: serverSnapshot
        ? {
            month: serverSnapshot.month,
            categoryId: serverSnapshot.categoryId,
            categoryName: serverCategory?.name ?? serverSnapshot.categoryId,
            categoryColor: serverCategory?.color ?? "#888888",
            limitMinor: serverSnapshot.limitMinor,
          }
        : null,
      serverRevision: conflict.server_revision,
      createdAt: conflict.created_at,
    };
  });
}

export function resolveBudgetConflict(
  ctx: LocalMutationContext,
  entityId: string,
  resolution: "keep_local" | "keep_server",
): Promise<void> {
  return ctx.writer.run(async () => {
    await ctx.database.withTransactionAsync(async () => {
      const local = await ctx.store.currentBudgetById(entityId);
      const conflict = await ctx.store.currentConflict("budget", entityId);
      const outbox = await ctx.store.currentOutbox("budget", entityId);
      if (
        !outbox ||
        outbox.operation_id !== conflict.operation_id ||
        outbox.state !== "conflicted"
      ) {
        throw new LocalMutationError(
          "The preserved budget conflict changed before it could be resolved.",
          "mutation_blocked",
        );
      }
      let serverValue: unknown;
      try {
        serverValue = JSON.parse(conflict.server_json) as unknown;
      } catch {
        throw new LocalMutationError("The preserved conflict is invalid.", "invalid_outbox");
      }
      const serverSnapshot =
        serverValue === null ? null : mobileSyncBudgetSnapshotSchema.parse(serverValue);

      await ctx.database.runAsync(
        `UPDATE sync_conflicts SET resolved_at = ?, resolution = ?, operation_id = NULL
         WHERE conflict_id = ? AND resolved_at IS NULL`,
        ctx.now().toISOString(),
        resolution,
        conflict.conflict_id,
      );
      await ctx.database.runAsync(
        "DELETE FROM sync_outbox WHERE operation_id = ?",
        outbox.operation_id,
      );

      if (resolution === "keep_server") {
        if (!serverSnapshot) {
          await ctx.database.runAsync("DELETE FROM budgets WHERE id = ?", entityId);
          return;
        }
        if (serverSnapshot.id !== entityId) {
          await ctx.database.runAsync("DELETE FROM budgets WHERE id = ?", entityId);
        }
        await upsertBudgetSnapshot(ctx, serverSnapshot, "synced");
        return;
      }

      const localLimit = local.limit_minor;
      if (!serverSnapshot) {
        await ctx.database.runAsync(
          "UPDATE budgets SET sync_state = 'pending' WHERE id = ?",
          entityId,
        );
        await ctx.database.runAsync(
          `INSERT INTO sync_outbox (
            operation_id, idempotency_key, entity_type, entity_id, operation_type,
            base_revision, payload_json, dependency_ids_json, base_json, created_sequence
          ) VALUES (?, ?, 'budget', ?, 'create', 0, ?, '[]', '{}', ?)`,
          uuidSchema.parse(ctx.randomUuid()),
          uuidSchema.parse(ctx.randomUuid()),
          entityId,
          JSON.stringify({
            categoryId: local.category_id,
            month: local.month,
            limitMinor: localLimit,
          }),
          await ctx.store.nextSequence(),
        );
        return;
      }

      const targetId = serverSnapshot.id;
      if (targetId !== entityId) {
        await ctx.database.runAsync("DELETE FROM budgets WHERE id = ?", entityId);
        await ctx.database.runAsync(
          `INSERT INTO budgets (
            id, category_id, month, limit_minor, server_revision, server_updated_at,
            deleted_at, sync_state
          ) VALUES (?, ?, ?, ?, ?, ?, NULL, 'pending')`,
          targetId,
          serverSnapshot.categoryId,
          serverSnapshot.month,
          localLimit,
          serverSnapshot.revision,
          serverSnapshot.updatedAt,
        );
      } else {
        await ctx.database.runAsync(
          `UPDATE budgets SET limit_minor = ?, server_revision = ?, server_updated_at = ?,
            sync_state = 'pending' WHERE id = ?`,
          localLimit,
          serverSnapshot.revision,
          serverSnapshot.updatedAt,
          entityId,
        );
      }
      await ctx.database.runAsync(
        `INSERT INTO sync_outbox (
          operation_id, idempotency_key, entity_type, entity_id, operation_type,
          base_revision, payload_json, dependency_ids_json, base_json, created_sequence
        ) VALUES (?, ?, 'budget', ?, 'update', ?, ?, '[]', ?, ?)`,
        uuidSchema.parse(ctx.randomUuid()),
        uuidSchema.parse(ctx.randomUuid()),
        targetId,
        serverSnapshot.revision,
        JSON.stringify({ limitMinor: localLimit }),
        JSON.stringify(serverSnapshot),
        await ctx.store.nextSequence(),
      );
    });
  });
}

async function upsertBudgetSnapshot(
  ctx: LocalMutationContext,
  snapshot: {
    id: string;
    categoryId: string;
    month: string;
    limitMinor: number;
    revision: number;
    updatedAt: string | null;
  },
  syncState: "synced" | "pending",
): Promise<void> {
  await ctx.database.runAsync(
    `INSERT INTO budgets (
      id, category_id, month, limit_minor, server_revision, server_updated_at, deleted_at, sync_state
    ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?)
     ON CONFLICT(id) DO UPDATE SET
       category_id = excluded.category_id,
       month = excluded.month,
       limit_minor = excluded.limit_minor,
       server_revision = excluded.server_revision,
       server_updated_at = excluded.server_updated_at,
       deleted_at = NULL,
       sync_state = excluded.sync_state`,
    snapshot.id,
    snapshot.categoryId,
    snapshot.month,
    snapshot.limitMinor,
    snapshot.revision,
    snapshot.updatedAt,
    syncState,
  );
}
