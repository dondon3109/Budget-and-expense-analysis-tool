// Conflicts on a debt.

import { mobileSyncDebtSnapshotSchema, type DebtStatus, type DebtType } from "@zoption/shared";

import type { LocalMutationContext } from "../context";
import {
  LocalMutationError,
  conflictRowSchema,
  uuidSchema,
  type LocalDebtConflict,
} from "../model";

export function getDebtConflict(
  ctx: LocalMutationContext,
  entityId: string,
): Promise<LocalDebtConflict | null> {
  return ctx.writer.run(async () => {
    const local = await ctx.store.currentDebtRowById(entityId);
    const row = await ctx.database.getFirstAsync(
      `SELECT conflict_id, operation_id, base_json, local_json, server_json,
        server_revision, created_at
       FROM sync_conflicts
       WHERE entity_type = 'debt' AND entity_id = ? AND resolved_at IS NULL
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
      serverValue === null ? null : mobileSyncDebtSnapshotSchema.parse(serverValue);
    return {
      id: conflict.conflict_id,
      entityId,
      local: {
        name: local.name,
        type: local.type,
        balanceMinor: local.balance_minor,
        aprBasisPoints: local.apr_basis_points,
        minimumPaymentMinor: local.minimum_payment_minor,
        balanceAsOf: local.balance_as_of,
        status: local.status,
      },
      server: serverSnapshot
        ? {
            name: serverSnapshot.name,
            type: serverSnapshot.type,
            balanceMinor: serverSnapshot.balanceMinor,
            aprBasisPoints: serverSnapshot.aprBasisPoints,
            minimumPaymentMinor: serverSnapshot.minimumPaymentMinor,
            balanceAsOf: serverSnapshot.balanceAsOf,
            status: serverSnapshot.status,
          }
        : null,
      serverRevision: conflict.server_revision,
      createdAt: conflict.created_at,
    };
  });
}

export function resolveDebtConflict(
  ctx: LocalMutationContext,
  entityId: string,
  resolution: "keep_local" | "keep_server",
): Promise<void> {
  return ctx.writer.run(async () => {
    await ctx.database.withTransactionAsync(async () => {
      const local = await ctx.store.currentDebtRowById(entityId);
      const conflict = await ctx.store.currentConflict("debt", entityId);
      const outbox = await ctx.store.currentOutbox("debt", entityId);
      if (
        !outbox ||
        outbox.operation_id !== conflict.operation_id ||
        outbox.state !== "conflicted"
      ) {
        throw new LocalMutationError(
          "The preserved debt conflict changed before it could be resolved.",
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
        serverValue === null ? null : mobileSyncDebtSnapshotSchema.parse(serverValue);

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
          await ctx.database.runAsync("DELETE FROM debts WHERE id = ?", entityId);
          return;
        }
        await upsertDebtSnapshot(ctx, serverSnapshot, "synced");
        return;
      }

      const operationType = outbox.operation_type;
      if (operationType === "delete") {
        if (!serverSnapshot) {
          await ctx.database.runAsync("DELETE FROM debts WHERE id = ?", entityId);
          return;
        }
        await ctx.database.runAsync(
          `INSERT INTO sync_outbox (
            operation_id, idempotency_key, entity_type, entity_id, operation_type,
            base_revision, payload_json, dependency_ids_json, base_json, created_sequence
          ) VALUES (?, ?, 'debt', ?, 'delete', ?, '{}', '[]', ?, ?)`,
          uuidSchema.parse(ctx.randomUuid()),
          uuidSchema.parse(ctx.randomUuid()),
          entityId,
          serverSnapshot.revision,
          JSON.stringify(serverSnapshot),
          await ctx.store.nextSequence(),
        );
        await ctx.database.runAsync(
          "UPDATE debts SET sync_state = 'pending' WHERE id = ?",
          entityId,
        );
        return;
      }

      const localInput = {
        name: local.name,
        type: local.type,
        balanceMinor: local.balance_minor,
        aprBasisPoints: local.apr_basis_points,
        minimumPaymentMinor: local.minimum_payment_minor,
        balanceAsOf: local.balance_as_of,
        status: local.status,
      };
      if (!serverSnapshot) {
        await ctx.database.runAsync(
          `UPDATE debts SET server_revision = 0, server_updated_at = NULL,
            sync_state = 'pending' WHERE id = ?`,
          entityId,
        );
        await ctx.database.runAsync(
          `INSERT INTO sync_outbox (
            operation_id, idempotency_key, entity_type, entity_id, operation_type,
            base_revision, payload_json, dependency_ids_json, base_json, created_sequence
          ) VALUES (?, ?, 'debt', ?, 'create', 0, ?, '[]', '{}', ?)`,
          uuidSchema.parse(ctx.randomUuid()),
          uuidSchema.parse(ctx.randomUuid()),
          entityId,
          JSON.stringify(localInput),
          await ctx.store.nextSequence(),
        );
        return;
      }
      await ctx.database.runAsync(
        `UPDATE debts SET server_revision = ?, server_updated_at = ?,
          sync_state = 'pending' WHERE id = ?`,
        serverSnapshot.revision,
        serverSnapshot.updatedAt,
        entityId,
      );
      await ctx.database.runAsync(
        `INSERT INTO sync_outbox (
          operation_id, idempotency_key, entity_type, entity_id, operation_type,
          base_revision, payload_json, dependency_ids_json, base_json, created_sequence
        ) VALUES (?, ?, 'debt', ?, 'update', ?, ?, '[]', ?, ?)`,
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

async function upsertDebtSnapshot(
  ctx: LocalMutationContext,
  snapshot: {
    id: string;
    name: string;
    type: DebtType;
    balanceMinor: number;
    aprBasisPoints: number;
    minimumPaymentMinor: number;
    balanceAsOf: string;
    status: DebtStatus;
    revision: number;
    updatedAt: string | null;
  },
  syncState: "synced" | "pending",
): Promise<void> {
  await ctx.database.runAsync(
    `INSERT INTO debts (
      id, name, type, balance_minor, apr_basis_points, minimum_payment_minor,
      balance_as_of, status, server_revision, server_updated_at, deleted_at, sync_state
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       type = excluded.type,
       balance_minor = excluded.balance_minor,
       apr_basis_points = excluded.apr_basis_points,
       minimum_payment_minor = excluded.minimum_payment_minor,
       balance_as_of = excluded.balance_as_of,
       status = excluded.status,
       server_revision = excluded.server_revision,
       server_updated_at = excluded.server_updated_at,
       deleted_at = NULL,
       sync_state = excluded.sync_state`,
    snapshot.id,
    snapshot.name,
    snapshot.type,
    snapshot.balanceMinor,
    snapshot.aprBasisPoints,
    snapshot.minimumPaymentMinor,
    snapshot.balanceAsOf,
    snapshot.status,
    snapshot.revision,
    snapshot.updatedAt,
    syncState,
  );
}
