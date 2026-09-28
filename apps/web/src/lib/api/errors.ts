import type { BillingCapability, BillingFeature, BillingResource } from "@zoption/shared";

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

export interface UsageLimitReachedDetails {
  feature: BillingFeature;
  used: number;
  limit: number;
  periodKind?: "calendar_month";
  periodStartedAt?: string | null;
  resetsAt: string | null;
  billingPath?: string;
}

export interface ResourceLimitReachedDetails {
  resource: BillingResource;
  used: number;
  limit: number;
  billingPath?: string;
}

export interface UpgradeRequiredDetails {
  capability: BillingCapability;
}

const billingFeatures = new Set<BillingFeature>(["ai_usage", "file_import"]);
const billingResources = new Set<BillingResource>(["custom_category"]);
const billingCapabilities = new Set<BillingCapability>([
  "ai_usage",
  "file_import",
  "category_management",
  "account_management",
  "cashflow_analytics",
  "transaction_export",
]);

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function apiErrorPayload(value: unknown): {
  error?: string;
  message?: string;
  details?: unknown;
} {
  if (!isRecord(value)) return {};
  return {
    error: typeof value.error === "string" ? value.error : undefined,
    message: typeof value.message === "string" ? value.message : undefined,
    ...(Object.hasOwn(value, "details") ? { details: value.details } : {}),
  };
}

export function isApiRequestError(error: unknown): error is ApiRequestError {
  return error instanceof ApiRequestError;
}

export function isUsageLimitReachedError(
  error: unknown,
): error is ApiRequestError & { details: UsageLimitReachedDetails } {
  if (!isApiRequestError(error) || error.code !== "monthly_limit_reached") {
    return false;
  }
  if (!isRecord(error.details)) return false;
  const periodKind = error.details.periodKind;
  const periodStartedAt = error.details.periodStartedAt;
  const resetsAt = error.details.resetsAt;
  return (
    typeof error.details.feature === "string" &&
    billingFeatures.has(error.details.feature as BillingFeature) &&
    typeof error.details.used === "number" &&
    Number.isFinite(error.details.used) &&
    error.details.used >= 0 &&
    typeof error.details.limit === "number" &&
    Number.isFinite(error.details.limit) &&
    error.details.limit >= 0 &&
    (periodKind === undefined || periodKind === "calendar_month") &&
    (periodStartedAt === undefined ||
      periodStartedAt === null ||
      typeof periodStartedAt === "string") &&
    (resetsAt === null || typeof resetsAt === "string")
  );
}

export function isMonthlyLimitReachedError(
  error: unknown,
): error is ApiRequestError & { details: UsageLimitReachedDetails } {
  return isUsageLimitReachedError(error) && error.code === "monthly_limit_reached";
}

export function isResourceLimitReachedError(
  error: unknown,
): error is ApiRequestError & { details: ResourceLimitReachedDetails } {
  if (!isApiRequestError(error) || error.code !== "resource_limit_reached") return false;
  if (!isRecord(error.details)) return false;
  return (
    typeof error.details.resource === "string" &&
    billingResources.has(error.details.resource as BillingResource) &&
    typeof error.details.used === "number" &&
    Number.isFinite(error.details.used) &&
    error.details.used >= 0 &&
    typeof error.details.limit === "number" &&
    Number.isFinite(error.details.limit) &&
    error.details.limit >= 0
  );
}

export function isUpgradeRequiredError(
  error: unknown,
): error is ApiRequestError & { details: UpgradeRequiredDetails } {
  if (!isApiRequestError(error) || error.code !== "upgrade_required") return false;
  if (!isRecord(error.details)) return false;
  return (
    typeof error.details.capability === "string" &&
    billingCapabilities.has(error.details.capability as BillingCapability)
  );
}

export function isBillingEnforcementError(error: unknown): error is ApiRequestError {
  return (
    isApiRequestError(error) &&
    (error.code === "monthly_limit_reached" ||
      error.code === "resource_limit_reached" ||
      error.code === "upgrade_required")
  );
}

export function isSubscriptionBlocksAccountDeletionError(error: unknown): error is ApiRequestError {
  return isApiRequestError(error) && error.code === "subscription_blocks_account_deletion";
}
