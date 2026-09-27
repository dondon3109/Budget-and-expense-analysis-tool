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

export async function readEntitySnapshot(
  env: Bindings,
  tenantId: string,
  entityType: MobileSyncPushOperation["entityType"],
  entityId: string,
): Promise<EntitySnapshot | null> {
  const view =
    entityType === "account"
      ? "mobile_sync_account_rows"
      : entityType === "category"
        ? "mobile_sync_category_rows"
        : entityType === "transaction"
          ? "mobile_sync_transaction_rows"
          : entityType === "budget"
            ? "mobile_sync_budget_rows"
            : entityType === "goal"
              ? "mobile_sync_goal_rows"
              : entityType === "debt"
                ? "mobile_sync_debt_rows"
                : entityType === "subscription"
                  ? "mobile_sync_subscription_rows"
                  : entityType === "event"
                    ? "mobile_sync_event_rows"
                    : "mobile_sync_transfer_rows";
  const row = await env.DB.prepare(
    `SELECT payload_json AS payloadJson FROM ${view} WHERE tenant_id = ? AND entity_id = ?`,
  )
    .bind(tenantId, entityId)
    .first<EntitySyncRow>();
  if (!row) return null;
  try {
    const payload = JSON.parse(row.payloadJson) as unknown;
    return entityType === "account"
      ? mobileSyncAccountSnapshotSchema.parse(payload)
      : entityType === "category"
        ? mobileSyncCategorySnapshotSchema.parse(payload)
        : entityType === "transaction"
          ? mobileSyncTransactionSnapshotSchema.parse(payload)
          : entityType === "budget"
            ? mobileSyncBudgetSnapshotSchema.parse(payload)
            : entityType === "goal"
              ? mobileSyncGoalSnapshotSchema.parse(payload)
              : entityType === "debt"
                ? mobileSyncDebtSnapshotSchema.parse(payload)
                : entityType === "subscription"
                  ? mobileSyncSubscriptionSnapshotSchema.parse(payload)
                  : entityType === "event"
                    ? mobileSyncEventSnapshotSchema.parse(payload)
                    : mobileSyncTransferSnapshotSchema.parse(payload);
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
