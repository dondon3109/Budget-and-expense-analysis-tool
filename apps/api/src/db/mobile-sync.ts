import {
  MOBILE_SYNC_PROTOCOL_VERSION,
  calendarEventInputSchema,
  mobileSyncEventSnapshotSchema,
  mobileSyncPushResultSchema,
  mobileSyncTransactionSnapshotSchema,
  type MobileSyncAcknowledgeRequest,
  type MobileSyncAcknowledgeResponse,
  type MobileSyncPullRequest,
  type MobileSyncPullResponse,
  type MobileSyncPushOperation,
  type MobileSyncPushRequest,
  type MobileSyncPushResponse,
  type MobileSyncPushResult,
  type MobileSyncSnapshotRequest,
  type MobileSyncSnapshotResponse,
} from "@zoption/shared";

import { HttpError } from "../errors";
import type { Bindings } from "../types";
import { hasProEntitlement } from "./billing";
import {
  readTransactionDebtPayment,
  validateTransactionReferences,
  type DebtPayment,
} from "./transactions";
import {
  shapeChangesForClient,
  shapePushResultsForClient,
  type MobileSyncFeatures,
} from "./mobile-sync/features";
import { mobileSyncServerTimestamp as serverTimestamp } from "./mobile-sync/protocol";
import {
  acknowledgeMobileSyncClient,
  pullMobileSyncChanges,
  snapshotMobileSync,
  type MobileSyncEntitlementReader,
} from "./mobile-sync/read";
import { accountMutation } from "./mobile-sync/push/entities/account";
import { budgetMutation } from "./mobile-sync/push/entities/budget";
import { categoryMutation } from "./mobile-sync/push/entities/category";
import { debtMutation } from "./mobile-sync/push/entities/debt";
import { eventMutation } from "./mobile-sync/push/entities/event";
import { goalMutation } from "./mobile-sync/push/entities/goal";
import { subscriptionMutation } from "./mobile-sync/push/entities/subscription";
import {
  transactionMutation,
  updateInput,
  type NonTransferTransactionInput,
} from "./mobile-sync/push/entities/transaction";
import { pushCreateDependencyGraph } from "./mobile-sync/push/graph";
import {
  idempotencyInsert,
  persistResult,
  readIdempotency,
  replayedResult,
  requestHash,
} from "./mobile-sync/push/idempotency";
import {
  conflictResult,
  rejectedResult,
  revisionConflict,
  type EntityMutation,
} from "./mobile-sync/push/results";
import {
  businessRejection,
  subscriptionReferenceRejection,
  transactionReferenceRejection,
  validateBudgetCategory,
  validateSubscriptionReferences,
} from "./mobile-sync/push/rules";
import {
  readBudgetByMonthCategory,
  readEntitySnapshot,
  withCategoryLock,
  type EntitySnapshot,
  type TransactionSnapshot,
} from "./mobile-sync/push/snapshots";
import { pushTransferOperation } from "./mobile-sync/push/transfer";

export {
  compactMobileSyncChanges,
  type MobileSyncCompactionResult,
} from "./mobile-sync/compaction";
export {
  decodeMobileSyncCursor,
  decodeMobileSyncSnapshotCursor,
  encodeMobileSyncCursor,
  encodeMobileSyncSnapshotCursor,
} from "./mobile-sync/protocol";

export interface MobileSyncRepository {
  acknowledge(
    env: Bindings,
    tenantId: string,
    input: MobileSyncAcknowledgeRequest,
  ): Promise<MobileSyncAcknowledgeResponse>;
  /** `features` are the payload additions the client declared; omitted means none. */
  snapshot(
    env: Bindings,
    tenantId: string,
    input: MobileSyncSnapshotRequest,
    features?: MobileSyncFeatures,
  ): Promise<MobileSyncSnapshotResponse>;
  pull(
    env: Bindings,
    tenantId: string,
    input: MobileSyncPullRequest,
    features?: MobileSyncFeatures,
  ): Promise<MobileSyncPullResponse>;
  push(
    env: Bindings,
    tenantId: string,
    input: MobileSyncPushRequest,
    features?: MobileSyncFeatures,
  ): Promise<MobileSyncPushResponse>;
}

type EntitlementReader = MobileSyncEntitlementReader;

type SingleEntityOperation = Exclude<MobileSyncPushOperation, { entityType: "transfer" }>;

/** Builds, without executing, the statements that apply one single-entity operation. */
function entityMutation(
  env: Bindings,
  tenantId: string,
  clientId: string,
  operation: SingleEntityOperation,
  current: EntitySnapshot | null,
  transaction: NonTransferTransactionInput | null,
  previousPayment: DebtPayment,
  revision: number,
  timestamp: string,
): EntityMutation {
  switch (operation.entityType) {
    case "account":
      return accountMutation(env, tenantId, operation, current, timestamp);
    case "category":
      return categoryMutation(env, tenantId, operation, current, timestamp);
    case "budget":
      return budgetMutation(env, tenantId, operation, timestamp);
    case "goal":
      return goalMutation(env, tenantId, operation, current, timestamp);
    case "debt":
      return debtMutation(env, tenantId, operation, current, timestamp);
    case "subscription":
      return subscriptionMutation(env, tenantId, operation, current, timestamp);
    case "event":
      return eventMutation(env, tenantId, operation, current, timestamp);
    case "transaction":
      return transactionMutation(
        env,
        tenantId,
        clientId,
        operation,
        transaction,
        previousPayment,
        revision,
        timestamp,
      );
  }
}

export function createMobileSyncRepository(
  readEntitlement: EntitlementReader = hasProEntitlement,
): MobileSyncRepository {
  return {
    async snapshot(env, tenantId, input, features = new Set()) {
      const response = await snapshotMobileSync(env, tenantId, input, readEntitlement);
      return {
        ...response,
        changes: await shapeChangesForClient(env, tenantId, response.changes, features),
      };
    },

    acknowledge(env, tenantId, input) {
      return acknowledgeMobileSyncClient(env, tenantId, input);
    },

    async pull(env, tenantId, input, features = new Set()) {
      const response = await pullMobileSyncChanges(env, tenantId, input, readEntitlement);
      return {
        ...response,
        changes: await shapeChangesForClient(env, tenantId, response.changes, features),
      };
    },

    async push(env, tenantId, input, features = new Set()) {
      const response = await pushOperations(env, tenantId, input);
      return {
        ...response,
        results: await shapePushResultsForClient(env, tenantId, response.results, features),
      };
    },
  };

  async function pushOperations(
    env: Bindings,
    tenantId: string,
    input: MobileSyncPushRequest,
  ): Promise<MobileSyncPushResponse> {
    if (input.operations.some((operation) => operation.dependencyIds.length > 0)) {
      return pushCreateDependencyGraph(env, tenantId, input, readEntitlement);
    }
    const results: MobileSyncPushResult[] = [];
    for (const operation of input.operations) {
      const hash = await requestHash(operation);
      const stored = await readIdempotency(env, tenantId, input.clientId, operation.idempotencyKey);
      if (stored) {
        results.push(replayedResult(stored, hash));
        continue;
      }

      if (operation.entityType === "transfer") {
        results.push(
          await pushTransferOperation(
            env,
            tenantId,
            input.clientId,
            operation,
            hash,
            readEntitlement,
          ),
        );
        continue;
      }

      if (operation.dependencyIds.length > 0) {
        results.push(
          await persistResult(
            env,
            tenantId,
            input.clientId,
            operation,
            hash,
            rejectedResult(
              operation,
              "unsupported_operation",
              "Dependent operations require the future atomic dependency-graph protocol.",
            ),
          ),
        );
        continue;
      }

      let current = await readEntitySnapshot(
        env,
        tenantId,
        operation.entityType,
        operation.entityId,
      );
      if (operation.entityType === "category" && current) {
        current = withCategoryLock(current, await readEntitlement(env, tenantId));
      }
      const conflict = revisionConflict(operation, current);
      if (conflict) {
        results.push(
          await persistResult(
            env,
            tenantId,
            input.clientId,
            operation,
            hash,
            conflictResult(operation, conflict, current),
          ),
        );
        continue;
      }

      const rejected = await businessRejection(env, tenantId, operation, current);
      if (rejected) {
        results.push(await persistResult(env, tenantId, input.clientId, operation, hash, rejected));
        continue;
      }

      if (operation.entityType === "budget" && operation.operationType === "create") {
        const payload = operation.payload;
        if (!(await validateBudgetCategory(env, tenantId, payload.categoryId))) {
          results.push(
            await persistResult(
              env,
              tenantId,
              input.clientId,
              operation,
              hash,
              rejectedResult(operation, "invalid_category", "Choose an active expense category."),
            ),
          );
          continue;
        }
        const existing = await readBudgetByMonthCategory(
          env,
          tenantId,
          payload.month,
          payload.categoryId,
        );
        if (existing && existing.id !== operation.entityId) {
          results.push(
            await persistResult(
              env,
              tenantId,
              input.clientId,
              operation,
              hash,
              conflictResult(operation, "entity_exists", existing),
            ),
          );
          continue;
        }
      }

      if (operation.entityType === "subscription" && operation.operationType !== "delete") {
        const payload = operation.payload;
        try {
          await validateSubscriptionReferences(
            env,
            tenantId,
            payload.categoryId,
            payload.accountId,
            readEntitlement,
          );
        } catch (error) {
          if (!(error instanceof HttpError)) throw error;
          results.push(
            await persistResult(
              env,
              tenantId,
              input.clientId,
              operation,
              hash,
              subscriptionReferenceRejection(operation, error),
            ),
          );
          continue;
        }
      }

      if (operation.entityType === "event" && operation.operationType === "update" && current) {
        const payload = operation.payload;
        const event = mobileSyncEventSnapshotSchema.parse(current);
        const merged = calendarEventInputSchema.safeParse({
          title: payload.title ?? event.title,
          date: payload.date ?? event.date,
          startTime: payload.startTime === undefined ? event.startTime : payload.startTime,
          endTime: payload.endTime === undefined ? event.endTime : payload.endTime,
          notes: payload.notes === undefined ? event.notes : payload.notes,
        });
        if (!merged.success) {
          results.push(
            await persistResult(
              env,
              tenantId,
              input.clientId,
              operation,
              hash,
              rejectedResult(operation, "invalid_operation", "Check the event fields."),
            ),
          );
          continue;
        }
      }

      const timestamp = serverTimestamp();
      let transaction: NonTransferTransactionInput | null = null;
      let currentTransaction: TransactionSnapshot | null = null;
      let previousPayment: DebtPayment = null;
      if (operation.entityType === "transaction" && current) {
        currentTransaction = mobileSyncTransactionSnapshotSchema.parse(current);
        previousPayment = await readTransactionDebtPayment(env, tenantId, operation.entityId);
      }
      if (operation.entityType === "transaction" && operation.operationType === "create") {
        const candidate = operation.payload;
        transaction = candidate.kind === "transfer" ? null : candidate;
      } else if (
        operation.entityType === "transaction" &&
        operation.operationType === "update" &&
        currentTransaction
      ) {
        transaction = updateInput(
          operation.payload,
          currentTransaction,
          previousPayment?.debtId ?? null,
        );
      }
      if (operation.entityType === "transaction" && operation.operationType !== "delete") {
        if (!transaction) {
          results.push(
            await persistResult(
              env,
              tenantId,
              input.clientId,
              operation,
              hash,
              rejectedResult(
                operation,
                "unsupported_operation",
                "Transfers require the atomic transfer synchronization command.",
              ),
            ),
          );
          continue;
        }
        try {
          await validateTransactionReferences(
            env,
            tenantId,
            transaction,
            currentTransaction?.categoryId,
            readEntitlement,
          );
        } catch (error) {
          if (!(error instanceof HttpError)) throw error;
          results.push(
            await persistResult(
              env,
              tenantId,
              input.clientId,
              operation,
              hash,
              transactionReferenceRejection(operation, error),
            ),
          );
          continue;
        }
      }

      const revision = operation.operationType === "create" ? 1 : operation.baseRevision + 1;
      const acknowledged = mobileSyncPushResultSchema.parse({
        operationId: operation.operationId,
        entityType: operation.entityType,
        entityId: operation.entityId,
        status: "acknowledged",
        revision,
      });
      const { mutation, extraStatements } = entityMutation(
        env,
        tenantId,
        input.clientId,
        operation,
        current,
        transaction,
        previousPayment,
        revision,
        timestamp,
      );

      try {
        const batch = await env.DB.batch([
          mutation,
          idempotencyInsert(env, tenantId, input.clientId, operation, hash, acknowledged, true),
          ...extraStatements,
        ]);
        if (Number(batch[1]?.meta.changes ?? 0) === 1) {
          results.push(acknowledged);
          continue;
        }
      } catch {
        const replay = await readIdempotency(
          env,
          tenantId,
          input.clientId,
          operation.idempotencyKey,
        );
        if (replay) {
          results.push(replayedResult(replay, hash));
          continue;
        }
      }

      let concurrent = await readEntitySnapshot(
        env,
        tenantId,
        operation.entityType,
        operation.entityId,
      );
      if (operation.entityType === "category" && concurrent) {
        concurrent = withCategoryLock(concurrent, await readEntitlement(env, tenantId));
      }
      const concurrentCode = revisionConflict(operation, concurrent);
      if (
        operation.entityType === "budget" &&
        operation.operationType === "create" &&
        !concurrentCode
      ) {
        const raced = await readBudgetByMonthCategory(
          env,
          tenantId,
          operation.payload.month,
          operation.payload.categoryId,
        );
        if (raced) {
          results.push(
            await persistResult(
              env,
              tenantId,
              input.clientId,
              operation,
              hash,
              conflictResult(operation, "entity_exists", raced),
            ),
          );
          continue;
        }
      }
      const racedRejection = concurrentCode
        ? null
        : await businessRejection(env, tenantId, operation, concurrent);
      results.push(
        await persistResult(
          env,
          tenantId,
          input.clientId,
          operation,
          hash,
          racedRejection ??
            (concurrentCode
              ? conflictResult(operation, concurrentCode, concurrent)
              : rejectedResult(
                  operation,
                  "invalid_operation",
                  "The operation could not be applied safely.",
                )),
        ),
      );
    }
    return { protocolVersion: MOBILE_SYNC_PROTOCOL_VERSION, results };
  }
}

export const mobileSyncRepository = createMobileSyncRepository();
