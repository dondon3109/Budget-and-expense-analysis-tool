import {
  TIER_LIMITS,
  tierRank,
  type BillingFeature,
  type BillingResourceAllowance,
  type BillingTier,
  type BillingUsage,
} from "@zoption/shared";

import {
  categoryPlanRankSql,
  monthlyAllowanceSql,
  monthlyLimit,
  readTier,
} from "../billing/entitlements";
import { HttpError } from "../errors";
import type { Bindings } from "../types";

// Monthly AI and import pools and the custom category allowance, each measured against the
// tenant's tier.

export function databaseMessage(error: unknown): string {
  return error instanceof Error ? error.message.toLowerCase() : "";
}

export function isMonthlyLimitDatabaseError(error: unknown): boolean {
  return databaseMessage(error).includes("billing_monthly_limit_reached");
}

export function manilaMonth(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-01`;
}

export function manilaMonthStart(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const year = Number(values.year);
  const month = Number(values.month);
  return new Date(Date.UTC(year, month - 1, 0, 16)).toISOString();
}

export function nextManilaMonth(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const year = Number(values.year);
  const month = Number(values.month);
  return new Date(Date.UTC(year, month, 0, 16)).toISOString();
}

export async function monthlyFeatureUsage(
  env: Bindings,
  tenantId: string,
  feature: BillingFeature,
  limit: number,
  now = new Date(),
): Promise<BillingUsage> {
  const month = manilaMonth(now);
  const row = await env.DB.prepare(
    "SELECT count FROM billing_monthly_usage WHERE tenant_id = ? AND month = ? AND feature = ?",
  )
    .bind(tenantId, month, feature)
    .first<{ count: number }>();
  return {
    feature,
    used: Number(row?.count ?? 0),
    limit,
    periodKind: "calendar_month",
    periodStartedAt: manilaMonthStart(now),
    resetsAt: nextManilaMonth(now),
  };
}

/** Active custom categories counted against the tier: those whose tag the tier covers. */
export async function getCustomCategoryAllowance(
  env: Bindings,
  tenantId: string,
  tier?: BillingTier,
): Promise<BillingResourceAllowance> {
  const effectiveTier = tier ?? (await readTier(env, tenantId));
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS count FROM categories
     WHERE tenant_id = ? AND origin = 'custom' AND archived = 0
       AND ${categoryPlanRankSql("required_plan")} <= ?`,
  )
    .bind(tenantId, tierRank(effectiveTier))
    .first<{ count: number }>();
  return {
    resource: "custom_category",
    used: Number(row?.count ?? 0),
    limit: TIER_LIMITS[effectiveTier].customCategories,
  };
}

export async function customCategoryLimitError(
  env: Bindings,
  tenantId: string,
): Promise<HttpError> {
  const allowance = await getCustomCategoryAllowance(env, tenantId);
  return new HttpError(
    409,
    "resource_limit_reached",
    "You have reached your custom category limit.",
    {
      resource: allowance.resource,
      used: allowance.used,
      limit: allowance.limit,
      billingPath: "/app/settings#plan-and-billing",
    },
  );
}

export async function monthlyLimitError(
  env: Bindings,
  tenantId: string,
  feature: BillingFeature,
  message: string,
): Promise<HttpError> {
  const limit = monthlyLimit(await readTier(env, tenantId), feature);
  const item = await monthlyFeatureUsage(env, tenantId, feature, limit);
  return new HttpError(409, "monthly_limit_reached", message, {
    feature: item.feature,
    used: item.used,
    limit,
    periodKind: item.periodKind,
    periodStartedAt: item.periodStartedAt,
    resetsAt: item.resetsAt,
    billingPath: "/app/settings#plan-and-billing",
  });
}

export function buildMonthlyUsageStatement(
  env: Bindings,
  tenantId: string,
  feature: BillingFeature,
): D1PreparedStatement {
  const allowance = monthlyAllowanceSql(feature);
  return env.DB.prepare(
    `INSERT INTO billing_monthly_usage (tenant_id, month, feature, count, allowance)
     VALUES (?, ?, ?, 1, ${allowance})
     ON CONFLICT(tenant_id, month, feature) DO UPDATE SET
       count = billing_monthly_usage.count + 1,
       allowance = ${allowance},
       updated_at = datetime('now')`,
  ).bind(tenantId, manilaMonth(), feature, tenantId, tenantId);
}

/**
 * Draw one unit from the shared monthly AI pool. Every billable provider-backed AI request
 * (assistant generation, transcription, speech, receipt vision, PDF entry, voice entry) calls
 * this before its provider call, so a provider failure still consumes the unit. The BEFORE
 * INSERT/UPDATE triggers on billing_monthly_usage are the atomic cap; any other database error
 * propagates so the provider is never reached.
 */
export async function consumeAiUsage(env: Bindings, tenantId: string): Promise<void> {
  try {
    await buildMonthlyUsageStatement(env, tenantId, "ai_usage").run();
  } catch (error) {
    if (isMonthlyLimitDatabaseError(error)) {
      throw await monthlyLimitError(
        env,
        tenantId,
        "ai_usage",
        "You have reached your AI usage limit for this month.",
      );
    }
    throw error;
  }
}
