import { type MobileSyncPushOperation } from "@zoption/shared";

import type { Bindings } from "../../../../types";
import type { EntityMutation } from "../results";

type BudgetOperation = Extract<MobileSyncPushOperation, { entityType: "budget" }>;

export function budgetMutation(
  env: Bindings,
  tenantId: string,
  operation: BudgetOperation,
  timestamp: string,
): EntityMutation {
  let mutation: D1PreparedStatement;
  const extraStatements: D1PreparedStatement[] = [];
  if (operation.operationType === "create") {
    const payload = operation.payload;
    mutation = env.DB.prepare(
      `INSERT INTO budgets (id, tenant_id, category_id, month, limit_minor, revision, updated_at)
       SELECT ?, ?, ?, ?, ?, 1, ?
       WHERE NOT EXISTS (
         SELECT 1 FROM budgets WHERE tenant_id = ? AND month = ? AND category_id = ?
       )`,
    ).bind(
      operation.entityId,
      tenantId,
      payload.categoryId,
      payload.month,
      payload.limitMinor,
      timestamp,
      tenantId,
      payload.month,
      payload.categoryId,
    );
  } else {
    const payload = operation.payload;
    mutation = env.DB.prepare(
      `UPDATE budgets SET limit_minor = ?, updated_at = ?
       WHERE id = ? AND tenant_id = ? AND revision = ?`,
    ).bind(payload.limitMinor, timestamp, operation.entityId, tenantId, operation.baseRevision);
  }
  return { mutation, extraStatements };
}
