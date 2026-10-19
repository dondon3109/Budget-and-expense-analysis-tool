import type { MobileSyncPushOperation } from "@zoption/shared";

import {
  categoryPlanRankSql,
  EFFECTIVE_TIER_RANK_SQL,
  NEXT_CUSTOM_CATEGORY_PLAN_SQL,
} from "../../../../billing/entitlements";
import type { Bindings } from "../../../../types";
import type { EntityMutation } from "../results";
import { storedCategorySnapshotSchema, type EntitySnapshot } from "../snapshots";

/** A new or restored category's tag must be one the tenant's tier covers. */
const NEXT_PLAN_FITS_TIER_SQL = `${categoryPlanRankSql(
  `(${NEXT_CUSTOM_CATEGORY_PLAN_SQL})`,
)} <= ${EFFECTIVE_TIER_RANK_SQL}`;

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
       SELECT ?, ?, ?, ?, ?, ?, 'custom', ${NEXT_CUSTOM_CATEGORY_PLAN_SQL}, 1, ?
       WHERE NOT EXISTS (
         SELECT 1 FROM categories WHERE tenant_id = ? AND lower(name) = lower(?)
       )
         AND ${NEXT_PLAN_FITS_TIER_SQL}`,
    ).bind(
      operation.entityId,
      tenantId,
      payload.name,
      payload.kind,
      payload.color,
      payload.iconEmoji ?? null,
      tenantId,
      tenantId,
      timestamp,
      tenantId,
      payload.name,
      tenantId,
      tenantId,
      tenantId,
    );
  } else if (operation.operationType === "update") {
    const payload = operation.payload;
    const category = storedCategorySnapshotSchema.parse(current);
    const restoring = category.archived && payload.archived === false;
    // Restoring takes a fresh slot, tagged like a new category, so it must fit the tier.
    mutation = env.DB.prepare(
      `UPDATE categories
       SET name = ?, color = ?, icon_emoji = ?, archived = ?, updated_at = ?,
           required_plan = CASE WHEN ? = 1 THEN ${NEXT_CUSTOM_CATEGORY_PLAN_SQL}
             ELSE required_plan END
       WHERE id = ? AND tenant_id = ? AND revision = ? AND system_key IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM categories AS other
           WHERE other.tenant_id = ? AND lower(other.name) = lower(?) AND other.id != ?
         )
         AND (? = 0 OR ${NEXT_PLAN_FITS_TIER_SQL})`,
    ).bind(
      payload.name ?? category.name,
      payload.color ?? category.color,
      payload.iconEmoji !== undefined ? payload.iconEmoji : category.iconEmoji,
      (payload.archived ?? category.archived) ? 1 : 0,
      timestamp,
      restoring ? 1 : 0,
      tenantId,
      tenantId,
      operation.entityId,
      tenantId,
      operation.baseRevision,
      tenantId,
      payload.name ?? category.name,
      operation.entityId,
      restoring ? 1 : 0,
      tenantId,
      tenantId,
      tenantId,
    );
  } else {
    mutation = env.DB.prepare(
      `UPDATE categories SET archived = 1, updated_at = ?
       WHERE id = ? AND tenant_id = ? AND revision = ? AND system_key IS NULL`,
    ).bind(timestamp, operation.entityId, tenantId, operation.baseRevision);
  }
  return { mutation, extraStatements };
}
