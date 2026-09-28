import {
  interestUpdateSchema,
  mobileSyncAccountSnapshotSchema,
  type MobileSyncPushOperation,
} from "@zoption/shared";

import type { Bindings } from "../../../../types";
import type { EntityMutation } from "../results";
import type { EntitySnapshot } from "../snapshots";

type AccountOperation = Extract<MobileSyncPushOperation, { entityType: "account" }>;

export function accountMutation(
  env: Bindings,
  tenantId: string,
  operation: AccountOperation,
  current: EntitySnapshot | null,
  timestamp: string,
): EntityMutation {
  let mutation: D1PreparedStatement;
  const extraStatements: D1PreparedStatement[] = [];
  if (operation.operationType === "create") {
    const payload = operation.payload;
    const interest = payload.interest;
    const interestColumns =
      interest !== undefined
        ? ", interest_enabled, annual_rate_basis_points, interest_frequency, interest_pay_day"
        : "";
    const binds: unknown[] = [operation.entityId, tenantId, payload.name, payload.type, timestamp];
    if (interest !== undefined) {
      interestUpdateSchema.parse(interest);
      binds.push(
        interest.enabled ? 1 : 0,
        interest.annualRateBasisPoints,
        interest.frequency,
        interest.payDay,
      );
    }
    binds.push(tenantId, payload.name);
    mutation = env.DB.prepare(
      `INSERT INTO accounts (id, tenant_id, name, type, currency, revision, updated_at${interestColumns})
       SELECT ?, ?, ?, ?, 'PHP', 1, ?${interest !== undefined ? ", ?, ?, ?, ?" : ""}
       WHERE NOT EXISTS (
         SELECT 1 FROM accounts WHERE tenant_id = ? AND lower(name) = lower(?)
       )`,
    ).bind(...binds);
  } else if (operation.operationType === "update") {
    const payload = operation.payload;
    const account = mobileSyncAccountSnapshotSchema.parse(current);
    const mergedName = payload.name ?? account.name;
    const interest = payload.interest;
    const interestColumns =
      interest !== undefined
        ? ", interest_enabled = ?, annual_rate_basis_points = ?, interest_frequency = ?, interest_pay_day = ?"
        : "";
    const binds: unknown[] = [mergedName, payload.type ?? account.type, timestamp];
    if (interest !== undefined) {
      interestUpdateSchema.parse(interest);
      binds.push(
        interest.enabled ? 1 : 0,
        interest.annualRateBasisPoints,
        interest.frequency,
        interest.payDay,
      );
    }
    binds.push(
      operation.entityId,
      tenantId,
      operation.baseRevision,
      mergedName,
      tenantId,
      mergedName,
      operation.entityId,
    );
    mutation = env.DB.prepare(
      `UPDATE accounts SET name = ?, type = ?, updated_at = ?${interestColumns}
       WHERE id = ? AND tenant_id = ? AND revision = ?
         AND (system_key IS NULL OR name = ?)
         AND NOT EXISTS (
           SELECT 1 FROM accounts AS other
           WHERE other.tenant_id = ? AND lower(other.name) = lower(?) AND other.id != ?
         )`,
    ).bind(...binds);
  } else {
    mutation = env.DB.prepare(
      `UPDATE accounts SET archived = 1, updated_at = ?
       WHERE id = ? AND tenant_id = ? AND revision = ? AND system_key IS NULL`,
    ).bind(timestamp, operation.entityId, tenantId, operation.baseRevision);
  }
  return { mutation, extraStatements };
}
