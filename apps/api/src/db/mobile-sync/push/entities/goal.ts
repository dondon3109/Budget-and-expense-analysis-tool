import { mobileSyncGoalSnapshotSchema, type MobileSyncPushOperation } from "@zoption/shared";

import type { Bindings } from "../../../../types";
import type { EntityMutation } from "../results";
import type { EntitySnapshot } from "../snapshots";

type GoalOperation = Extract<MobileSyncPushOperation, { entityType: "goal" }>;

export function goalMutation(
  env: Bindings,
  tenantId: string,
  operation: GoalOperation,
  current: EntitySnapshot | null,
  timestamp: string,
): EntityMutation {
  let mutation: D1PreparedStatement;
  const extraStatements: D1PreparedStatement[] = [];
  if (operation.operationType === "create") {
    const payload = operation.payload;
    mutation = env.DB.prepare(
      `INSERT INTO financial_goals (
         id, tenant_id, name, target_amount_minor, current_amount_minor,
         target_date, status, revision, updated_at
       )
       SELECT ?, ?, ?, ?, ?, ?, ?, 1, ?
       WHERE NOT EXISTS (
         SELECT 1 FROM financial_goals WHERE tenant_id = ? AND lower(name) = lower(?)
       )`,
    ).bind(
      operation.entityId,
      tenantId,
      payload.name,
      payload.targetAmountMinor,
      payload.currentAmountMinor,
      payload.targetDate,
      payload.status,
      timestamp,
      tenantId,
      payload.name,
    );
  } else if (operation.operationType === "update") {
    const payload = operation.payload;
    const goal = mobileSyncGoalSnapshotSchema.parse(current);
    mutation = env.DB.prepare(
      `UPDATE financial_goals SET
         name = ?, target_amount_minor = ?, current_amount_minor = ?,
         target_date = ?, status = ?, updated_at = ?
       WHERE id = ? AND tenant_id = ? AND revision = ?
         AND NOT EXISTS (
           SELECT 1 FROM financial_goals AS other
           WHERE other.tenant_id = ? AND lower(other.name) = lower(?) AND other.id != ?
         )`,
    ).bind(
      payload.name ?? goal.name,
      payload.targetAmountMinor ?? goal.targetAmountMinor,
      payload.currentAmountMinor ?? goal.currentAmountMinor,
      payload.targetDate ?? goal.targetDate,
      payload.status ?? goal.status,
      timestamp,
      operation.entityId,
      tenantId,
      operation.baseRevision,
      tenantId,
      payload.name ?? goal.name,
      operation.entityId,
    );
  } else {
    mutation = env.DB.prepare(
      `DELETE FROM financial_goals WHERE id = ? AND tenant_id = ? AND revision = ?`,
    ).bind(operation.entityId, tenantId, operation.baseRevision);
  }
  return { mutation, extraStatements };
}
