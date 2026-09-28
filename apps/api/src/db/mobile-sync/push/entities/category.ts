import { mobileSyncCategorySnapshotSchema, type MobileSyncPushOperation } from "@zoption/shared";

import type { Bindings } from "../../../../types";
import type { EntityMutation } from "../results";
import { EFFECTIVE_PRO_ENTITLEMENT_CONDITION, FREE_CUSTOM_CATEGORY_LIMIT } from "../../../billing";
import type { EntitySnapshot } from "../snapshots";

type CategoryOperation = Extract<MobileSyncPushOperation, { entityType: "category" }>;

export function categoryMutation(
  env: Bindings,
  tenantId: string,
  operation: CategoryOperation,
  current: EntitySnapshot | null,
  timestamp: string,
): EntityMutation {
  let mutation: D1PreparedStatement;
  const extraStatements: D1PreparedStatement[] = [];
  if (operation.operationType === "create") {
    const payload = operation.payload;
    mutation = env.DB.prepare(
      `INSERT INTO categories (
         id, tenant_id, name, kind, color, icon_emoji, origin, required_plan, revision, updated_at
       )
       SELECT ?, ?, ?, ?, ?, ?, 'custom',
         CASE WHEN ${EFFECTIVE_PRO_ENTITLEMENT_CONDITION}
           THEN 'zoption_pro' ELSE 'free' END,
         1, ?
       WHERE NOT EXISTS (
         SELECT 1 FROM categories WHERE tenant_id = ? AND lower(name) = lower(?)
       )
         AND (
           ${EFFECTIVE_PRO_ENTITLEMENT_CONDITION}
           OR (
             SELECT COUNT(*) FROM categories
             WHERE tenant_id = ? AND origin = 'custom'
               AND required_plan = 'free' AND archived = 0
           ) < ?
         )`,
    ).bind(
      operation.entityId,
      tenantId,
      payload.name,
      payload.kind,
      payload.color,
      payload.iconEmoji ?? null,
      tenantId,
      timestamp,
      tenantId,
      payload.name,
      tenantId,
      tenantId,
      FREE_CUSTOM_CATEGORY_LIMIT,
    );
  } else if (operation.operationType === "update") {
    const payload = operation.payload;
    const category = mobileSyncCategorySnapshotSchema.parse(current);
    const restoring = category.archived && payload.archived === false;
    mutation = env.DB.prepare(
      `UPDATE categories
       SET name = ?, color = ?, icon_emoji = ?, archived = ?, updated_at = ?
       WHERE id = ? AND tenant_id = ? AND revision = ? AND system_key IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM categories AS other
           WHERE other.tenant_id = ? AND lower(other.name) = lower(?) AND other.id != ?
         )
         AND (
           ? = 0
           OR (? = 'zoption_pro' AND ${EFFECTIVE_PRO_ENTITLEMENT_CONDITION})
           OR (? = 'free' AND (
             SELECT COUNT(*) FROM categories
             WHERE tenant_id = ? AND origin = 'custom'
               AND required_plan = 'free' AND archived = 0
           ) < ?)
         )`,
    ).bind(
      payload.name ?? category.name,
      payload.color ?? category.color,
      payload.iconEmoji !== undefined ? payload.iconEmoji : category.iconEmoji,
      (payload.archived ?? category.archived) ? 1 : 0,
      timestamp,
      operation.entityId,
      tenantId,
      operation.baseRevision,
      tenantId,
      payload.name ?? category.name,
      operation.entityId,
      restoring ? 1 : 0,
      category.requiredPlan,
      tenantId,
      category.requiredPlan,
      tenantId,
      FREE_CUSTOM_CATEGORY_LIMIT,
    );
  } else {
    mutation = env.DB.prepare(
      `UPDATE categories SET archived = 1, updated_at = ?
       WHERE id = ? AND tenant_id = ? AND revision = ? AND system_key IS NULL`,
    ).bind(timestamp, operation.entityId, tenantId, operation.baseRevision);
  }
  return { mutation, extraStatements };
}
