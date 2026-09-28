import { mobileSyncDebtSnapshotSchema, type MobileSyncPushOperation } from "@zoption/shared";

import type { Bindings } from "../../../../types";
import type { EntityMutation } from "../results";
import type { EntitySnapshot } from "../snapshots";

type DebtOperation = Extract<MobileSyncPushOperation, { entityType: "debt" }>;

export function debtMutation(
  env: Bindings,
  tenantId: string,
  operation: DebtOperation,
  current: EntitySnapshot | null,
  timestamp: string,
): EntityMutation {
  let mutation: D1PreparedStatement;
  const extraStatements: D1PreparedStatement[] = [];
  if (operation.operationType === "create") {
    const payload = operation.payload;
    mutation = env.DB.prepare(
      `INSERT INTO debts (
         id, tenant_id, name, type, balance_minor, apr_basis_points,
         minimum_payment_minor, balance_as_of, status, revision, updated_at
       )
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?
       WHERE NOT EXISTS (
         SELECT 1 FROM debts WHERE tenant_id = ? AND lower(name) = lower(?)
       )`,
    ).bind(
      operation.entityId,
      tenantId,
      payload.name,
      payload.type,
      payload.balanceMinor,
      payload.aprBasisPoints,
      payload.minimumPaymentMinor,
      payload.balanceAsOf,
      payload.status,
      timestamp,
      tenantId,
      payload.name,
    );
  } else if (operation.operationType === "update") {
    const payload = operation.payload;
    const debt = mobileSyncDebtSnapshotSchema.parse(current);
    mutation = env.DB.prepare(
      `UPDATE debts SET
         name = ?, type = ?, balance_minor = ?, apr_basis_points = ?,
         minimum_payment_minor = ?, balance_as_of = ?, status = ?, updated_at = ?
       WHERE id = ? AND tenant_id = ? AND revision = ?
         AND NOT EXISTS (
           SELECT 1 FROM debts AS other
           WHERE other.tenant_id = ? AND lower(other.name) = lower(?) AND other.id != ?
         )`,
    ).bind(
      payload.name ?? debt.name,
      payload.type ?? debt.type,
      payload.balanceMinor ?? debt.balanceMinor,
      payload.aprBasisPoints ?? debt.aprBasisPoints,
      payload.minimumPaymentMinor ?? debt.minimumPaymentMinor,
      payload.balanceAsOf ?? debt.balanceAsOf,
      payload.status ?? debt.status,
      timestamp,
      operation.entityId,
      tenantId,
      operation.baseRevision,
      tenantId,
      payload.name ?? debt.name,
      operation.entityId,
    );
  } else {
    mutation = env.DB.prepare(
      `DELETE FROM debts WHERE id = ? AND tenant_id = ? AND revision = ?`,
    ).bind(operation.entityId, tenantId, operation.baseRevision);
  }
  return { mutation, extraStatements };
}
