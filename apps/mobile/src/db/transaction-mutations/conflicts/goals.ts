// Conflicts on a savings goal.

import { mobileSyncGoalSnapshotSchema, type FinancialGoalStatus } from "@zoption/shared";

import type { LocalMutationContext } from "../context";
import {
  LocalMutationError,
  conflictRowSchema,
  uuidSchema,
  type LocalGoalConflict,
} from "../model";

export function getGoalConflict(
  ctx: LocalMutationContext,
  entityId: string,
): Promise<LocalGoalConflict | null> {
  return ctx.writer.run(async () => {
    const local = await ctx.store.currentGoalRowById(entityId);
    const row = await ctx.database.getFirstAsync(
      `SELECT conflict_id, operation_id, base_json, local_json, server_json,
        server_revision, created_at
       FROM sync_conflicts
       WHERE entity_type = 'goal' AND entity_id = ? AND resolved_at IS NULL
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
    const serverSnapshot =
      serverValue === null ? null : mobileSyncGoalSnapshotSchema.parse(serverValue);
    return {
      id: conflict.conflict_id,
      entityId,
      local: {
        name: local.name,
        targetAmountMinor: local.target_amount_minor,
        currentAmountMinor: local.current_amount_minor,
        targetDate: local.target_date,
        status: local.status,
      },
      server: serverSnapshot
        ? {
            name: serverSnapshot.name,
            targetAmountMinor: serverSnapshot.targetAmountMinor,
            currentAmountMinor: serverSnapshot.currentAmountMinor,
            targetDate: serverSnapshot.targetDate,
            status: serverSnapshot.status,
          }
        : null,
      serverRevision: conflict.server_revision,
      createdAt: conflict.created_at,
    };
  });
}

export function resolveGoalConflict(
  ctx: LocalMutationContext,
  entityId: string,
  resolution: "keep_local" | "keep_server",
): Promise<void> {
  return ctx.writer.run(async () => {
    await ctx.database.withTransactionAsync(async () => {
      const local = await ctx.store.currentGoalRowById(entityId);
      const conflict = await ctx.store.currentConflict("goal", entityId);
      const outbox = await ctx.store.currentOutbox("goal", entityId);
      if (
        !outbox ||
        outbox.operation_id !== conflict.operation_id ||
        outbox.state !== "conflicted"
      ) {
        throw new LocalMutationError(
          "The preserved goal conflict changed before it could be resolved.",
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
        serverValue === null ? null : mobileSyncGoalSnapshotSchema.parse(serverValue);

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
          await ctx.database.runAsync("DELETE FROM financial_goals WHERE id = ?", entityId);
          return;
        }
        await upsertGoalSnapshot(ctx, serverSnapshot, "synced");
        return;
      }

      const operationType = outbox.operation_type;
      if (operationType === "delete") {
        if (!serverSnapshot) {
          await ctx.database.runAsync("DELETE FROM financial_goals WHERE id = ?", entityId);
          return;
        }
        await ctx.database.runAsync(
          `INSERT INTO sync_outbox (
            operation_id, idempotency_key, entity_type, entity_id, operation_type,
            base_revision, payload_json, dependency_ids_json, base_json, created_sequence
          ) VALUES (?, ?, 'goal', ?, 'delete', ?, '{}', '[]', ?, ?)`,
          uuidSchema.parse(ctx.randomUuid()),
          uuidSchema.parse(ctx.randomUuid()),
          entityId,
          serverSnapshot.revision,
          JSON.stringify(serverSnapshot),
          await ctx.store.nextSequence(),
        );
        await ctx.database.runAsync(
          "UPDATE financial_goals SET sync_state = 'pending' WHERE id = ?",
          entityId,
        );
        return;
      }

      const localInput = {
        name: local.name,
        targetAmountMinor: local.target_amount_minor,
        currentAmountMinor: local.current_amount_minor,
        targetDate: local.target_date,
        status: local.status,
      };
      if (!serverSnapshot) {
        await ctx.database.runAsync(
          `UPDATE financial_goals SET server_revision = 0, server_updated_at = NULL,
            sync_state = 'pending' WHERE id = ?`,
          entityId,
        );
        await ctx.database.runAsync(
          `INSERT INTO sync_outbox (
            operation_id, idempotency_key, entity_type, entity_id, operation_type,
            base_revision, payload_json, dependency_ids_json, base_json, created_sequence
          ) VALUES (?, ?, 'goal', ?, 'create', 0, ?, '[]', '{}', ?)`,
          uuidSchema.parse(ctx.randomUuid()),
          uuidSchema.parse(ctx.randomUuid()),
          entityId,
          JSON.stringify(localInput),
          await ctx.store.nextSequence(),
        );
        return;
      }
      await ctx.database.runAsync(
        `UPDATE financial_goals SET server_revision = ?, server_updated_at = ?,
          sync_state = 'pending' WHERE id = ?`,
        serverSnapshot.revision,
        serverSnapshot.updatedAt,
        entityId,
      );
      await ctx.database.runAsync(
        `INSERT INTO sync_outbox (
          operation_id, idempotency_key, entity_type, entity_id, operation_type,
          base_revision, payload_json, dependency_ids_json, base_json, created_sequence
        ) VALUES (?, ?, 'goal', ?, 'update', ?, ?, '[]', ?, ?)`,
        uuidSchema.parse(ctx.randomUuid()),
        uuidSchema.parse(ctx.randomUuid()),
        entityId,
        serverSnapshot.revision,
        JSON.stringify(localInput),
        JSON.stringify(serverSnapshot),
        await ctx.store.nextSequence(),
      );
    });
  });
}

async function upsertGoalSnapshot(
  ctx: LocalMutationContext,
  snapshot: {
    id: string;
    name: string;
    targetAmountMinor: number;
    currentAmountMinor: number;
    targetDate: string;
    status: FinancialGoalStatus;
    revision: number;
    updatedAt: string | null;
  },
  syncState: "synced" | "pending",
): Promise<void> {
  await ctx.database.runAsync(
    `INSERT INTO financial_goals (
      id, name, target_amount_minor, current_amount_minor, target_date, status,
      server_revision, server_updated_at, deleted_at, sync_state
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       target_amount_minor = excluded.target_amount_minor,
       current_amount_minor = excluded.current_amount_minor,
       target_date = excluded.target_date,
       status = excluded.status,
       server_revision = excluded.server_revision,
       server_updated_at = excluded.server_updated_at,
       deleted_at = NULL,
       sync_state = excluded.sync_state`,
    snapshot.id,
    snapshot.name,
    snapshot.targetAmountMinor,
    snapshot.currentAmountMinor,
    snapshot.targetDate,
    snapshot.status,
    snapshot.revision,
    snapshot.updatedAt,
    syncState,
  );
}
