import type { SQLiteDatabase } from "expo-sqlite";
import type { z } from "zod";

import {
  mobileSyncAccountSnapshotSchema,
  mobileSyncBudgetSnapshotSchema,
  mobileSyncCategorySnapshotSchema,
  mobileSyncDebtSnapshotSchema,
  mobileSyncEventSnapshotSchema,
  mobileSyncGoalSnapshotSchema,
  mobileSyncSubscriptionSnapshotSchema,
  mobileSyncTransactionSnapshotSchema,
  mobileSyncTransferSnapshotSchema,
  type DebtStatus,
  type DebtType,
  type FinancialGoalStatus,
  type SubscriptionBillingCycle,
  type SubscriptionStatus,
} from "@zoption/shared";

import type { LocalDatabaseWriter } from "../database-writer";
import {
  LocalMutationError,
  accountConflictVersion,
  categoryConflictVersion,
  commandFromRow,
  commandFromSnapshot,
  conflictRowSchema,
  fullUpdate,
  localInterestInput,
  syncEntityTable,
  transferCommandFromSnapshot,
  uuidSchema,
  type LocalBudgetConflict,
  type LocalDebtConflict,
  type LocalEventConflict,
  type LocalGoalConflict,
  type LocalReferenceConflict,
  type LocalSubscriptionConflict,
  type LocalTransactionConflict,
  type accountRowSchema,
  type categoryRowSchema,
} from "./model";
import type { LocalMutationStore } from "./store";

/** Conflict inspection and explicit user-directed resolution for every synchronized entity. */
export class LocalConflictRepository {
  constructor(
    private readonly database: SQLiteDatabase,
    private readonly writer: LocalDatabaseWriter,
    private readonly store: LocalMutationStore,
    private readonly randomUuid: () => string,
    private readonly now: () => Date,
  ) {}

  getConflict(entityId: string): Promise<LocalTransactionConflict | null> {
    return this.writer.run(async () => {
      const localRow = await this.store.currentTransaction(entityId);
      const pair =
        localRow.kind === "transfer" && localRow.transfer_group_id
          ? await this.store.currentTransfer(entityId)
          : null;
      const row = await this.database.getFirstAsync(
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

  getReferenceConflict(
    entityType: "account" | "category",
    entityId: string,
  ): Promise<LocalReferenceConflict | null> {
    return this.writer.run(async () => {
      const row = await this.database.getFirstAsync(
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
          ? accountConflictVersion(await this.store.currentAccount(entityId))
          : categoryConflictVersion(await this.store.currentCategory(entityId));
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

  resolveReferenceConflict(
    entityType: "account" | "category",
    entityId: string,
    resolution: "keep_local" | "keep_server",
  ): Promise<void> {
    return this.writer.run(async () => {
      await this.database.withTransactionAsync(async () => {
        const conflict = await this.store.currentConflict(entityType, entityId);
        const outbox = await this.store.currentOutbox(entityType, entityId);
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
            ? await this.store.currentAccount(entityId)
            : await this.store.currentCategory(entityId);
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

        await this.database.runAsync(
          `UPDATE sync_conflicts
           SET resolved_at = ?, resolution = ?, operation_id = NULL
           WHERE conflict_id = ? AND resolved_at IS NULL`,
          this.now().toISOString(),
          resolution,
          conflict.conflict_id,
        );
        await this.database.runAsync(
          "DELETE FROM sync_outbox WHERE operation_id = ?",
          outbox.operation_id,
        );

        if (resolution === "keep_server") {
          if (!serverSnapshot) {
            await this.database.runAsync(
              `UPDATE ${syncEntityTable(entityType)}
               SET server_revision = ?, server_updated_at = NULL, deleted_at = ?,
                 sync_state = 'synced'
               WHERE id = ?`,
              conflict.server_revision,
              this.now().toISOString(),
              entityId,
            );
            return;
          }
          if (accountServer) {
            await this.database.runAsync(
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
            await this.database.runAsync(
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
          await this.database.runAsync(
            `UPDATE ${syncEntityTable(entityType)} SET deleted_at = ?, sync_state = 'synced'
             WHERE id = ?`,
            this.now().toISOString(),
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
        await this.database.runAsync(
          `INSERT INTO sync_outbox (
            operation_id, idempotency_key, entity_type, entity_id, operation_type,
            base_revision, payload_json, dependency_ids_json, base_json, created_sequence
          ) VALUES (?, ?, ?, ?, ?, ?, ?, '[]', ?, ?)`,
          uuidSchema.parse(this.randomUuid()),
          uuidSchema.parse(this.randomUuid()),
          entityType,
          entityId,
          operationType,
          serverSnapshot?.revision ?? 0,
          JSON.stringify(payload),
          serverSnapshot ? JSON.stringify(serverSnapshot) : "{}",
          await this.store.nextSequence(),
        );
        await this.database.runAsync(
          `UPDATE ${syncEntityTable(entityType)} SET sync_state = 'pending' WHERE id = ?`,
          entityId,
        );
      });
    });
  }

  resolveConflict(entityId: string, resolution: "keep_local" | "keep_server"): Promise<void> {
    return this.writer.run(async () => {
      await this.database.withTransactionAsync(async () => {
        const selected = await this.store.currentTransaction(entityId);
        if (selected.kind === "transfer" && selected.transfer_group_id) {
          const pair = await this.store.currentTransfer(entityId);
          const conflict = await this.store.currentConflict("transfer", pair.groupId);
          const outbox = await this.store.currentOutbox("transfer", pair.groupId);
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
          await this.database.runAsync(
            `UPDATE sync_conflicts
             SET resolved_at = ?, resolution = ?, operation_id = NULL
             WHERE conflict_id = ? AND resolved_at IS NULL`,
            this.now().toISOString(),
            resolution,
            conflict.conflict_id,
          );
          await this.database.runAsync(
            "DELETE FROM sync_outbox WHERE operation_id = ?",
            outbox.operation_id,
          );

          if (resolution === "keep_server") {
            if (!serverSnapshot) {
              await this.database.runAsync(
                "DELETE FROM transactions WHERE transfer_group_id = ?",
                pair.groupId,
              );
              return;
            }
            await this.store.replaceTransferRows(
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
            await this.database.runAsync(
              "DELETE FROM transactions WHERE transfer_group_id = ?",
              pair.groupId,
            );
            return;
          }
          const operationType = locallyDeleted ? "delete" : serverSnapshot ? "update" : "create";
          if (serverSnapshot && !locallyDeleted) {
            await this.store.replaceTransferRows(
              pair.groupId,
              serverSnapshot.fromTransactionId,
              serverSnapshot.toTransactionId,
              pair.input,
              serverSnapshot.revision,
              serverSnapshot.updatedAt,
              "pending",
            );
          } else {
            await this.database.runAsync(
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
          await this.database.runAsync(
            `INSERT INTO sync_outbox (
              operation_id, idempotency_key, entity_type, entity_id, operation_type,
              base_revision, payload_json, dependency_ids_json, base_json, created_sequence
            ) VALUES (?, ?, 'transfer', ?, ?, ?, ?, '[]', ?, ?)`,
            uuidSchema.parse(this.randomUuid()),
            uuidSchema.parse(this.randomUuid()),
            pair.groupId,
            operationType,
            serverSnapshot?.revision ?? 0,
            JSON.stringify(payload),
            serverSnapshot ? JSON.stringify(serverSnapshot) : "{}",
            await this.store.nextSequence(),
          );
          return;
        }
        const conflict = await this.store.currentConflict("transaction", entityId);
        const current = selected;
        const outbox = await this.store.currentOutbox("transaction", entityId);
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

        await this.database.runAsync(
          `UPDATE sync_conflicts
           SET resolved_at = ?, resolution = ?, operation_id = NULL
           WHERE conflict_id = ? AND resolved_at IS NULL`,
          this.now().toISOString(),
          resolution,
          conflict.conflict_id,
        );
        await this.database.runAsync(
          "DELETE FROM sync_outbox WHERE operation_id = ?",
          outbox.operation_id,
        );

        if (resolution === "keep_server") {
          if (!serverSnapshot) {
            await this.database.runAsync("DELETE FROM transactions WHERE id = ?", entityId);
            return;
          }
          await this.database.runAsync(
            `UPDATE transactions SET
              account_id = ?, category_id = ?, date = ?, description = ?, amount_minor = ?,
              currency = ?, kind = ?, notes = ?, transfer_group_id = ?,
              transfer_fee_minor = ?, import_fingerprint = ?, server_revision = ?,
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
            serverSnapshot.revision,
            serverSnapshot.updatedAt,
            entityId,
          );
          return;
        }

        if (current.deleted_at && !serverSnapshot) {
          await this.database.runAsync("DELETE FROM transactions WHERE id = ?", entityId);
          return;
        }

        const operationId = uuidSchema.parse(this.randomUuid());
        const idempotencyKey = uuidSchema.parse(this.randomUuid());
        const operationType = current.deleted_at ? "delete" : serverSnapshot ? "update" : "create";
        const localInput = commandFromRow(current);
        const payload =
          operationType === "delete"
            ? {}
            : operationType === "update"
              ? fullUpdate(localInput)
              : localInput;
        await this.database.runAsync(
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
          await this.store.nextSequence(),
        );
        await this.database.runAsync(
          "UPDATE transactions SET sync_state = 'pending' WHERE id = ?",
          entityId,
        );
      });
    });
  }

  getBudgetConflict(entityId: string): Promise<LocalBudgetConflict | null> {
    return this.writer.run(async () => {
      const local = await this.store.currentBudgetById(entityId);
      const row = await this.database.getFirstAsync(
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
      const category = await this.store.currentCategory(local.category_id);
      const serverSnapshot =
        serverValue === null ? null : mobileSyncBudgetSnapshotSchema.parse(serverValue);
      const serverCategory = serverSnapshot
        ? await this.store.currentCategory(serverSnapshot.categoryId)
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

  resolveBudgetConflict(entityId: string, resolution: "keep_local" | "keep_server"): Promise<void> {
    return this.writer.run(async () => {
      await this.database.withTransactionAsync(async () => {
        const local = await this.store.currentBudgetById(entityId);
        const conflict = await this.store.currentConflict("budget", entityId);
        const outbox = await this.store.currentOutbox("budget", entityId);
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

        await this.database.runAsync(
          `UPDATE sync_conflicts SET resolved_at = ?, resolution = ?, operation_id = NULL
           WHERE conflict_id = ? AND resolved_at IS NULL`,
          this.now().toISOString(),
          resolution,
          conflict.conflict_id,
        );
        await this.database.runAsync(
          "DELETE FROM sync_outbox WHERE operation_id = ?",
          outbox.operation_id,
        );

        if (resolution === "keep_server") {
          if (!serverSnapshot) {
            await this.database.runAsync("DELETE FROM budgets WHERE id = ?", entityId);
            return;
          }
          if (serverSnapshot.id !== entityId) {
            await this.database.runAsync("DELETE FROM budgets WHERE id = ?", entityId);
          }
          await this.upsertBudgetSnapshot(serverSnapshot, "synced");
          return;
        }

        const localLimit = local.limit_minor;
        if (!serverSnapshot) {
          await this.database.runAsync(
            "UPDATE budgets SET sync_state = 'pending' WHERE id = ?",
            entityId,
          );
          await this.database.runAsync(
            `INSERT INTO sync_outbox (
              operation_id, idempotency_key, entity_type, entity_id, operation_type,
              base_revision, payload_json, dependency_ids_json, base_json, created_sequence
            ) VALUES (?, ?, 'budget', ?, 'create', 0, ?, '[]', '{}', ?)`,
            uuidSchema.parse(this.randomUuid()),
            uuidSchema.parse(this.randomUuid()),
            entityId,
            JSON.stringify({
              categoryId: local.category_id,
              month: local.month,
              limitMinor: localLimit,
            }),
            await this.store.nextSequence(),
          );
          return;
        }

        const targetId = serverSnapshot.id;
        if (targetId !== entityId) {
          await this.database.runAsync("DELETE FROM budgets WHERE id = ?", entityId);
          await this.database.runAsync(
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
          await this.database.runAsync(
            `UPDATE budgets SET limit_minor = ?, server_revision = ?, server_updated_at = ?,
              sync_state = 'pending' WHERE id = ?`,
            localLimit,
            serverSnapshot.revision,
            serverSnapshot.updatedAt,
            entityId,
          );
        }
        await this.database.runAsync(
          `INSERT INTO sync_outbox (
            operation_id, idempotency_key, entity_type, entity_id, operation_type,
            base_revision, payload_json, dependency_ids_json, base_json, created_sequence
          ) VALUES (?, ?, 'budget', ?, 'update', ?, ?, '[]', ?, ?)`,
          uuidSchema.parse(this.randomUuid()),
          uuidSchema.parse(this.randomUuid()),
          targetId,
          serverSnapshot.revision,
          JSON.stringify({ limitMinor: localLimit }),
          JSON.stringify(serverSnapshot),
          await this.store.nextSequence(),
        );
      });
    });
  }

  private async upsertBudgetSnapshot(
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
    await this.database.runAsync(
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

  getGoalConflict(entityId: string): Promise<LocalGoalConflict | null> {
    return this.writer.run(async () => {
      const local = await this.store.currentGoalRowById(entityId);
      const row = await this.database.getFirstAsync(
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

  resolveGoalConflict(entityId: string, resolution: "keep_local" | "keep_server"): Promise<void> {
    return this.writer.run(async () => {
      await this.database.withTransactionAsync(async () => {
        const local = await this.store.currentGoalRowById(entityId);
        const conflict = await this.store.currentConflict("goal", entityId);
        const outbox = await this.store.currentOutbox("goal", entityId);
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

        await this.database.runAsync(
          `UPDATE sync_conflicts SET resolved_at = ?, resolution = ?, operation_id = NULL
           WHERE conflict_id = ? AND resolved_at IS NULL`,
          this.now().toISOString(),
          resolution,
          conflict.conflict_id,
        );
        await this.database.runAsync(
          "DELETE FROM sync_outbox WHERE operation_id = ?",
          outbox.operation_id,
        );

        if (resolution === "keep_server") {
          if (!serverSnapshot) {
            await this.database.runAsync("DELETE FROM financial_goals WHERE id = ?", entityId);
            return;
          }
          await this.upsertGoalSnapshot(serverSnapshot, "synced");
          return;
        }

        const operationType = outbox.operation_type;
        if (operationType === "delete") {
          if (!serverSnapshot) {
            await this.database.runAsync("DELETE FROM financial_goals WHERE id = ?", entityId);
            return;
          }
          await this.database.runAsync(
            `INSERT INTO sync_outbox (
              operation_id, idempotency_key, entity_type, entity_id, operation_type,
              base_revision, payload_json, dependency_ids_json, base_json, created_sequence
            ) VALUES (?, ?, 'goal', ?, 'delete', ?, '{}', '[]', ?, ?)`,
            uuidSchema.parse(this.randomUuid()),
            uuidSchema.parse(this.randomUuid()),
            entityId,
            serverSnapshot.revision,
            JSON.stringify(serverSnapshot),
            await this.store.nextSequence(),
          );
          await this.database.runAsync(
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
          await this.database.runAsync(
            `UPDATE financial_goals SET server_revision = 0, server_updated_at = NULL,
              sync_state = 'pending' WHERE id = ?`,
            entityId,
          );
          await this.database.runAsync(
            `INSERT INTO sync_outbox (
              operation_id, idempotency_key, entity_type, entity_id, operation_type,
              base_revision, payload_json, dependency_ids_json, base_json, created_sequence
            ) VALUES (?, ?, 'goal', ?, 'create', 0, ?, '[]', '{}', ?)`,
            uuidSchema.parse(this.randomUuid()),
            uuidSchema.parse(this.randomUuid()),
            entityId,
            JSON.stringify(localInput),
            await this.store.nextSequence(),
          );
          return;
        }
        await this.database.runAsync(
          `UPDATE financial_goals SET server_revision = ?, server_updated_at = ?,
            sync_state = 'pending' WHERE id = ?`,
          serverSnapshot.revision,
          serverSnapshot.updatedAt,
          entityId,
        );
        await this.database.runAsync(
          `INSERT INTO sync_outbox (
            operation_id, idempotency_key, entity_type, entity_id, operation_type,
            base_revision, payload_json, dependency_ids_json, base_json, created_sequence
          ) VALUES (?, ?, 'goal', ?, 'update', ?, ?, '[]', ?, ?)`,
          uuidSchema.parse(this.randomUuid()),
          uuidSchema.parse(this.randomUuid()),
          entityId,
          serverSnapshot.revision,
          JSON.stringify(localInput),
          JSON.stringify(serverSnapshot),
          await this.store.nextSequence(),
        );
      });
    });
  }

  private async upsertGoalSnapshot(
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
    await this.database.runAsync(
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

  getDebtConflict(entityId: string): Promise<LocalDebtConflict | null> {
    return this.writer.run(async () => {
      const local = await this.store.currentDebtRowById(entityId);
      const row = await this.database.getFirstAsync(
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

  resolveDebtConflict(entityId: string, resolution: "keep_local" | "keep_server"): Promise<void> {
    return this.writer.run(async () => {
      await this.database.withTransactionAsync(async () => {
        const local = await this.store.currentDebtRowById(entityId);
        const conflict = await this.store.currentConflict("debt", entityId);
        const outbox = await this.store.currentOutbox("debt", entityId);
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

        await this.database.runAsync(
          `UPDATE sync_conflicts SET resolved_at = ?, resolution = ?, operation_id = NULL
           WHERE conflict_id = ? AND resolved_at IS NULL`,
          this.now().toISOString(),
          resolution,
          conflict.conflict_id,
        );
        await this.database.runAsync(
          "DELETE FROM sync_outbox WHERE operation_id = ?",
          outbox.operation_id,
        );

        if (resolution === "keep_server") {
          if (!serverSnapshot) {
            await this.database.runAsync("DELETE FROM debts WHERE id = ?", entityId);
            return;
          }
          await this.upsertDebtSnapshot(serverSnapshot, "synced");
          return;
        }

        const operationType = outbox.operation_type;
        if (operationType === "delete") {
          if (!serverSnapshot) {
            await this.database.runAsync("DELETE FROM debts WHERE id = ?", entityId);
            return;
          }
          await this.database.runAsync(
            `INSERT INTO sync_outbox (
              operation_id, idempotency_key, entity_type, entity_id, operation_type,
              base_revision, payload_json, dependency_ids_json, base_json, created_sequence
            ) VALUES (?, ?, 'debt', ?, 'delete', ?, '{}', '[]', ?, ?)`,
            uuidSchema.parse(this.randomUuid()),
            uuidSchema.parse(this.randomUuid()),
            entityId,
            serverSnapshot.revision,
            JSON.stringify(serverSnapshot),
            await this.store.nextSequence(),
          );
          await this.database.runAsync(
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
          await this.database.runAsync(
            `UPDATE debts SET server_revision = 0, server_updated_at = NULL,
              sync_state = 'pending' WHERE id = ?`,
            entityId,
          );
          await this.database.runAsync(
            `INSERT INTO sync_outbox (
              operation_id, idempotency_key, entity_type, entity_id, operation_type,
              base_revision, payload_json, dependency_ids_json, base_json, created_sequence
            ) VALUES (?, ?, 'debt', ?, 'create', 0, ?, '[]', '{}', ?)`,
            uuidSchema.parse(this.randomUuid()),
            uuidSchema.parse(this.randomUuid()),
            entityId,
            JSON.stringify(localInput),
            await this.store.nextSequence(),
          );
          return;
        }
        await this.database.runAsync(
          `UPDATE debts SET server_revision = ?, server_updated_at = ?,
            sync_state = 'pending' WHERE id = ?`,
          serverSnapshot.revision,
          serverSnapshot.updatedAt,
          entityId,
        );
        await this.database.runAsync(
          `INSERT INTO sync_outbox (
            operation_id, idempotency_key, entity_type, entity_id, operation_type,
            base_revision, payload_json, dependency_ids_json, base_json, created_sequence
          ) VALUES (?, ?, 'debt', ?, 'update', ?, ?, '[]', ?, ?)`,
          uuidSchema.parse(this.randomUuid()),
          uuidSchema.parse(this.randomUuid()),
          entityId,
          serverSnapshot.revision,
          JSON.stringify(localInput),
          JSON.stringify(serverSnapshot),
          await this.store.nextSequence(),
        );
      });
    });
  }

  private async upsertDebtSnapshot(
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
    await this.database.runAsync(
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

  private async upsertSubscriptionSnapshot(
    snapshot: {
      id: string;
      name: string;
      amountMinor: number;
      currency: string;
      billingCycle: SubscriptionBillingCycle;
      nextBillingDate: string;
      status: SubscriptionStatus;
      categoryId: string | null;
      accountId: string | null;
      revision: number;
      updatedAt: string | null;
    },
    syncState: "synced" | "pending",
  ): Promise<void> {
    await this.database.runAsync(
      `INSERT INTO subscriptions (
        id, name, amount_minor, currency, billing_cycle, next_billing_date, status,
        category_id, account_id, server_revision, server_updated_at, deleted_at, sync_state
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         amount_minor = excluded.amount_minor,
         currency = excluded.currency,
         billing_cycle = excluded.billing_cycle,
         next_billing_date = excluded.next_billing_date,
         status = excluded.status,
         category_id = excluded.category_id,
         account_id = excluded.account_id,
         server_revision = excluded.server_revision,
         server_updated_at = excluded.server_updated_at,
         deleted_at = NULL,
         sync_state = excluded.sync_state`,
      snapshot.id,
      snapshot.name,
      snapshot.amountMinor,
      snapshot.currency,
      snapshot.billingCycle,
      snapshot.nextBillingDate,
      snapshot.status,
      snapshot.categoryId,
      snapshot.accountId,
      snapshot.revision,
      snapshot.updatedAt,
      syncState,
    );
  }

  getSubscriptionConflict(entityId: string): Promise<LocalSubscriptionConflict | null> {
    return this.writer.run(async () => {
      const local = await this.store.currentSubscriptionRowById(entityId);
      const row = await this.database.getFirstAsync(
        `SELECT conflict_id, operation_id, base_json, local_json, server_json,
          server_revision, created_at
         FROM sync_conflicts
         WHERE entity_type = 'subscription' AND entity_id = ? AND resolved_at IS NULL
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
        serverValue === null ? null : mobileSyncSubscriptionSnapshotSchema.parse(serverValue);
      return {
        id: conflict.conflict_id,
        entityId,
        local: {
          name: local.name,
          amountMinor: local.amount_minor,
          billingCycle: local.billing_cycle,
          nextBillingDate: local.next_billing_date,
          status: local.status,
          categoryId: local.category_id,
          accountId: local.account_id,
        },
        server: serverSnapshot
          ? {
              name: serverSnapshot.name,
              amountMinor: serverSnapshot.amountMinor,
              billingCycle: serverSnapshot.billingCycle,
              nextBillingDate: serverSnapshot.nextBillingDate,
              status: serverSnapshot.status,
              categoryId: serverSnapshot.categoryId,
              accountId: serverSnapshot.accountId,
            }
          : null,
        serverRevision: conflict.server_revision,
        createdAt: conflict.created_at,
      };
    });
  }

  resolveSubscriptionConflict(
    entityId: string,
    resolution: "keep_local" | "keep_server",
  ): Promise<void> {
    return this.writer.run(async () => {
      await this.database.withTransactionAsync(async () => {
        const local = await this.store.currentSubscriptionRowById(entityId);
        const conflict = await this.store.currentConflict("subscription", entityId);
        const outbox = await this.store.currentOutbox("subscription", entityId);
        if (
          !outbox ||
          outbox.operation_id !== conflict.operation_id ||
          outbox.state !== "conflicted"
        ) {
          throw new LocalMutationError(
            "The preserved subscription conflict changed before it could be resolved.",
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
          serverValue === null ? null : mobileSyncSubscriptionSnapshotSchema.parse(serverValue);

        await this.database.runAsync(
          `UPDATE sync_conflicts SET resolved_at = ?, resolution = ?, operation_id = NULL
           WHERE conflict_id = ? AND resolved_at IS NULL`,
          this.now().toISOString(),
          resolution,
          conflict.conflict_id,
        );
        await this.database.runAsync(
          "DELETE FROM sync_outbox WHERE operation_id = ?",
          outbox.operation_id,
        );

        if (resolution === "keep_server") {
          if (!serverSnapshot) {
            await this.database.runAsync("DELETE FROM subscriptions WHERE id = ?", entityId);
            return;
          }
          await this.upsertSubscriptionSnapshot(serverSnapshot, "synced");
          return;
        }

        const operationType = outbox.operation_type;
        if (operationType === "delete") {
          if (!serverSnapshot) {
            await this.database.runAsync("DELETE FROM subscriptions WHERE id = ?", entityId);
            return;
          }
          await this.database.runAsync(
            `INSERT INTO sync_outbox (
              operation_id, idempotency_key, entity_type, entity_id, operation_type,
              base_revision, payload_json, dependency_ids_json, base_json, created_sequence
            ) VALUES (?, ?, 'subscription', ?, 'delete', ?, '{}', '[]', ?, ?)`,
            uuidSchema.parse(this.randomUuid()),
            uuidSchema.parse(this.randomUuid()),
            entityId,
            serverSnapshot.revision,
            JSON.stringify(serverSnapshot),
            await this.store.nextSequence(),
          );
          await this.database.runAsync(
            "UPDATE subscriptions SET sync_state = 'pending' WHERE id = ?",
            entityId,
          );
          return;
        }

        const localInput = {
          name: local.name,
          amountMinor: local.amount_minor,
          billingCycle: local.billing_cycle,
          nextBillingDate: local.next_billing_date,
          categoryId: local.category_id,
          accountId: local.account_id,
          status: local.status,
        };
        if (!serverSnapshot) {
          await this.database.runAsync(
            `UPDATE subscriptions SET server_revision = 0, server_updated_at = NULL,
              sync_state = 'pending' WHERE id = ?`,
            entityId,
          );
          await this.database.runAsync(
            `INSERT INTO sync_outbox (
              operation_id, idempotency_key, entity_type, entity_id, operation_type,
              base_revision, payload_json, dependency_ids_json, base_json, created_sequence
            ) VALUES (?, ?, 'subscription', ?, 'create', 0, ?, '[]', '{}', ?)`,
            uuidSchema.parse(this.randomUuid()),
            uuidSchema.parse(this.randomUuid()),
            entityId,
            JSON.stringify(localInput),
            await this.store.nextSequence(),
          );
          return;
        }
        await this.database.runAsync(
          `UPDATE subscriptions SET server_revision = ?, server_updated_at = ?,
            sync_state = 'pending' WHERE id = ?`,
          serverSnapshot.revision,
          serverSnapshot.updatedAt,
          entityId,
        );
        await this.database.runAsync(
          `INSERT INTO sync_outbox (
            operation_id, idempotency_key, entity_type, entity_id, operation_type,
            base_revision, payload_json, dependency_ids_json, base_json, created_sequence
          ) VALUES (?, ?, 'subscription', ?, 'update', ?, ?, '[]', ?, ?)`,
          uuidSchema.parse(this.randomUuid()),
          uuidSchema.parse(this.randomUuid()),
          entityId,
          serverSnapshot.revision,
          JSON.stringify(localInput),
          JSON.stringify(serverSnapshot),
          await this.store.nextSequence(),
        );
      });
    });
  }

  private async upsertEventSnapshot(
    snapshot: {
      id: string;
      title: string;
      date: string;
      startTime: string | null;
      endTime: string | null;
      notes: string | null;
      revision: number;
      updatedAt: string | null;
    },
    syncState: "synced" | "pending",
  ): Promise<void> {
    await this.database.runAsync(
      `INSERT INTO calendar_events (
        id, title, date, start_time, end_time, notes,
        server_revision, server_updated_at, deleted_at, sync_state
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)
       ON CONFLICT(id) DO UPDATE SET
         title = excluded.title,
         date = excluded.date,
         start_time = excluded.start_time,
         end_time = excluded.end_time,
         notes = excluded.notes,
         server_revision = excluded.server_revision,
         server_updated_at = excluded.server_updated_at,
         deleted_at = NULL,
         sync_state = excluded.sync_state`,
      snapshot.id,
      snapshot.title,
      snapshot.date,
      snapshot.startTime,
      snapshot.endTime,
      snapshot.notes,
      snapshot.revision,
      snapshot.updatedAt,
      syncState,
    );
  }

  getEventConflict(entityId: string): Promise<LocalEventConflict | null> {
    return this.writer.run(async () => {
      const local = await this.store.currentEventRowById(entityId);
      const row = await this.database.getFirstAsync(
        `SELECT conflict_id, operation_id, base_json, local_json, server_json,
          server_revision, created_at
         FROM sync_conflicts
         WHERE entity_type = 'event' AND entity_id = ? AND resolved_at IS NULL
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
        serverValue === null ? null : mobileSyncEventSnapshotSchema.parse(serverValue);
      return {
        id: conflict.conflict_id,
        entityId,
        local: {
          title: local.title,
          date: local.date,
          startTime: local.start_time,
          endTime: local.end_time,
          notes: local.notes,
        },
        server: serverSnapshot
          ? {
              title: serverSnapshot.title,
              date: serverSnapshot.date,
              startTime: serverSnapshot.startTime,
              endTime: serverSnapshot.endTime,
              notes: serverSnapshot.notes,
            }
          : null,
        serverRevision: conflict.server_revision,
        createdAt: conflict.created_at,
      };
    });
  }

  resolveEventConflict(entityId: string, resolution: "keep_local" | "keep_server"): Promise<void> {
    return this.writer.run(async () => {
      await this.database.withTransactionAsync(async () => {
        const local = await this.store.currentEventRowById(entityId);
        const conflict = await this.store.currentConflict("event", entityId);
        const outbox = await this.store.currentOutbox("event", entityId);
        if (
          !outbox ||
          outbox.operation_id !== conflict.operation_id ||
          outbox.state !== "conflicted"
        ) {
          throw new LocalMutationError(
            "The preserved event conflict changed before it could be resolved.",
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
          serverValue === null ? null : mobileSyncEventSnapshotSchema.parse(serverValue);

        await this.database.runAsync(
          `UPDATE sync_conflicts SET resolved_at = ?, resolution = ?, operation_id = NULL
           WHERE conflict_id = ? AND resolved_at IS NULL`,
          this.now().toISOString(),
          resolution,
          conflict.conflict_id,
        );
        await this.database.runAsync(
          "DELETE FROM sync_outbox WHERE operation_id = ?",
          outbox.operation_id,
        );

        if (resolution === "keep_server") {
          if (!serverSnapshot) {
            await this.database.runAsync("DELETE FROM calendar_events WHERE id = ?", entityId);
            return;
          }
          await this.upsertEventSnapshot(serverSnapshot, "synced");
          return;
        }

        const operationType = outbox.operation_type;
        if (operationType === "delete") {
          if (!serverSnapshot) {
            await this.database.runAsync("DELETE FROM calendar_events WHERE id = ?", entityId);
            return;
          }
          await this.database.runAsync(
            `INSERT INTO sync_outbox (
              operation_id, idempotency_key, entity_type, entity_id, operation_type,
              base_revision, payload_json, dependency_ids_json, base_json, created_sequence
            ) VALUES (?, ?, 'event', ?, 'delete', ?, '{}', '[]', ?, ?)`,
            uuidSchema.parse(this.randomUuid()),
            uuidSchema.parse(this.randomUuid()),
            entityId,
            serverSnapshot.revision,
            JSON.stringify(serverSnapshot),
            await this.store.nextSequence(),
          );
          await this.database.runAsync(
            "UPDATE calendar_events SET sync_state = 'pending' WHERE id = ?",
            entityId,
          );
          return;
        }

        const localInput = {
          title: local.title,
          date: local.date,
          startTime: local.start_time,
          endTime: local.end_time,
          notes: local.notes,
        };
        if (!serverSnapshot) {
          await this.database.runAsync(
            `UPDATE calendar_events SET server_revision = 0, server_updated_at = NULL,
              sync_state = 'pending' WHERE id = ?`,
            entityId,
          );
          await this.database.runAsync(
            `INSERT INTO sync_outbox (
              operation_id, idempotency_key, entity_type, entity_id, operation_type,
              base_revision, payload_json, dependency_ids_json, base_json, created_sequence
            ) VALUES (?, ?, 'event', ?, 'create', 0, ?, '[]', '{}', ?)`,
            uuidSchema.parse(this.randomUuid()),
            uuidSchema.parse(this.randomUuid()),
            entityId,
            JSON.stringify(localInput),
            await this.store.nextSequence(),
          );
          return;
        }
        await this.database.runAsync(
          `UPDATE calendar_events SET server_revision = ?, server_updated_at = ?,
            sync_state = 'pending' WHERE id = ?`,
          serverSnapshot.revision,
          serverSnapshot.updatedAt,
          entityId,
        );
        await this.database.runAsync(
          `INSERT INTO sync_outbox (
            operation_id, idempotency_key, entity_type, entity_id, operation_type,
            base_revision, payload_json, dependency_ids_json, base_json, created_sequence
          ) VALUES (?, ?, 'event', ?, 'update', ?, ?, '[]', ?, ?)`,
          uuidSchema.parse(this.randomUuid()),
          uuidSchema.parse(this.randomUuid()),
          entityId,
          serverSnapshot.revision,
          JSON.stringify(localInput),
          JSON.stringify(serverSnapshot),
          await this.store.nextSequence(),
        );
      });
    });
  }
}
