import {
  mobileSyncAccountSnapshotSchema,
  mobileSyncBudgetSnapshotSchema,
  mobileSyncCategorySnapshotSchema,
  mobileSyncDebtSnapshotSchema,
  mobileSyncEventSnapshotSchema,
  mobileSyncGoalSnapshotSchema,
  mobileSyncRemittanceSnapshotSchema,
  mobileSyncSubscriptionSnapshotSchema,
  mobileSyncTransactionSnapshotSchema,
  mobileSyncTransferSnapshotSchema,
  type BillingTier,
  type MobileSyncPushOperation,
  type MobileSyncPushResult,
} from "@zoption/shared";
import { z } from "zod";

import { isCategoryPlanAvailable, wireCategoryPlan } from "../../../billing/entitlements";
import type { Bindings } from "../../../types";

interface EntitySyncRow {
  payloadJson: string;
}

export type AccountSnapshot = ReturnType<typeof mobileSyncAccountSnapshotSchema.parse>;
/**
 * A category as stored. Its tag may be `zoption_budget`, which only the server sees:
 * `withCategoryLock` turns it into the wire value and a `locked` flag before it leaves.
 */
export const storedCategorySnapshotSchema = mobileSyncCategorySnapshotSchema.extend({
  requiredPlan: z.enum(["free", "zoption_budget", "zoption_pro"]),
});
export type CategorySnapshot = z.infer<typeof storedCategorySnapshotSchema>;
export type TransactionSnapshot = ReturnType<typeof mobileSyncTransactionSnapshotSchema.parse>;
export type TransferSnapshot = ReturnType<typeof mobileSyncTransferSnapshotSchema.parse>;
export type BudgetSnapshot = ReturnType<typeof mobileSyncBudgetSnapshotSchema.parse>;
export type GoalSnapshot = ReturnType<typeof mobileSyncGoalSnapshotSchema.parse>;
export type DebtSnapshot = ReturnType<typeof mobileSyncDebtSnapshotSchema.parse>;
export type SubscriptionSnapshot = ReturnType<typeof mobileSyncSubscriptionSnapshotSchema.parse>;
export type EventSnapshot = ReturnType<typeof mobileSyncEventSnapshotSchema.parse>;
export type RemittanceSnapshot = ReturnType<typeof mobileSyncRemittanceSnapshotSchema.parse>;
export type EntitySnapshot =
  | AccountSnapshot
  | CategorySnapshot
  | TransactionSnapshot
  | TransferSnapshot
  | BudgetSnapshot
  | GoalSnapshot
  | DebtSnapshot
  | SubscriptionSnapshot
  | EventSnapshot
  | RemittanceSnapshot;

export function withCategoryLock(
  snapshot: EntitySnapshot | null,
  tier: BillingTier,
): EntitySnapshot | null {
  const category = storedCategorySnapshotSchema.safeParse(snapshot);
  return category.success
    ? {
        ...category.data,
        requiredPlan: wireCategoryPlan(category.data.requiredPlan),
        locked: !isCategoryPlanAvailable(category.data.requiredPlan, tier),
      }
    : snapshot;
}

/** A snapshot as clients may see it: a stored Budget tag goes out as its wire value. */
export function wireSnapshot(
  snapshot: EntitySnapshot | null,
): Extract<MobileSyncPushResult, { status: "conflict" }>["serverPayload"] {
  const category = storedCategorySnapshotSchema.safeParse(snapshot);
  if (!category.success) {
    return snapshot as Extract<MobileSyncPushResult, { status: "conflict" }>["serverPayload"];
  }
  return { ...category.data, requiredPlan: wireCategoryPlan(category.data.requiredPlan) };
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
    case "remittance":
      return "mobile_sync_remittance_rows";
  }
}

function parseSnapshot(entityType: EntityType, payload: unknown): EntitySnapshot {
  switch (entityType) {
    case "account":
      return mobileSyncAccountSnapshotSchema.parse(payload);
    case "category":
      return storedCategorySnapshotSchema.parse(payload);
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
    case "remittance":
      return mobileSyncRemittanceSnapshotSchema.parse(payload);
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

/** Finds the budget of one category in one period: a month, every month, or an occasion. */
export async function readBudgetByPeriodCategory(
  env: Bindings,
  tenantId: string,
  period: { month: string; occasionId: string | null },
  categoryId: string,
): Promise<BudgetSnapshot | null> {
  const row = await env.DB.prepare(
    `SELECT payload_json AS payloadJson
     FROM mobile_sync_budget_rows
     WHERE tenant_id = ? AND json_extract(payload_json, '$.month') = ?
       AND json_extract(payload_json, '$.occasionId') IS ?
       AND json_extract(payload_json, '$.categoryId') = ?
     LIMIT 1`,
  )
    .bind(tenantId, period.month, period.occasionId, categoryId)
    .first<EntitySyncRow>();
  if (!row) return null;
  try {
    return mobileSyncBudgetSnapshotSchema.parse(JSON.parse(row.payloadJson) as unknown);
  } catch {
    throw new Error("Stored mobile synchronization entity failed validation.");
  }
}
