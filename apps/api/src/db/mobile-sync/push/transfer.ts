import {
  buildTransferLegs,
  mobileSyncPushResultSchema,
  mobileSyncTransferSnapshotSchema,
  type MobileSyncPushOperation,
  type MobileSyncPushResult,
  type TransactionInput,
} from "@zoption/shared";

import { HttpError } from "../../../errors";
import type { Bindings } from "../../../types";
import {
  debtPaymentChanges,
  readTransferDebtPayment,
  validateTransactionReferences,
} from "../../transactions";
import { mobileSyncServerTimestamp as serverTimestamp } from "../protocol";
import type { MobileSyncEntitlementReader as EntitlementReader } from "../read";
import {
  appliedOperationGuard,
  persistResult,
  readIdempotency,
  replayedResult,
  requiredIdempotencyInsert,
} from "./idempotency";
import { conflictResult, rejectedResult, revisionConflict } from "./results";
import { transactionReferenceRejection } from "./rules";
import { readEntitySnapshot } from "./snapshots";

type TransferOperation = Extract<MobileSyncPushOperation, { entityType: "transfer" }>;

export async function pushTransferOperation(
  env: Bindings,
  tenantId: string,
  clientId: string,
  operation: TransferOperation,
  hash: string,
  readEntitlement: EntitlementReader,
): Promise<MobileSyncPushResult> {
  let current = await readEntitySnapshot(env, tenantId, "transfer", operation.entityId);
  const conflict = revisionConflict(operation, current);
  if (conflict) {
    return persistResult(
      env,
      tenantId,
      clientId,
      operation,
      hash,
      conflictResult(operation, conflict, current),
    );
  }

  const existing = current ? mobileSyncTransferSnapshotSchema.parse(current) : null;
  const previousPayment = existing
    ? await readTransferDebtPayment(env, tenantId, operation.entityId)
    : null;
  // A client that predates debt links omits debtId. Its edit keeps the stored link while the
  // money still goes to the same account, and drops it once the edit sends it elsewhere.
  const sent = operation.operationType === "delete" ? null : operation.payload.transfer;
  const transfer: Extract<TransactionInput, { kind: "transfer" }> | null = sent && {
    ...sent,
    debtId:
      sent.debtId !== undefined
        ? sent.debtId
        : existing?.toAccountId === sent.toAccountId
          ? (previousPayment?.debtId ?? null)
          : null,
  };
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
        transactionReferenceRejection(operation, error),
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
  const [, receivedLeg] = transfer ? buildTransferLegs(transfer) : [];
  const nextPayment =
    transfer?.debtId && receivedLeg
      ? { debtId: transfer.debtId, amountMinor: receivedLeg.amountMinor }
      : null;
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
          currency, kind, notes, transfer_group_id, transfer_fee_minor, debt_id, source_kind,
          revision, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'transfer', ?, ?, ?, ?, 'manual', 1, ?)`,
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
        nextPayment?.debtId ?? null,
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
          amount_minor = ?, currency = ?, notes = ?, transfer_fee_minor = ?, debt_id = ?,
          revision = ?, updated_at = ?
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
        nextPayment?.debtId ?? null,
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
  const idempotencyIndex = statements.length;
  statements.push(
    requiredIdempotencyInsert(env, tenantId, clientId, operation, hash, acknowledged),
    ...debtPaymentChanges(
      env,
      tenantId,
      previousPayment,
      nextPayment,
      appliedOperationGuard(tenantId, clientId, operation),
    ),
  );

  try {
    const batch = await env.DB.batch(statements);
    if (Number(batch[idempotencyIndex]?.meta.changes ?? 0) === 1) return acknowledged;
  } catch {
    const replay = await readIdempotency(env, tenantId, clientId, operation.idempotencyKey);
    if (replay) return replayedResult(replay, hash);
  }

  current = await readEntitySnapshot(env, tenantId, "transfer", operation.entityId);
  const concurrentCode = revisionConflict(operation, current);
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
