import {
  buildTransferLegs,
  mobileSyncPushResultSchema,
  mobileSyncTransferSnapshotSchema,
  type MobileSyncPushOperation,
  type MobileSyncPushResult,
  type TransferInput,
} from "@zoption/shared";

import { HttpError } from "../../../errors";
import type { Bindings } from "../../../types";
import { validateTransactionReferences } from "../../transactions";
import { mobileSyncServerTimestamp as serverTimestamp } from "../protocol";
import type { MobileSyncEntitlementReader as EntitlementReader } from "../read";
import {
  decodeStoredResult,
  persistResult,
  readIdempotency,
  requiredIdempotencyInsert,
} from "./idempotency";
import { conflictResult, rejectedResult } from "./results";
import { readEntitySnapshot } from "./snapshots";

type TransferOperation = Extract<MobileSyncPushOperation, { entityType: "transfer" }>;

function transferValidationResult(
  operation: TransferOperation,
  error: HttpError,
): MobileSyncPushResult {
  const code =
    error.code === "invalid_category" || error.code === "category_kind_mismatch"
      ? "invalid_category"
      : error.code === "invalid_account"
        ? "invalid_account"
        : error.code === "category_requires_pro"
          ? "plan_limit"
          : "invalid_operation";
  return rejectedResult(operation, code, error.message);
}

export async function pushTransferOperation(
  env: Bindings,
  tenantId: string,
  clientId: string,
  operation: TransferOperation,
  hash: string,
  readEntitlement: EntitlementReader,
): Promise<MobileSyncPushResult> {
  let current = await readEntitySnapshot(env, tenantId, "transfer", operation.entityId);
  if (operation.operationType === "create" && current) {
    return persistResult(
      env,
      tenantId,
      clientId,
      operation,
      hash,
      conflictResult(operation, "entity_exists", current),
    );
  }
  if (operation.operationType !== "create" && !current) {
    return persistResult(
      env,
      tenantId,
      clientId,
      operation,
      hash,
      conflictResult(operation, "entity_missing", null),
    );
  }
  if (
    operation.operationType !== "create" &&
    current &&
    current.revision !== operation.baseRevision
  ) {
    return persistResult(
      env,
      tenantId,
      clientId,
      operation,
      hash,
      conflictResult(operation, "stale_revision", current),
    );
  }

  const existing = current ? mobileSyncTransferSnapshotSchema.parse(current) : null;
  const transfer: TransferInput | null =
    operation.operationType === "delete" ? null : operation.payload.transfer;
  if (transfer) {
    try {
      await validateTransactionReferences(
        env,
        tenantId,
        transfer,
        existing?.categoryId,
        readEntitlement,
      );
    } catch (error) {
      if (!(error instanceof HttpError)) throw error;
      return persistResult(
        env,
        tenantId,
        clientId,
        operation,
        hash,
        transferValidationResult(operation, error),
      );
    }
  }

  const revision = operation.operationType === "create" ? 1 : operation.baseRevision + 1;
  const acknowledged = mobileSyncPushResultSchema.parse({
    operationId: operation.operationId,
    entityType: "transfer",
    entityId: operation.entityId,
    status: "acknowledged",
    revision,
  });
  const timestamp = serverTimestamp();
  const statements: D1PreparedStatement[] = [];
  if (operation.operationType === "create") {
    const payload = operation.payload;
    const [fromLeg, toLeg] = buildTransferLegs(payload.transfer);
    statements.push(
      env.DB.prepare(
        `INSERT INTO transfer_groups (id, tenant_id, from_transaction_id, to_transaction_id)
         VALUES (?, ?, ?, ?)`,
      ).bind(operation.entityId, tenantId, payload.fromTransactionId, payload.toTransactionId),
      env.DB.prepare(
        `INSERT INTO transactions (
          id, tenant_id, account_id, category_id, date, description, amount_minor,
          currency, kind, notes, transfer_group_id, transfer_fee_minor, source_kind,
          revision, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'transfer', ?, ?, ?, 'manual', 1, ?)`,
      ).bind(
        payload.fromTransactionId,
        tenantId,
        fromLeg.accountId,
        payload.transfer.categoryId,
        payload.transfer.date,
        fromLeg.description,
        fromLeg.amountMinor,
        payload.transfer.currency,
        payload.transfer.notes || null,
        operation.entityId,
        fromLeg.transferFeeMinor,
        timestamp,
      ),
      env.DB.prepare(
        `INSERT INTO transactions (
          id, tenant_id, account_id, category_id, date, description, amount_minor,
          currency, kind, notes, transfer_group_id, transfer_fee_minor, source_kind,
          revision, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'transfer', ?, ?, ?, 'manual', 1, ?)`,
      ).bind(
        payload.toTransactionId,
        tenantId,
        toLeg.accountId,
        payload.transfer.categoryId,
        payload.transfer.date,
        toLeg.description,
        toLeg.amountMinor,
        payload.transfer.currency,
        payload.transfer.notes || null,
        operation.entityId,
        toLeg.transferFeeMinor,
        timestamp,
      ),
    );
  } else if (operation.operationType === "update") {
    const snapshot = existing!;
    const [fromLeg, toLeg] = buildTransferLegs(operation.payload.transfer);
    statements.push(
      env.DB.prepare(
        `UPDATE transactions SET account_id = ?, category_id = ?, date = ?, description = ?,
          amount_minor = ?, currency = ?, notes = ?, transfer_fee_minor = ?, revision = ?,
          updated_at = ?
         WHERE id = ? AND tenant_id = ? AND transfer_group_id = ? AND kind = 'transfer'
           AND revision = ?`,
      ).bind(
        fromLeg.accountId,
        operation.payload.transfer.categoryId,
        operation.payload.transfer.date,
        fromLeg.description,
        fromLeg.amountMinor,
        operation.payload.transfer.currency,
        operation.payload.transfer.notes || null,
        fromLeg.transferFeeMinor,
        revision,
        timestamp,
        snapshot.fromTransactionId,
        tenantId,
        operation.entityId,
        operation.baseRevision,
      ),
      env.DB.prepare(
        `UPDATE transactions SET account_id = ?, category_id = ?, date = ?, description = ?,
          amount_minor = ?, currency = ?, notes = ?, transfer_fee_minor = ?, revision = ?,
          updated_at = ?
         WHERE id = ? AND tenant_id = ? AND transfer_group_id = ? AND kind = 'transfer'
           AND revision = ? AND changes() = 1`,
      ).bind(
        toLeg.accountId,
        operation.payload.transfer.categoryId,
        operation.payload.transfer.date,
        toLeg.description,
        toLeg.amountMinor,
        operation.payload.transfer.currency,
        operation.payload.transfer.notes || null,
        toLeg.transferFeeMinor,
        revision,
        timestamp,
        snapshot.toTransactionId,
        tenantId,
        operation.entityId,
        operation.baseRevision,
      ),
    );
  } else {
    const snapshot = existing!;
    statements.push(
      env.DB.prepare(
        `DELETE FROM transactions
         WHERE id = ? AND tenant_id = ? AND transfer_group_id = ? AND revision = ?`,
      ).bind(snapshot.fromTransactionId, tenantId, operation.entityId, operation.baseRevision),
      env.DB.prepare(
        `DELETE FROM transactions
         WHERE id = ? AND tenant_id = ? AND transfer_group_id = ? AND revision = ?
           AND changes() = 1`,
      ).bind(snapshot.toTransactionId, tenantId, operation.entityId, operation.baseRevision),
      env.DB.prepare(
        `DELETE FROM transfer_groups
         WHERE tenant_id = ? AND id = ? AND from_transaction_id = ? AND to_transaction_id = ?
           AND changes() = 1`,
      ).bind(tenantId, operation.entityId, snapshot.fromTransactionId, snapshot.toTransactionId),
    );
  }
  statements.push(
    requiredIdempotencyInsert(env, tenantId, clientId, operation, hash, acknowledged),
  );

  try {
    const batch = await env.DB.batch(statements);
    if (Number(batch.at(-1)?.meta.changes ?? 0) === 1) return acknowledged;
  } catch {
    const replay = await readIdempotency(env, tenantId, clientId, operation.idempotencyKey);
    if (replay) {
      if (replay.requestHash !== hash) {
        throw new HttpError(
          409,
          "idempotency_key_reused",
          "This synchronization key was already used for another operation.",
        );
      }
      return decodeStoredResult(replay);
    }
  }

  current = await readEntitySnapshot(env, tenantId, "transfer", operation.entityId);
  const concurrentCode =
    operation.operationType === "create"
      ? current
        ? "entity_exists"
        : null
      : !current
        ? "entity_missing"
        : current.revision !== operation.baseRevision
          ? "stale_revision"
          : null;
  return persistResult(
    env,
    tenantId,
    clientId,
    operation,
    hash,
    concurrentCode
      ? conflictResult(operation, concurrentCode, current)
      : rejectedResult(
          operation,
          "invalid_operation",
          "The transfer could not be applied atomically.",
        ),
  );
}
