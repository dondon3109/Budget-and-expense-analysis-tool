// Conflicts on an account or a category.

import type { z } from "zod";
import { mobileSyncAccountSnapshotSchema, mobileSyncCategorySnapshotSchema } from "@zoption/shared";

import type { LocalMutationContext } from "../context";
import {
  LocalMutationError,
  accountConflictVersion,
  categoryConflictVersion,
  conflictRowSchema,
  localInterestInput,
  syncEntityTable,
  uuidSchema,
  type LocalReferenceConflict,
  type accountRowSchema,
  type categoryRowSchema,
} from "../model";

export function getReferenceConflict(
  ctx: LocalMutationContext,
  entityType: "account" | "category",
  entityId: string,
): Promise<LocalReferenceConflict | null> {
  return ctx.writer.run(async () => {
    const row = await ctx.database.getFirstAsync(
      `SELECT conflict_id, operation_id, base_json, local_json, server_json,
        server_revision, created_at
       FROM sync_conflicts
       WHERE entity_type = ? AND entity_id = ? AND resolved_at IS NULL
       ORDER BY created_at DESC
       LIMIT 1`,
      entityType,
      entityId,
    );
    if (!row) return null;
    const conflict = conflictRowSchema.parse(row);
    const local =
      entityType === "account"
        ? accountConflictVersion(await ctx.store.currentAccount(entityId))
        : categoryConflictVersion(await ctx.store.currentCategory(entityId));
    let serverValue: unknown;
    try {
      serverValue = JSON.parse(conflict.server_json) as unknown;
    } catch {
      throw new LocalMutationError("The preserved conflict is invalid.", "invalid_outbox");
    }
    const server =
      serverValue === null
        ? null
        : entityType === "account"
          ? accountConflictVersion(mobileSyncAccountSnapshotSchema.parse(serverValue))
          : categoryConflictVersion(mobileSyncCategorySnapshotSchema.parse(serverValue));
    return {
      id: conflict.conflict_id,
      entityType,
      entityId,
      local,
      server,
      serverRevision: conflict.server_revision,
      createdAt: conflict.created_at,
    };
  });
}

export function resolveReferenceConflict(
  ctx: LocalMutationContext,
  entityType: "account" | "category",
  entityId: string,
  resolution: "keep_local" | "keep_server",
): Promise<void> {
  return ctx.writer.run(async () => {
    await ctx.database.withTransactionAsync(async () => {
      const conflict = await ctx.store.currentConflict(entityType, entityId);
      const outbox = await ctx.store.currentOutbox(entityType, entityId);
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
      const current =
        entityType === "account"
          ? await ctx.store.currentAccount(entityId)
          : await ctx.store.currentCategory(entityId);
      let serverValue: unknown;
      try {
        serverValue = JSON.parse(conflict.server_json) as unknown;
      } catch {
        throw new LocalMutationError("The preserved conflict is invalid.", "invalid_outbox");
      }
      const accountServer =
        entityType === "account" && serverValue !== null
          ? mobileSyncAccountSnapshotSchema.parse(serverValue)
          : null;
      const categoryServer =
        entityType === "category" && serverValue !== null
          ? mobileSyncCategorySnapshotSchema.parse(serverValue)
          : null;
      const serverSnapshot = accountServer ?? categoryServer;

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
            `UPDATE ${syncEntityTable(entityType)}
             SET server_revision = ?, server_updated_at = NULL, deleted_at = ?,
               sync_state = 'synced'
             WHERE id = ?`,
            conflict.server_revision,
            ctx.now().toISOString(),
            entityId,
          );
          return;
        }
        if (accountServer) {
          await ctx.database.runAsync(
            `UPDATE accounts SET name = ?, type = ?, currency = ?, archived = ?, system = ?,
              interest_json = ?, server_revision = ?, server_updated_at = ?, deleted_at = NULL,
              sync_state = 'synced' WHERE id = ?`,
            accountServer.name,
            accountServer.type,
            accountServer.currency,
            accountServer.archived ? 1 : 0,
            accountServer.system ? 1 : 0,
            JSON.stringify(accountServer.interest),
            accountServer.revision,
            accountServer.updatedAt,
            entityId,
          );
        } else if (categoryServer) {
          await ctx.database.runAsync(
            `UPDATE categories SET name = ?, kind = ?, color = ?, archived = ?, system = ?,
              origin = ?, required_plan = ?, locked = ?, server_revision = ?,
              server_updated_at = ?, deleted_at = NULL, sync_state = 'synced' WHERE id = ?`,
            categoryServer.name,
            categoryServer.kind,
            categoryServer.color,
            categoryServer.archived ? 1 : 0,
            categoryServer.system ? 1 : 0,
            categoryServer.origin,
            categoryServer.requiredPlan,
            categoryServer.locked ? 1 : 0,
            categoryServer.revision,
            categoryServer.updatedAt,
            entityId,
          );
        }
        return;
      }

      const locallyArchived = current.archived === 1;
      if (locallyArchived && !serverSnapshot) {
        await ctx.database.runAsync(
          `UPDATE ${syncEntityTable(entityType)} SET deleted_at = ?, sync_state = 'synced'
           WHERE id = ?`,
          ctx.now().toISOString(),
          entityId,
        );
        return;
      }
      const operationType = locallyArchived ? "delete" : serverSnapshot ? "update" : "create";
      const accountLocal =
        entityType === "account" ? (current as z.infer<typeof accountRowSchema>) : null;
      const accountInterest =
        accountLocal && accountServer ? localInterestInput(accountLocal.interest_json) : null;
      const interestChanged =
        accountInterest !== null &&
        accountServer !== null &&
        (accountInterest.enabled !== accountServer.interest.enabled ||
          (accountInterest.enabled &&
            (accountInterest.annualRateBasisPoints !==
              accountServer.interest.annualRateBasisPoints ||
              accountInterest.frequency !== accountServer.interest.frequency ||
              accountInterest.payDay !== accountServer.interest.payDay)));
      const payload =
        operationType === "delete"
          ? {}
          : entityType === "account"
            ? {
                name: accountLocal?.name ?? accountServer?.name ?? "",
                type: accountLocal?.type ?? accountServer?.type ?? "cash",
                ...(interestChanged ? { interest: accountInterest } : {}),
              }
            : operationType === "create"
              ? {
                  name: (current as z.infer<typeof categoryRowSchema>).name,
                  kind: (current as z.infer<typeof categoryRowSchema>).kind,
                  color: (current as z.infer<typeof categoryRowSchema>).color,
                }
              : {
                  name: (current as z.infer<typeof categoryRowSchema>).name,
                  color: (current as z.infer<typeof categoryRowSchema>).color,
                  archived: false,
                };
      await ctx.database.runAsync(
        `INSERT INTO sync_outbox (
          operation_id, idempotency_key, entity_type, entity_id, operation_type,
          base_revision, payload_json, dependency_ids_json, base_json, created_sequence
        ) VALUES (?, ?, ?, ?, ?, ?, ?, '[]', ?, ?)`,
        uuidSchema.parse(ctx.randomUuid()),
        uuidSchema.parse(ctx.randomUuid()),
        entityType,
        entityId,
        operationType,
        serverSnapshot?.revision ?? 0,
        JSON.stringify(payload),
        serverSnapshot ? JSON.stringify(serverSnapshot) : "{}",
        await ctx.store.nextSequence(),
      );
      await ctx.database.runAsync(
        `UPDATE ${syncEntityTable(entityType)} SET sync_state = 'pending' WHERE id = ?`,
        entityId,
      );
    });
  });
}
