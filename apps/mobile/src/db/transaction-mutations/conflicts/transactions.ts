// Conflicts on an ordinary transaction or on a transfer's two rows.

import {
  mobileSyncTransactionSnapshotSchema,
  mobileSyncTransferSnapshotSchema,
} from "@zoption/shared";

import type { LocalMutationContext } from "../context";
import {
  LocalMutationError,
  commandFromRow,
  commandFromSnapshot,
  conflictRowSchema,
  fullUpdate,
  transferCommandFromSnapshot,
  uuidSchema,
  type LocalTransactionConflict,
} from "../model";

export function getConflict(
  ctx: LocalMutationContext,
  entityId: string,
): Promise<LocalTransactionConflict | null> {
  return ctx.writer.run(async () => {
    const localRow = await ctx.store.currentTransaction(entityId);
    const pair =
      localRow.kind === "transfer" && localRow.transfer_group_id
        ? await ctx.store.currentTransfer(entityId)
        : null;
    const row = await ctx.database.getFirstAsync(
      `SELECT conflict_id, operation_id, base_json, local_json, server_json,
        server_revision, created_at
       FROM sync_conflicts
       WHERE entity_type = ? AND entity_id = ? AND resolved_at IS NULL
       ORDER BY created_at DESC
       LIMIT 1`,
      pair ? "transfer" : "transaction",
      pair?.groupId ?? entityId,
    );
    if (!row) return null;
    const conflict = conflictRowSchema.parse(row);
    let serverValue: unknown;
    try {
      serverValue = JSON.parse(conflict.server_json) as unknown;
    } catch {
      throw new LocalMutationError("The preserved conflict is invalid.", "invalid_outbox");
    }
    return {
      id: conflict.conflict_id,
      entityId,
      local: {
        input: pair?.input ?? commandFromRow(localRow),
        deleted: pair
          ? pair.from.deleted_at !== null && pair.to.deleted_at !== null
          : localRow.deleted_at !== null,
      },
      server:
        serverValue === null
          ? null
          : {
              input: pair
                ? transferCommandFromSnapshot(serverValue)
                : commandFromSnapshot(serverValue),
              deleted: false,
            },
      serverRevision: conflict.server_revision,
      createdAt: conflict.created_at,
    };
  });
}

export function resolveConflict(
  ctx: LocalMutationContext,
  entityId: string,
  resolution: "keep_local" | "keep_server",
): Promise<void> {
  return ctx.writer.run(async () => {
    await ctx.database.withTransactionAsync(async () => {
      const selected = await ctx.store.currentTransaction(entityId);
      if (selected.kind === "transfer" && selected.transfer_group_id) {
        const pair = await ctx.store.currentTransfer(entityId);
        const conflict = await ctx.store.currentConflict("transfer", pair.groupId);
        const outbox = await ctx.store.currentOutbox("transfer", pair.groupId);
        if (
          !outbox ||
          outbox.operation_id !== conflict.operation_id ||
          outbox.state !== "conflicted"
        ) {
          throw new LocalMutationError(
            "The preserved transfer conflict changed before it could be resolved.",
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
          serverValue === null ? null : mobileSyncTransferSnapshotSchema.parse(serverValue);
        await ctx.database.runAsync(
          `UPDATE sync_conflicts
           SET resolved_at = ?, resolution = ?, operation_id = NULL
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
            await ctx.database.runAsync(
              "DELETE FROM transactions WHERE transfer_group_id = ?",
              pair.groupId,
            );
            return;
          }
          await ctx.store.replaceTransferRows(
            pair.groupId,
            serverSnapshot.fromTransactionId,
            serverSnapshot.toTransactionId,
            transferCommandFromSnapshot(serverSnapshot),
            serverSnapshot.revision,
            serverSnapshot.updatedAt,
            "synced",
          );
          return;
        }

        const locallyDeleted = pair.from.deleted_at !== null && pair.to.deleted_at !== null;
        if (locallyDeleted && !serverSnapshot) {
          await ctx.database.runAsync(
            "DELETE FROM transactions WHERE transfer_group_id = ?",
            pair.groupId,
          );
          return;
        }
        const operationType = locallyDeleted ? "delete" : serverSnapshot ? "update" : "create";
        if (serverSnapshot && !locallyDeleted) {
          await ctx.store.replaceTransferRows(
            pair.groupId,
            serverSnapshot.fromTransactionId,
            serverSnapshot.toTransactionId,
            pair.input,
            serverSnapshot.revision,
            serverSnapshot.updatedAt,
            "pending",
          );
        } else {
          await ctx.database.runAsync(
            `UPDATE transactions SET server_revision = ?, server_updated_at = ?,
              sync_state = 'pending' WHERE transfer_group_id = ?`,
            serverSnapshot?.revision ?? 0,
            serverSnapshot?.updatedAt ?? null,
            pair.groupId,
          );
        }
        const payload =
          operationType === "delete"
            ? {}
            : operationType === "update"
              ? { transfer: pair.input }
              : {
                  fromTransactionId: pair.from.id,
                  toTransactionId: pair.to.id,
                  transfer: pair.input,
                };
        await ctx.database.runAsync(
          `INSERT INTO sync_outbox (
            operation_id, idempotency_key, entity_type, entity_id, operation_type,
            base_revision, payload_json, dependency_ids_json, base_json, created_sequence
          ) VALUES (?, ?, 'transfer', ?, ?, ?, ?, '[]', ?, ?)`,
          uuidSchema.parse(ctx.randomUuid()),
          uuidSchema.parse(ctx.randomUuid()),
          pair.groupId,
          operationType,
          serverSnapshot?.revision ?? 0,
          JSON.stringify(payload),
          serverSnapshot ? JSON.stringify(serverSnapshot) : "{}",
          await ctx.store.nextSequence(),
        );
        return;
      }
      const conflict = await ctx.store.currentConflict("transaction", entityId);
      const current = selected;
      const outbox = await ctx.store.currentOutbox("transaction", entityId);
      if (
        !outbox ||
        outbox.operation_id !== conflict.operation_id ||
        outbox.state !== "conflicted"
      ) {
        throw new LocalMutationError(
          "The preserved conflict changed before it could be resolved.",
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
        serverValue === null ? null : mobileSyncTransactionSnapshotSchema.parse(serverValue);

      await ctx.database.runAsync(
        `UPDATE sync_conflicts
         SET resolved_at = ?, resolution = ?, operation_id = NULL
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
          await ctx.database.runAsync("DELETE FROM transactions WHERE id = ?", entityId);
          return;
        }
        await ctx.database.runAsync(
          `UPDATE transactions SET
            account_id = ?, category_id = ?, date = ?, description = ?, amount_minor = ?,
            currency = ?, kind = ?, notes = ?, transfer_group_id = ?,
            transfer_fee_minor = ?, import_fingerprint = ?, debt_id = ?, server_revision = ?,
            server_updated_at = ?, deleted_at = NULL, sync_state = 'synced'
           WHERE id = ?`,
          serverSnapshot.accountId,
          serverSnapshot.categoryId,
          serverSnapshot.date,
          serverSnapshot.description,
          serverSnapshot.amountMinor,
          serverSnapshot.currency,
          serverSnapshot.kind,
          serverSnapshot.notes,
          serverSnapshot.transferGroupId,
          serverSnapshot.transferFeeMinor,
          serverSnapshot.importFingerprint,
          serverSnapshot.debtId ?? null,
          serverSnapshot.revision,
          serverSnapshot.updatedAt,
          entityId,
        );
        return;
      }

      if (current.deleted_at && !serverSnapshot) {
        await ctx.database.runAsync("DELETE FROM transactions WHERE id = ?", entityId);
        return;
      }

      const operationId = uuidSchema.parse(ctx.randomUuid());
      const idempotencyKey = uuidSchema.parse(ctx.randomUuid());
      const operationType = current.deleted_at ? "delete" : serverSnapshot ? "update" : "create";
      const localInput = commandFromRow(current);
      const payload =
        operationType === "delete"
          ? {}
          : operationType === "update"
            ? fullUpdate(localInput)
            : localInput;
      await ctx.database.runAsync(
        `INSERT INTO sync_outbox (
          operation_id, idempotency_key, entity_type, entity_id, operation_type,
          base_revision, payload_json, dependency_ids_json, base_json, created_sequence
        ) VALUES (?, ?, 'transaction', ?, ?, ?, ?, '[]', ?, ?)`,
        operationId,
        idempotencyKey,
        entityId,
        operationType,
        serverSnapshot?.revision ?? 0,
        JSON.stringify(payload),
        serverSnapshot ? JSON.stringify(serverSnapshot) : "{}",
        await ctx.store.nextSequence(),
      );
      await ctx.database.runAsync(
        "UPDATE transactions SET sync_state = 'pending' WHERE id = ?",
        entityId,
      );
    });
  });
}
