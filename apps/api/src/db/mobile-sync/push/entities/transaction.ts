import {
  normalizeSignedAmount,
  type MobileSyncPushOperation,
  type TransactionInput,
  type TransactionUpdate,
} from "@zoption/shared";

import type { Bindings } from "../../../../types";
import { debtPaymentChanges, type DebtPayment } from "../../../transactions";
import { appliedOperationGuard } from "../idempotency";
import type { EntityMutation } from "../results";
import type { TransactionSnapshot } from "../snapshots";

type TransactionOperation = Extract<MobileSyncPushOperation, { entityType: "transaction" }>;

export type NonTransferTransactionInput = Extract<TransactionInput, { kind: "income" | "expense" }>;

/** `currentDebtId` is the stored link; an update that omits `debtId` keeps it. */
export function updateInput(
  payload: TransactionUpdate,
  current: TransactionSnapshot,
  currentDebtId: string | null,
): NonTransferTransactionInput | null {
  if (current.kind === "transfer" || current.transferGroupId || payload.kind === "transfer") {
    return null;
  }
  const accountId = payload.accountId ?? current.accountId;
  if (!accountId) return null;
  const kind = payload.kind ?? current.kind;
  const debtId = payload.debtId === undefined ? currentDebtId : payload.debtId;
  return {
    ...(kind === "expense" ? { debtId } : {}),
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

function debtPayment(transaction: NonTransferTransactionInput | null): DebtPayment {
  if (transaction?.kind !== "expense" || !transaction.debtId) return null;
  return { debtId: transaction.debtId, amountMinor: transaction.amountMinor };
}

/**
 * `previousPayment` is the debt payment the stored row makes, so an update or delete gives it
 * back. The debt writes ride in `extraStatements` behind the operation's idempotency row.
 */
export function transactionMutation(
  env: Bindings,
  tenantId: string,
  clientId: string,
  operation: TransactionOperation,
  transaction: NonTransferTransactionInput | null,
  previousPayment: DebtPayment,
  revision: number,
  timestamp: string,
): EntityMutation {
  const next = operation.operationType === "delete" ? null : debtPayment(transaction);
  const extraStatements = debtPaymentChanges(
    env,
    tenantId,
    previousPayment,
    next,
    appliedOperationGuard(tenantId, clientId, operation),
  );
  if (operation.operationType === "create" && transaction) {
    const mutation = env.DB.prepare(
      `INSERT INTO transactions (
        id, tenant_id, account_id, category_id, date, description, amount_minor,
        currency, kind, notes, debt_id, source_kind, revision, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', 1, ?)`,
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
      next?.debtId ?? null,
      timestamp,
    );
    return { mutation, extraStatements };
  }
  if (operation.operationType === "update" && transaction) {
    const mutation = env.DB.prepare(
      `UPDATE transactions SET
        account_id = ?, category_id = ?, date = ?, description = ?, amount_minor = ?,
        currency = ?, kind = ?, notes = ?, debt_id = ?, revision = ?, updated_at = ?
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
      next?.debtId ?? null,
      revision,
      timestamp,
      operation.entityId,
      tenantId,
      operation.baseRevision,
    );
    return { mutation, extraStatements };
  }
  const mutation = env.DB.prepare(
    "DELETE FROM transactions WHERE id = ? AND tenant_id = ? AND revision = ?",
  ).bind(operation.entityId, tenantId, operation.baseRevision);
  return { mutation, extraStatements };
}
