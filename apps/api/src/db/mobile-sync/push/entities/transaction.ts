import {
  normalizeSignedAmount,
  type MobileSyncPushOperation,
  type TransactionInput,
  type TransactionUpdate,
} from "@zoption/shared";

import type { Bindings } from "../../../../types";
import type { EntityMutation } from "../results";
import type { TransactionSnapshot } from "../snapshots";

type TransactionOperation = Extract<MobileSyncPushOperation, { entityType: "transaction" }>;

export type NonTransferTransactionInput = Extract<TransactionInput, { kind: "income" | "expense" }>;

export function updateInput(
  payload: TransactionUpdate,
  current: TransactionSnapshot,
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

export function transactionMutation(
  env: Bindings,
  tenantId: string,
  operation: TransactionOperation,
  transaction: NonTransferTransactionInput | null,
  revision: number,
  timestamp: string,
): EntityMutation {
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
  return { mutation, extraStatements: [] };
}
