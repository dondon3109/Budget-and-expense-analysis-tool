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
    // An occasion's rows are stored under its own period key, so the month and every-month
    // unique index also keeps one limit per category per occasion.
    const occasionId = payload.occasionId ?? null;
    const period = occasionId ? `occasion:${occasionId}` : payload.month;
    mutation = env.DB.prepare(
      `INSERT INTO budgets (
         id, tenant_id, category_id, month, occasion_id, limit_minor, revision, updated_at
       )
       SELECT ?, ?, ?, ?, ?, ?, 1, ?
       WHERE NOT EXISTS (
         SELECT 1 FROM budgets WHERE tenant_id = ? AND month = ? AND category_id = ?
       )`,
    ).bind(
      operation.entityId,
      tenantId,
      payload.categoryId,
      period,
      occasionId,
      payload.limitMinor,
      timestamp,
      tenantId,
      period,
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
