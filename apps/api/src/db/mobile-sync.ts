import {
  MOBILE_SYNC_PROTOCOL_VERSION,
  mobileSyncPushResultSchema,
  mobileSyncCategorySnapshotSchema,
  mobileSyncChangeSchema,
  mobileSyncTransactionSnapshotSchema,
  normalizeSignedAmount,
  type MobileSyncChange,
  type MobileSyncPullRequest,
  type MobileSyncPullResponse,
  type MobileSyncPushOperation,
  type MobileSyncPushRequest,
  type MobileSyncPushResponse,
  type MobileSyncPushResult,
  type TransactionInput,
  type TransactionUpdate,
} from "@zoption/shared";

import { HttpError } from "../errors";
import type { Bindings } from "../types";
import { hasProEntitlement } from "./billing";
import { validateTransactionReferences } from "./transactions";

interface ChangeRow {
  sequence: number;
  entityType: "account" | "category" | "transaction";
  entityId: string;
  rowRevision: number;
  operation: "upsert" | "delete";
  payloadJson: string | null;
  serverUpdatedAt: string;
}

interface IdempotencyRow {
  requestHash: string;
  responseJson: string;
}

interface TransactionSyncRow {
  rowRevision: number;
  payloadJson: string;
}

export interface MobileSyncRepository {
  pull(
    env: Bindings,
    tenantId: string,
    input: MobileSyncPullRequest,
  ): Promise<MobileSyncPullResponse>;
  push(
    env: Bindings,
    tenantId: string,
    input: MobileSyncPushRequest,
  ): Promise<MobileSyncPushResponse>;
}

type EntitlementReader = (env: Bindings, tenantId: string) => Promise<boolean>;

export function encodeMobileSyncCursor(sequence: number): string {
  if (!Number.isSafeInteger(sequence) || sequence < 0) {
    throw new Error("Cannot encode an invalid mobile sync sequence.");
  }
  return `v1.${sequence.toString(36)}`;
}

export function decodeMobileSyncCursor(cursor: string | null): number {
  if (cursor === null) return 0;
  const encoded = cursor.slice(3);
  const sequence = Number.parseInt(encoded, 36);
  if (
    !Number.isSafeInteger(sequence) ||
    sequence < 0 ||
    encodeMobileSyncCursor(sequence) !== cursor
  ) {
    throw new HttpError(400, "invalid_sync_cursor", "Restart synchronization from this device.");
  }
  return sequence;
}

function decodePayload(row: ChangeRow, hasPro: boolean): MobileSyncChange {
  try {
    let payload: unknown = null;
    if (row.operation === "upsert") {
      if (!row.payloadJson) throw new Error("missing_payload");
      payload = JSON.parse(row.payloadJson) as unknown;
      if (row.entityType === "category") {
        const category = mobileSyncCategorySnapshotSchema.parse(payload);
        payload = {
          ...category,
          locked: category.requiredPlan === "zoption_pro" && !hasPro,
        };
      }
    }
    return mobileSyncChangeSchema.parse({
      entityType: row.entityType,
      entityId: row.entityId,
      revision: row.rowRevision,
      operation: row.operation,
      serverUpdatedAt: row.serverUpdatedAt,
      payload,
    });
  } catch {
    // Do not let Zod include a financial payload in the global error log.
    throw new Error("Stored mobile synchronization data failed validation.");
  }
}

function serverTimestamp(): string {
  return new Date()
    .toISOString()
    .replace("T", " ")
    .replace(/\.\d{3}Z$/, "");
}

async function requestHash(operation: MobileSyncPushOperation): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(operation));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function readIdempotency(
  env: Bindings,
  tenantId: string,
  clientId: string,
  idempotencyKey: string,
): Promise<IdempotencyRow | null> {
  return env.DB.prepare(
    `SELECT request_hash AS requestHash, response_json AS responseJson
     FROM mobile_sync_idempotency
     WHERE tenant_id = ? AND client_id = ? AND idempotency_key = ?`,
  )
    .bind(tenantId, clientId, idempotencyKey)
    .first<IdempotencyRow>();
}

function decodeStoredResult(row: IdempotencyRow): MobileSyncPushResult {
  try {
    return mobileSyncPushResultSchema.parse(JSON.parse(row.responseJson) as unknown);
  } catch {
    throw new Error("Stored mobile idempotency data failed validation.");
  }
}

async function readTransactionSnapshot(env: Bindings, tenantId: string, entityId: string) {
  const row = await env.DB.prepare(
    `SELECT row_revision AS rowRevision, payload_json AS payloadJson
     FROM mobile_sync_transaction_rows
     WHERE tenant_id = ? AND entity_id = ?`,
  )
    .bind(tenantId, entityId)
    .first<TransactionSyncRow>();
  if (!row) return null;
  try {
    return mobileSyncTransactionSnapshotSchema.parse(JSON.parse(row.payloadJson) as unknown);
  } catch {
    throw new Error("Stored mobile transaction data failed validation.");
  }
}

function conflictResult(
  operation: MobileSyncPushOperation,
  code: "stale_revision" | "entity_exists" | "entity_missing",
  snapshot: Awaited<ReturnType<typeof readTransactionSnapshot>>,
): MobileSyncPushResult {
  return {
    operationId: operation.operationId,
    entityType: operation.entityType,
    entityId: operation.entityId,
    status: "conflict",
    code,
    serverRevision: snapshot?.revision ?? null,
    serverUpdatedAt: snapshot?.updatedAt ?? null,
    serverPayload: snapshot,
  };
}

function rejectedResult(
  operation: MobileSyncPushOperation,
  code: Extract<MobileSyncPushResult, { status: "rejected" }>["code"],
  message: string,
): MobileSyncPushResult {
  return {
    operationId: operation.operationId,
    entityType: operation.entityType,
    entityId: operation.entityId,
    status: "rejected",
    code,
    message,
  };
}

function idempotencyInsert(
  env: Bindings,
  tenantId: string,
  clientId: string,
  operation: MobileSyncPushOperation,
  hash: string,
  result: MobileSyncPushResult,
  requirePreviousChange: boolean,
) {
  return env.DB.prepare(
    `INSERT INTO mobile_sync_idempotency (
      tenant_id, client_id, idempotency_key, request_hash, response_json
    ) SELECT ?, ?, ?, ?, ? ${requirePreviousChange ? "WHERE changes() = 1" : ""}`,
  ).bind(tenantId, clientId, operation.idempotencyKey, hash, JSON.stringify(result));
}

async function persistResult(
  env: Bindings,
  tenantId: string,
  clientId: string,
  operation: MobileSyncPushOperation,
  hash: string,
  result: MobileSyncPushResult,
): Promise<MobileSyncPushResult> {
  try {
    await idempotencyInsert(env, tenantId, clientId, operation, hash, result, false).run();
    return result;
  } catch {
    const replay = await readIdempotency(env, tenantId, clientId, operation.idempotencyKey);
    if (!replay || replay.requestHash !== hash) {
      throw new HttpError(
        409,
        "idempotency_key_reused",
        "This synchronization key was already used for another operation.",
      );
    }
    return decodeStoredResult(replay);
  }
}

type NonTransferTransactionInput = Extract<TransactionInput, { kind: "income" | "expense" }>;

function updateInput(
  payload: TransactionUpdate,
  current: NonNullable<Awaited<ReturnType<typeof readTransactionSnapshot>>>,
): NonTransferTransactionInput | null {
  if (current.kind === "transfer" || current.transferGroupId || payload.kind === "transfer") {
    return null;
  }
  const accountId = payload.accountId ?? current.accountId;
  if (!accountId) return null;
  const kind = payload.kind ?? current.kind;
  return {
    date: payload.date ?? current.date,
    description: payload.description ?? current.description,
    amountMinor: Math.abs(payload.amountMinor ?? current.amountMinor),
    currency: payload.currency ?? current.currency,
    kind,
    categoryId: payload.categoryId ?? current.categoryId,
    accountId,
    notes: payload.notes !== undefined ? payload.notes : (current.notes ?? undefined),
  };
}

export function createMobileSyncRepository(
  readEntitlement: EntitlementReader = hasProEntitlement,
): MobileSyncRepository {
  return {
    async pull(env, tenantId, input) {
      const cursorSequence = decodeMobileSyncCursor(input.cursor);
      const state = await env.DB.prepare(
        "SELECT sequence FROM mobile_sync_state WHERE tenant_id = ?",
      )
        .bind(tenantId)
        .first<{ sequence: number }>();
      const currentSequence = Number(state?.sequence ?? 0);
      if (cursorSequence > currentSequence) {
        throw new HttpError(
          409,
          "full_resync_required",
          "This device cursor is no longer valid. Start a safe full resynchronization.",
          { reason: "cursor_ahead" },
        );
      }

      const result = await env.DB.prepare(
        `SELECT
          sequence,
          entity_type AS entityType,
          entity_id AS entityId,
          row_revision AS rowRevision,
          operation,
          payload_json AS payloadJson,
          server_updated_at AS serverUpdatedAt
        FROM mobile_sync_changes
        WHERE tenant_id = ? AND sequence > ?
        ORDER BY sequence
        LIMIT ?`,
      )
        .bind(tenantId, cursorSequence, input.limit + 1)
        .all<ChangeRow>();

      const hasMore = result.results.length > input.limit;
      const page = hasMore ? result.results.slice(0, input.limit) : result.results;
      const hasPro = page.some((change) => change.entityType === "category")
        ? await readEntitlement(env, tenantId)
        : false;
      const changes = page.map((change) => decodePayload(change, hasPro));
      const nextSequence = page.at(-1)?.sequence ?? cursorSequence;

      return {
        protocolVersion: MOBILE_SYNC_PROTOCOL_VERSION,
        changes,
        nextCursor: encodeMobileSyncCursor(nextSequence),
        hasMore,
      };
    },

    async push(env, tenantId, input) {
      const results: MobileSyncPushResult[] = [];
      for (const operation of input.operations) {
        const hash = await requestHash(operation);
        const stored = await readIdempotency(
          env,
          tenantId,
          input.clientId,
          operation.idempotencyKey,
        );
        if (stored) {
          if (stored.requestHash !== hash) {
            throw new HttpError(
              409,
              "idempotency_key_reused",
              "This synchronization key was already used for another operation.",
            );
          }
          results.push(decodeStoredResult(stored));
          continue;
        }

        if (operation.entityType !== "transaction" || operation.dependencyIds.length > 0) {
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
                "This synchronization operation is not supported by the current mobile protocol.",
              ),
            ),
          );
          continue;
        }

        const current = await readTransactionSnapshot(env, tenantId, operation.entityId);
        if (operation.operationType === "create" && current) {
          results.push(
            await persistResult(
              env,
              tenantId,
              input.clientId,
              operation,
              hash,
              conflictResult(operation, "entity_exists", current),
            ),
          );
          continue;
        }
        if (operation.operationType !== "create" && !current) {
          results.push(
            await persistResult(
              env,
              tenantId,
              input.clientId,
              operation,
              hash,
              conflictResult(operation, "entity_missing", null),
            ),
          );
          continue;
        }
        if (
          operation.operationType !== "create" &&
          current &&
          current.revision !== operation.baseRevision
        ) {
          results.push(
            await persistResult(
              env,
              tenantId,
              input.clientId,
              operation,
              hash,
              conflictResult(operation, "stale_revision", current),
            ),
          );
          continue;
        }

        let transaction: NonTransferTransactionInput | null = null;
        if (operation.operationType === "create") {
          const candidate = operation.payload as TransactionInput;
          transaction = candidate.kind === "transfer" ? null : candidate;
        } else if (operation.operationType === "update" && current) {
          transaction = updateInput(operation.payload as TransactionUpdate, current);
        }
        if (operation.operationType !== "delete") {
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
                  "Transfers require the future atomic transfer synchronization command.",
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
              current?.categoryId,
              readEntitlement,
            );
          } catch (error) {
            if (!(error instanceof HttpError)) throw error;
            const code =
              error.code === "invalid_category" || error.code === "category_kind_mismatch"
                ? "invalid_category"
                : error.code === "invalid_account"
                  ? "invalid_account"
                  : error.code === "category_requires_pro"
                    ? "plan_limit"
                    : "invalid_operation";
            results.push(
              await persistResult(
                env,
                tenantId,
                input.clientId,
                operation,
                hash,
                rejectedResult(operation, code, error.message),
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
        const timestamp = serverTimestamp();
        const mutation =
          operation.operationType === "create" && transaction
            ? env.DB.prepare(
                `INSERT INTO transactions (
                  id, tenant_id, account_id, category_id, date, description, amount_minor,
                  currency, kind, notes, source_kind, revision, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', 1, ?)`,
              ).bind(
                operation.entityId,
                tenantId,
                transaction.accountId,
                transaction.categoryId,
                transaction.date,
                transaction.description,
                normalizeSignedAmount(transaction.amountMinor, transaction.kind),
                transaction.currency,
                transaction.kind,
                transaction.notes || null,
                timestamp,
              )
            : operation.operationType === "update" && transaction
              ? env.DB.prepare(
                  `UPDATE transactions SET
                    account_id = ?, category_id = ?, date = ?, description = ?, amount_minor = ?,
                    currency = ?, kind = ?, notes = ?, revision = ?, updated_at = ?
                   WHERE id = ? AND tenant_id = ? AND revision = ?`,
                ).bind(
                  transaction.accountId,
                  transaction.categoryId,
                  transaction.date,
                  transaction.description,
                  normalizeSignedAmount(transaction.amountMinor, transaction.kind),
                  transaction.currency,
                  transaction.kind,
                  transaction.notes || null,
                  revision,
                  timestamp,
                  operation.entityId,
                  tenantId,
                  operation.baseRevision,
                )
              : env.DB.prepare(
                  "DELETE FROM transactions WHERE id = ? AND tenant_id = ? AND revision = ?",
                ).bind(operation.entityId, tenantId, operation.baseRevision);

        try {
          const batch = await env.DB.batch([
            mutation,
            idempotencyInsert(env, tenantId, input.clientId, operation, hash, acknowledged, true),
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
            if (replay.requestHash !== hash) {
              throw new HttpError(
                409,
                "idempotency_key_reused",
                "This synchronization key was already used for another operation.",
              );
            }
            results.push(decodeStoredResult(replay));
            continue;
          }
        }

        const concurrent = await readTransactionSnapshot(env, tenantId, operation.entityId);
        results.push(
          await persistResult(
            env,
            tenantId,
            input.clientId,
            operation,
            hash,
            conflictResult(
              operation,
              operation.operationType === "create"
                ? "entity_exists"
                : concurrent
                  ? "stale_revision"
                  : "entity_missing",
              concurrent,
            ),
          ),
        );
      }
      return { protocolVersion: MOBILE_SYNC_PROTOCOL_VERSION, results };
    },
  };
}

export const mobileSyncRepository = createMobileSyncRepository();
