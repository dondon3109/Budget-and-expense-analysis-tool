import {
  interestUpdateSchema,
  mobileSyncAccountSnapshotSchema,
  mobileSyncGoalSnapshotSchema,
  mobileSyncRemittanceSnapshotSchema,
  type MobileSyncPushOperation,
  type MobileSyncPushResult,
} from "@zoption/shared";

import { HttpError } from "../../../errors";
import type { Bindings } from "../../../types";
import { isCategoryPlanAvailable, readTier } from "../../../billing/entitlements";
import { getCustomCategoryAllowance } from "../../billing-usage";
import type { MobileSyncEntitlementReader as EntitlementReader } from "../read";
import { rejectedResult } from "./results";
import {
  storedCategorySnapshotSchema,
  type AccountSnapshot,
  type CategorySnapshot,
  type EntitySnapshot,
} from "./snapshots";

function nameTable(entityType: "account" | "category" | "goal" | "debt"): string {
  switch (entityType) {
    case "account":
      return "accounts";
    case "category":
      return "categories";
    case "goal":
      return "financial_goals";
    case "debt":
      return "debts";
  }
}

export async function hasNameConflict(
  env: Bindings,
  tenantId: string,
  entityType: "account" | "category" | "goal" | "debt",
  name: string,
  excludeId?: string,
): Promise<boolean> {
  const row = await env.DB.prepare(
    `SELECT id FROM ${nameTable(entityType)}
     WHERE tenant_id = ? AND lower(name) = lower(?)${excludeId ? " AND id != ?" : ""}
     LIMIT 1`,
  )
    .bind(tenantId, name, ...(excludeId ? [excludeId] : []))
    .first<{ id: string }>();
  return Boolean(row);
}

export async function validateBudgetCategory(
  env: Bindings,
  tenantId: string,
  categoryId: string,
): Promise<boolean> {
  const row = await env.DB.prepare(
    `SELECT id FROM categories
     WHERE tenant_id = ? AND id = ? AND kind = 'expense' AND archived = 0
     LIMIT 1`,
  )
    .bind(tenantId, categoryId)
    .first<{ id: string }>();
  return Boolean(row);
}

export async function validateSubscriptionReferences(
  env: Bindings,
  tenantId: string,
  categoryId: string,
  accountId: string,
  readEntitlement: EntitlementReader,
): Promise<void> {
  const category = await env.DB.prepare(
    `SELECT kind, archived, required_plan AS requiredPlan
     FROM categories WHERE tenant_id = ? AND id = ? LIMIT 1`,
  )
    .bind(tenantId, categoryId)
    .first<{ kind: string; archived: number; requiredPlan: string }>();
  if (!category || category.archived === 1 || category.kind !== "expense") {
    throw new HttpError(400, "invalid_subscription_category", "Choose an active expense category.");
  }
  if (!isCategoryPlanAvailable(category.requiredPlan, await readEntitlement(env, tenantId))) {
    throw new HttpError(
      403,
      "category_requires_pro",
      "This category needs a higher plan. Upgrade or archive other categories to use it.",
    );
  }
  const account = await env.DB.prepare(
    "SELECT id FROM accounts WHERE tenant_id = ? AND id = ? AND archived = 0 LIMIT 1",
  )
    .bind(tenantId, accountId)
    .first<{ id: string }>();
  if (!account) {
    throw new HttpError(400, "invalid_account", "Choose an active account.");
  }
}

/** How many more custom categories the tenant's tier allows; null when unlimited. */
export async function remainingCustomCategorySlots(
  env: Bindings,
  tenantId: string,
): Promise<number | null> {
  const allowance = await getCustomCategoryAllowance(env, tenantId);
  return allowance.limit === null ? null : Math.max(0, allowance.limit - allowance.used);
}

export async function businessRejection(
  env: Bindings,
  tenantId: string,
  operation: MobileSyncPushOperation,
  current: EntitySnapshot | null,
): Promise<MobileSyncPushResult | null> {
  if (
    operation.entityType === "transaction" ||
    operation.entityType === "transfer" ||
    operation.entityType === "budget" ||
    operation.entityType === "subscription"
  ) {
    return null;
  }

  if (operation.entityType === "goal") {
    const goal = current ? mobileSyncGoalSnapshotSchema.parse(current) : null;
    const name = operation.operationType === "delete" ? null : operation.payload.name;
    if (
      name &&
      (await hasNameConflict(
        env,
        tenantId,
        "goal",
        name,
        operation.operationType === "create" ? undefined : operation.entityId,
      ))
    ) {
      return rejectedResult(
        operation,
        "invalid_operation",
        "A goal with that name already exists.",
      );
    }
    if (operation.operationType === "update" && goal) {
      const targetAmountMinor = operation.payload.targetAmountMinor ?? goal.targetAmountMinor;
      const currentAmountMinor = operation.payload.currentAmountMinor ?? goal.currentAmountMinor;
      if (currentAmountMinor > targetAmountMinor) {
        return rejectedResult(
          operation,
          "invalid_operation",
          "Current savings cannot exceed the target amount.",
        );
      }
    }
    return null;
  }

  if (operation.entityType === "event") {
    return null;
  }

  if (operation.entityType === "remittance") {
    const stored = current ? mobileSyncRemittanceSnapshotSchema.parse(current) : null;
    if (operation.operationType === "delete" && stored?.transactionId) {
      return rejectedResult(
        operation,
        "invalid_operation",
        "Only a send that has not arrived can be cancelled.",
      );
    }
    return null;
  }

  if (operation.entityType === "debt") {
    const name = operation.operationType === "delete" ? null : operation.payload.name;
    if (
      name &&
      (await hasNameConflict(
        env,
        tenantId,
        "debt",
        name,
        operation.operationType === "create" ? undefined : operation.entityId,
      ))
    ) {
      return rejectedResult(
        operation,
        "invalid_operation",
        "A debt with that name already exists.",
      );
    }
    return null;
  }

  const existing =
    operation.entityType === "account"
      ? current && mobileSyncAccountSnapshotSchema.parse(current)
      : current && storedCategorySnapshotSchema.parse(current);
  const name = operation.operationType === "delete" ? null : operation.payload.name;
  if (
    name &&
    (await hasNameConflict(
      env,
      tenantId,
      operation.entityType,
      name,
      operation.operationType === "create" ? undefined : operation.entityId,
    ))
  ) {
    return rejectedResult(
      operation,
      "invalid_operation",
      `A ${operation.entityType} with that name already exists.`,
    );
  }

  if (existing?.system) {
    const changingProtectedAccountName =
      operation.entityType === "account" &&
      operation.operationType === "update" &&
      operation.payload.name !== existing.name;
    if (
      operation.operationType === "delete" ||
      operation.entityType === "category" ||
      changingProtectedAccountName
    ) {
      return rejectedResult(
        operation,
        "invalid_operation",
        `This permanent ${operation.entityType} cannot be changed that way.`,
      );
    }
  }

  if (operation.entityType === "account" && operation.operationType !== "delete") {
    const account = existing as AccountSnapshot | null;
    if (operation.payload.interest !== undefined) {
      const interest = interestUpdateSchema.parse(operation.payload.interest);
      const mergedType = operation.payload.type ?? account?.type;
      if (mergedType !== "savings") {
        return rejectedResult(
          operation,
          "invalid_operation",
          "Only savings accounts earn interest.",
        );
      }
      if (interest.enabled && (await readTier(env, tenantId)) === "free") {
        return rejectedResult(
          operation,
          "plan_limit",
          "Automatic interest needs Zoption Budget or Pro.",
        );
      }
    }
  }

  if (operation.entityType !== "category") return null;
  const category = existing as CategorySnapshot | null;
  const restoring =
    operation.operationType === "update" &&
    category?.archived === true &&
    operation.payload.archived === false;
  if (operation.operationType !== "create" && !restoring) return null;
  // Creating or restoring takes a slot from the tier's custom category limit.
  if ((await remainingCustomCategorySlots(env, tenantId)) === 0) {
    return rejectedResult(operation, "plan_limit", "You have reached your custom category limit.");
  }
  return null;
}

/** Maps a `validateTransactionReferences` failure for a transaction or transfer to a rejection. */
export function transactionReferenceRejection(
  operation: MobileSyncPushOperation,
  error: HttpError,
): MobileSyncPushResult {
  switch (error.code) {
    case "invalid_category":
    case "category_kind_mismatch":
      return rejectedResult(operation, "invalid_category", error.message);
    case "invalid_account":
      return rejectedResult(operation, "invalid_account", error.message);
    case "category_requires_pro":
      return rejectedResult(operation, "plan_limit", error.message);
    default:
      return rejectedResult(operation, "invalid_operation", error.message);
  }
}

/** Maps a `validateSubscriptionReferences` failure to a rejection. */
export function subscriptionReferenceRejection(
  operation: MobileSyncPushOperation,
  error: HttpError,
): MobileSyncPushResult {
  switch (error.code) {
    case "invalid_subscription_category":
      return rejectedResult(operation, "invalid_category", error.message);
    case "invalid_account":
      return rejectedResult(operation, "invalid_account", error.message);
    case "category_requires_pro":
      return rejectedResult(operation, "plan_limit", error.message);
    default:
      return rejectedResult(operation, "invalid_operation", error.message);
  }
}
