import type { SQLiteDatabase } from "expo-sqlite";
import { z } from "zod";

import {
  MOBILE_SYNC_PROTOCOL_VERSION,
  mobileSyncPushOperationSchema,
  mobileSyncPushRequestSchema,
  mobileSyncPushResponseSchema,
  type MobileSyncPushRequest,
  type MobileSyncPushResponse,
} from "@zoption/shared";

import type { LocalDatabaseWriter } from "../database-writer";
import {
  LocalMutationError,
  outboxGraphRowSchema,
  outboxRowSchema,
  pushScheduleRowSchema,
  syncEntityTable,
  uuidSchema,
  type LocalPushSchedule,
  type OutboxGraphNode,
} from "./model";
import type { LocalMutationStore } from "./store";

/** Durable outbox batching, retry scheduling, and server acknowledgement handling. */
export class LocalMutationOutbox {
  constructor(
    private readonly database: SQLiteDatabase,
    private readonly writer: LocalDatabaseWriter,
    private readonly store: LocalMutationStore,
    private readonly clientId: () => Promise<string>,
    private readonly randomUuid: () => string,
    private readonly now: () => Date,
    private readonly random: () => number,
  ) {}

  async getPushBatch(limit = 50): Promise<MobileSyncPushRequest | null> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) {
      throw new Error("Choose a synchronization push size from 1 to 50.");
    }
    return this.writer.run(async () => {
      let request: MobileSyncPushRequest | null = null;
      await this.database.withTransactionAsync(async () => {
        const graphRows = z.array(outboxGraphRowSchema).parse(
          await this.database.getAllAsync(
            `SELECT operation_id, dependency_ids_json, state, next_attempt_at, created_sequence
             FROM sync_outbox
             WHERE state IN ('pending', 'sending', 'retryable', 'failed', 'conflicted')
             ORDER BY CASE WHEN state = 'sending' THEN 0 ELSE 1 END, created_sequence`,
          ),
        );
        if (graphRows.length === 0) return;
        const nodes = new Map(
          graphRows.map((row) => {
            let dependencyIds: unknown;
            try {
              dependencyIds = JSON.parse(row.dependency_ids_json) as unknown;
            } catch {
              throw new LocalMutationError("The encrypted outbox is invalid.", "invalid_outbox");
            }
            return [
              row.operation_id,
              {
                ...row,
                dependencyIds: z.array(uuidSchema).max(20).parse(dependencyIds),
              },
            ] as const;
          }),
        );
        const adjacency = new Map(
          graphRows.map((row) => [row.operation_id, new Set<string>()] as const),
        );
        for (const node of nodes.values()) {
          for (const dependencyId of node.dependencyIds) {
            if (!nodes.has(dependencyId)) {
              throw new LocalMutationError(
                "An outbox dependency is missing from encrypted local storage.",
                "invalid_outbox",
              );
            }
            adjacency.get(node.operation_id)!.add(dependencyId);
            adjacency.get(dependencyId)!.add(node.operation_id);
          }
        }

        const visited = new Set<string>();
        const components: OutboxGraphNode[][] = [];
        for (const node of nodes.values()) {
          if (visited.has(node.operation_id)) continue;
          const component: OutboxGraphNode[] = [];
          const pending = [node.operation_id];
          visited.add(node.operation_id);
          while (pending.length > 0) {
            const operationId = pending.pop()!;
            const current = nodes.get(operationId)!;
            component.push(current);
            for (const relatedId of adjacency.get(operationId)!) {
              if (visited.has(relatedId)) continue;
              visited.add(relatedId);
              pending.push(relatedId);
            }
          }
          component.sort((left, right) => left.created_sequence - right.created_sequence);
          components.push(component);
        }
        components.sort((left, right) => {
          const leftSending = left.some((node) => node.state === "sending") ? 0 : 1;
          const rightSending = right.some((node) => node.state === "sending") ? 0 : 1;
          return (
            leftSending - rightSending || left[0]!.created_sequence - right[0]!.created_sequence
          );
        });

        const now = this.now().getTime();
        const ready = (node: OutboxGraphNode): boolean => {
          if (node.state === "sending" || node.state === "pending") return true;
          if (node.state !== "retryable" || node.next_attempt_at === null) return false;
          const next = Date.parse(node.next_attempt_at);
          if (!Number.isFinite(next)) {
            throw new LocalMutationError("The encrypted outbox is invalid.", "invalid_outbox");
          }
          return next <= now;
        };
        const selected: string[] = [];
        for (const component of components) {
          if (!component.every(ready)) continue;
          const isDependencyGraph = component.some((node) => node.dependencyIds.length > 0);
          if (isDependencyGraph) {
            if (selected.length > 0) break;
            if (component.length > limit) {
              throw new LocalMutationError(
                "The synchronization batch is too small for one atomic dependency graph.",
                "invalid_outbox",
              );
            }
            selected.push(...component.map((node) => node.operation_id));
            break;
          }
          if (selected.length >= limit) break;
          selected.push(component[0]!.operation_id);
        }
        if (selected.length === 0) return;

        const placeholders = selected.map(() => "?").join(", ");
        const rows = await this.database.getAllAsync(
          `SELECT operation_id, idempotency_key, entity_type, entity_id, operation_type,
            base_revision, payload_json, dependency_ids_json, base_json, state, attempt_count
           FROM sync_outbox
           WHERE operation_id IN (${placeholders})
           ORDER BY created_sequence`,
          ...selected,
        );
        const operations = rows.map((value) => {
          const row = outboxRowSchema.parse(value);
          let payload: unknown;
          let dependencyIds: unknown;
          try {
            payload = JSON.parse(row.payload_json) as unknown;
            dependencyIds = JSON.parse(row.dependency_ids_json) as unknown;
          } catch {
            throw new LocalMutationError("The encrypted outbox is invalid.", "invalid_outbox");
          }
          return mobileSyncPushOperationSchema.parse({
            operationId: row.operation_id,
            idempotencyKey: row.idempotency_key,
            entityType: row.entity_type,
            entityId: row.entity_id,
            operationType: row.operation_type,
            baseRevision: row.base_revision,
            payload,
            dependencyIds,
          });
        });
        for (const operation of operations) {
          await this.database.runAsync(
            "UPDATE sync_outbox SET state = 'sending' WHERE operation_id = ?",
            operation.operationId,
          );
        }
        request = mobileSyncPushRequestSchema.parse({
          protocolVersion: MOBILE_SYNC_PROTOCOL_VERSION,
          clientId: await this.clientId(),
          operations,
        });
      });
      return request;
    });
  }

  getPushSchedule(): Promise<LocalPushSchedule> {
    return this.writer.run(async () => {
      const row = pushScheduleRowSchema.parse(
        await this.database.getFirstAsync(
          `SELECT
            count(*) AS outstanding_count,
            coalesce(sum(CASE WHEN state IN ('failed', 'conflicted') THEN 1 ELSE 0 END), 0) AS blocked_count,
            min(CASE WHEN state = 'retryable' THEN next_attempt_at END) AS next_attempt_at
           FROM sync_outbox
           WHERE state IN ('pending', 'sending', 'retryable', 'failed', 'conflicted')`,
        ),
      );
      if (row.next_attempt_at !== null && !Number.isFinite(Date.parse(row.next_attempt_at))) {
        throw new LocalMutationError("The encrypted outbox is invalid.", "invalid_outbox");
      }
      return {
        outstandingCount: row.outstanding_count,
        blockedCount: row.blocked_count,
        nextAttemptAt: row.next_attempt_at,
      };
    });
  }

  applyPushResponse(request: MobileSyncPushRequest, value: MobileSyncPushResponse): Promise<void> {
    const response = mobileSyncPushResponseSchema.parse(value);
    const operations = new Map(
      request.operations.map((operation) => [operation.operationId, operation]),
    );
    if (operations.size !== response.results.length) {
      throw new LocalMutationError("The push result did not match its request.", "invalid_outbox");
    }
    for (const result of response.results) {
      const operation = operations.get(result.operationId);
      if (
        !operation ||
        operation.entityType !== result.entityType ||
        operation.entityId !== result.entityId
      ) {
        throw new LocalMutationError(
          "The push result did not match its request.",
          "invalid_outbox",
        );
      }
      operations.delete(result.operationId);
    }
    if (operations.size > 0) {
      throw new LocalMutationError("The push result did not match its request.", "invalid_outbox");
    }

    return this.writer.run(async () => {
      await this.database.withTransactionAsync(async () => {
        for (const result of response.results) {
          const operation = request.operations.find(
            (item) => item.operationId === result.operationId,
          )!;
          const outbox = await this.store.currentOutbox(operation.entityType, operation.entityId);
          if (!outbox || outbox.operation_id !== operation.operationId) {
            throw new LocalMutationError(
              "The encrypted outbox changed before acknowledgement.",
              "invalid_outbox",
            );
          }
          if (result.status === "acknowledged") {
            if (result.entityType === "transfer") {
              await this.database.runAsync(
                `UPDATE transactions SET server_revision = ?, sync_state = 'synced'
                 WHERE transfer_group_id = ?`,
                result.revision,
                result.entityId,
              );
            } else {
              await this.database.runAsync(
                `UPDATE ${syncEntityTable(result.entityType)}
                 SET server_revision = ?, sync_state = 'synced' WHERE id = ?`,
                result.revision,
                result.entityId,
              );
            }
            await this.database.runAsync(
              "DELETE FROM sync_outbox WHERE operation_id = ?",
              result.operationId,
            );
            continue;
          }
          if (result.status === "conflict") {
            await this.database.runAsync(
              `INSERT INTO sync_conflicts (
                conflict_id, entity_type, entity_id, operation_id, base_json, local_json,
                server_json, server_revision, created_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              uuidSchema.parse(this.randomUuid()),
              result.entityType,
              result.entityId,
              result.operationId,
              outbox.base_json,
              outbox.payload_json,
              JSON.stringify(result.serverPayload),
              result.serverRevision ?? 0,
              this.now().toISOString(),
            );
            await this.database.runAsync(
              "UPDATE sync_outbox SET state = 'conflicted', last_error_code = ? WHERE operation_id = ?",
              result.code,
              result.operationId,
            );
            if (result.entityType === "transfer") {
              await this.database.runAsync(
                "UPDATE transactions SET sync_state = 'conflicted' WHERE transfer_group_id = ?",
                result.entityId,
              );
            } else {
              await this.database.runAsync(
                `UPDATE ${syncEntityTable(result.entityType)}
                 SET sync_state = 'conflicted' WHERE id = ?`,
                result.entityId,
              );
            }
            continue;
          }
          await this.database.runAsync(
            "UPDATE sync_outbox SET state = 'failed', last_error_code = ? WHERE operation_id = ?",
            result.code,
            result.operationId,
          );
          if (result.entityType === "transfer") {
            await this.database.runAsync(
              "UPDATE transactions SET sync_state = 'failed' WHERE transfer_group_id = ?",
              result.entityId,
            );
          } else {
            await this.database.runAsync(
              `UPDATE ${syncEntityTable(result.entityType)} SET sync_state = 'failed' WHERE id = ?`,
              result.entityId,
            );
          }
        }
      });
    });
  }

  recordPushFailure(
    request: MobileSyncPushRequest,
    code: string,
    retryAfterSeconds: number | null,
  ): Promise<void> {
    return this.writer.run(async () => {
      await this.database.withTransactionAsync(async () => {
        for (const operation of request.operations) {
          const outbox = await this.store.currentOutbox(operation.entityType, operation.entityId);
          if (!outbox || outbox.operation_id !== operation.operationId) continue;
          const exponentialCap = Math.min(15 * 2 ** outbox.attempt_count, 60 * 60);
          const delaySeconds = Math.min(
            retryAfterSeconds ?? this.random() * exponentialCap,
            24 * 60 * 60,
          );
          await this.database.runAsync(
            `UPDATE sync_outbox
             SET state = 'retryable', attempt_count = attempt_count + 1,
                 next_attempt_at = ?, last_error_code = ?
             WHERE operation_id = ?`,
            new Date(this.now().getTime() + delaySeconds * 1000).toISOString(),
            code,
            operation.operationId,
          );
        }
      });
    });
  }

  recordPushPermanentFailure(request: MobileSyncPushRequest, code: string): Promise<void> {
    return this.writer.run(async () => {
      await this.database.withTransactionAsync(async () => {
        for (const operation of request.operations) {
          const outbox = await this.store.currentOutbox(operation.entityType, operation.entityId);
          if (!outbox || outbox.operation_id !== operation.operationId) continue;
          await this.database.runAsync(
            "UPDATE sync_outbox SET state = 'failed', last_error_code = ? WHERE operation_id = ?",
            code,
            operation.operationId,
          );
          if (operation.entityType === "transfer") {
            await this.database.runAsync(
              "UPDATE transactions SET sync_state = 'failed' WHERE transfer_group_id = ?",
              operation.entityId,
            );
          } else {
            await this.database.runAsync(
              `UPDATE ${syncEntityTable(operation.entityType)}
               SET sync_state = 'failed' WHERE id = ?`,
              operation.entityId,
            );
          }
        }
      });
    });
  }
}
