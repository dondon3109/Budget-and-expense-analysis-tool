import {
  mobileSyncAccountSnapshotSchema,
  mobileSyncBudgetSnapshotSchema,
  mobileSyncCategorySnapshotSchema,
  mobileSyncDebtSnapshotSchema,
  mobileSyncEventSnapshotSchema,
  mobileSyncGoalSnapshotSchema,
  mobileSyncSubscriptionSnapshotSchema,
  mobileSyncTransactionSnapshotSchema,
  mobileSyncTransferSnapshotSchema,
  type MobileSyncPushOperation,
} from "@zoption/shared";

import type { Bindings } from "../../../types";

interface EntitySyncRow {
  payloadJson: string;
}

export type AccountSnapshot = ReturnType<typeof mobileSyncAccountSnapshotSchema.parse>;
export type CategorySnapshot = ReturnType<typeof mobileSyncCategorySnapshotSchema.parse>;
export type TransactionSnapshot = ReturnType<typeof mobileSyncTransactionSnapshotSchema.parse>;
export type TransferSnapshot = ReturnType<typeof mobileSyncTransferSnapshotSchema.parse>;
export type BudgetSnapshot = ReturnType<typeof mobileSyncBudgetSnapshotSchema.parse>;
export type GoalSnapshot = ReturnType<typeof mobileSyncGoalSnapshotSchema.parse>;
export type DebtSnapshot = ReturnType<typeof mobileSyncDebtSnapshotSchema.parse>;
export type SubscriptionSnapshot = ReturnType<typeof mobileSyncSubscriptionSnapshotSchema.parse>;
export type EventSnapshot = ReturnType<typeof mobileSyncEventSnapshotSchema.parse>;
export type EntitySnapshot =
  | AccountSnapshot
  | CategorySnapshot
  | TransactionSnapshot
  | TransferSnapshot
  | BudgetSnapshot
  | GoalSnapshot
  | DebtSnapshot
  | SubscriptionSnapshot
  | EventSnapshot;

export function withCategoryLock(
  snapshot: EntitySnapshot | null,
  hasPro: boolean,
): EntitySnapshot | null {
  const category = mobileSyncCategorySnapshotSchema.safeParse(snapshot);
  return category.success
    ? {
        ...category.data,
        locked: category.data.requiredPlan === "zoption_pro" && !hasPro,
      }
    : snapshot;
}

type EntityType = MobileSyncPushOperation["entityType"];

/** The view that renders an entity's rows as sync payloads. */
function snapshotView(entityType: EntityType): string {
  switch (entityType) {
    case "account":
      return "mobile_sync_account_rows";
    case "category":
      return "mobile_sync_category_rows";
    case "transaction":
      return "mobile_sync_transaction_rows";
    case "budget":
      return "mobile_sync_budget_rows";
    case "goal":
      return "mobile_sync_goal_rows";
    case "debt":
      return "mobile_sync_debt_rows";
    case "subscription":
      return "mobile_sync_subscription_rows";
    case "event":
      return "mobile_sync_event_rows";
    case "transfer":
      return "mobile_sync_transfer_rows";
  }
}

function parseSnapshot(entityType: EntityType, payload: unknown): EntitySnapshot {
  switch (entityType) {
    case "account":
      return mobileSyncAccountSnapshotSchema.parse(payload);
    case "category":
      return mobileSyncCategorySnapshotSchema.parse(payload);
    case "transaction":
      return mobileSyncTransactionSnapshotSchema.parse(payload);
    case "budget":
      return mobileSyncBudgetSnapshotSchema.parse(payload);
    case "goal":
      return mobileSyncGoalSnapshotSchema.parse(payload);
    case "debt":
      return mobileSyncDebtSnapshotSchema.parse(payload);
    case "subscription":
      return mobileSyncSubscriptionSnapshotSchema.parse(payload);
    case "event":
      return mobileSyncEventSnapshotSchema.parse(payload);
    case "transfer":
      return mobileSyncTransferSnapshotSchema.parse(payload);
  }
}

export async function readEntitySnapshot(
  env: Bindings,
  tenantId: string,
  entityType: EntityType,
  entityId: string,
): Promise<EntitySnapshot | null> {
  const view = snapshotView(entityType);
  const row = await env.DB.prepare(
    `SELECT payload_json AS payloadJson FROM ${view} WHERE tenant_id = ? AND entity_id = ?`,
  )
    .bind(tenantId, entityId)
    .first<EntitySyncRow>();
  if (!row) return null;
  try {
    return parseSnapshot(entityType, JSON.parse(row.payloadJson) as unknown);
  } catch {
    throw new Error("Stored mobile synchronization entity failed validation.");
  }
}

export async function readBudgetByMonthCategory(
  env: Bindings,
  tenantId: string,
  month: string,
  categoryId: string,
): Promise<BudgetSnapshot | null> {
  const row = await env.DB.prepare(
    `SELECT payload_json AS payloadJson
     FROM mobile_sync_budget_rows
     WHERE tenant_id = ? AND json_extract(payload_json, '$.month') = ?
       AND json_extract(payload_json, '$.categoryId') = ?
     LIMIT 1`,
  )
    .bind(tenantId, month, categoryId)
    .first<EntitySyncRow>();
  if (!row) return null;
  try {
    return mobileSyncBudgetSnapshotSchema.parse(JSON.parse(row.payloadJson) as unknown);
  } catch {
    throw new Error("Stored mobile synchronization entity failed validation.");
  }
}
