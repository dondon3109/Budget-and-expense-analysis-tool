import {
  billingTiers,
  TIER_LIMITS,
  type BillingFeature,
  type BillingTier,
  type CategoryRequiredPlan,
  type ProEntitlementSource,
} from "@zoption/shared";

import { HttpError } from "../errors";
import type { Bindings } from "../types";

/**
 * The tier rank a tenant holds right now: 0 Free, 1 Budget, 2 Pro. Binds one tenant id. A
 * tenant's grants (its own plan, a family plan, an admin grant, a sponsored seat, a trial) are
 * rows of `effective_plan_access`; the best one wins.
 */
export const EFFECTIVE_TIER_RANK_SQL = `(
  SELECT COALESCE(MAX(rank), 0) FROM effective_plan_access WHERE tenant_id = ?
)`;

/** A category's stored tag. `zoption_budget` never leaves the server; see `wireCategoryPlan`. */
export type CategoryPlanTag = "free" | "zoption_budget" | "zoption_pro";

/** The rank a category's tag needs, read from a SQL column or expression. */
export function categoryPlanRankSql(column: string): string {
  return `CASE ${column} WHEN 'free' THEN 0 WHEN 'zoption_budget' THEN 1 ELSE 2 END`;
}

const freeCategoryLimit = TIER_LIMITS.free.customCategories ?? 0;
const budgetCategoryLimit = TIER_LIMITS.zoption_budget.customCategories ?? 0;

/**
 * The tag a new or restored custom category takes: the lowest tier with a slot left. Binds the
 * tenant id twice. A downgrade then locks only the categories past the new tier's limit.
 */
export const NEXT_CUSTOM_CATEGORY_PLAN_SQL = `CASE
  WHEN (
    SELECT COUNT(*) FROM categories
    WHERE tenant_id = ? AND origin = 'custom' AND archived = 0 AND required_plan = 'free'
  ) < ${freeCategoryLimit} THEN 'free'
  WHEN (
    SELECT COUNT(*) FROM categories
    WHERE tenant_id = ? AND origin = 'custom' AND archived = 0
      AND required_plan IN ('free', 'zoption_budget')
  ) < ${budgetCategoryLimit} THEN 'zoption_budget'
  ELSE 'zoption_pro'
END`;

/**
 * A family's plan state (`FamilyPlanState`) as SQL. Binds the family tenant id twice. Any plan row
 * that ever named the family makes an uncovered family `lapsed` rather than `unpaid`.
 */
export const FAMILY_PLAN_STATE_SQL = `CASE
  WHEN EXISTS (SELECT 1 FROM effective_plan_access WHERE tenant_id = ?) THEN 'active'
  WHEN EXISTS (SELECT 1 FROM billing_subscriptions WHERE family_tenant_id = ?) THEN 'lapsed'
  ELSE 'unpaid'
END`;

export function tierFromRank(rank: number): BillingTier {
  return billingTiers[Math.max(0, Math.min(billingTiers.length - 1, rank))]!;
}

function tagRank(requiredPlan: string): number {
  if (requiredPlan === "free") return 0;
  if (requiredPlan === "zoption_budget") return 1;
  return 2;
}

export function isCategoryPlanAvailable(requiredPlan: string, tier: BillingTier): boolean {
  return tagRank(requiredPlan) <= billingTiers.indexOf(tier);
}

/**
 * Installed apps accept only `free` and `zoption_pro`, so a Budget tag travels as `zoption_pro`.
 * Clients read `locked`, which the server computes from the real tag and tier.
 */
export function wireCategoryPlan(requiredPlan: string): CategoryRequiredPlan {
  return requiredPlan === "free" ? "free" : "zoption_pro";
}

/** `trial` stays internal: the billing summary reports a trial as a `trialing` status. */
export type EntitlementSource = ProEntitlementSource | "trial";

export interface EffectiveAccess {
  tier: BillingTier;
  source: EntitlementSource | null;
  /** The family whose plan grants the tier, when `source` is `family`. */
  familyTenantId: string | null;
}

export async function readEffectiveAccess(
  env: Bindings,
  tenantId: string,
): Promise<EffectiveAccess> {
  // Among equal ranks, a paid plan of one's own is reported before a family, a grant, or a trial.
  const row = await env.DB.prepare(
    `SELECT source, rank, family_tenant_id AS familyTenantId
     FROM effective_plan_access
     WHERE tenant_id = ?
     ORDER BY rank DESC, CASE source
       WHEN 'paypal' THEN 0
       WHEN 'dodo' THEN 1
       WHEN 'family' THEN 2
       WHEN 'platform_admin' THEN 3
       WHEN 'sponsored' THEN 4
       WHEN 'trial' THEN 5
       ELSE 6
     END
     LIMIT 1`,
  )
    .bind(tenantId)
    .first<{ source: EntitlementSource; rank: number; familyTenantId: string | null }>();
  if (!row) return { tier: "free", source: null, familyTenantId: null };
  return {
    tier: tierFromRank(Number(row.rank)),
    source: row.source,
    familyTenantId: row.familyTenantId,
  };
}

export async function readTier(env: Bindings, tenantId: string): Promise<BillingTier> {
  return (await readEffectiveAccess(env, tenantId)).tier;
}

/** Budget or Pro: every gated feature opens at Budget; Pro only raises the limits. */
export async function hasPaidPlan(env: Bindings, tenantId: string): Promise<boolean> {
  return (await readTier(env, tenantId)) !== "free";
}

export function paidPlanRequiredError(capability: string): HttpError {
  return new HttpError(403, "upgrade_required", "This feature needs Zoption Budget or Pro.", {
    capability,
    requiredPlan: "zoption_budget",
    billingPath: "/app/settings",
  });
}

export function categoryRequiresPlanError(): HttpError {
  return new HttpError(
    403,
    "category_requires_pro",
    "This category needs a higher plan. Upgrade or archive other categories to use it.",
    { requiredPlan: "zoption_budget", billingPath: "/app/settings" },
  );
}

export function monthlyLimit(tier: BillingTier, feature: BillingFeature): number {
  return TIER_LIMITS[tier].monthly[feature];
}

/**
 * The SQL value of a feature's monthly allowance for the tenant's tier. Binds one tenant id. The
 * BEFORE INSERT/UPDATE triggers on billing_monthly_usage compare against it atomically, so a
 * plan change applies to the current month at once.
 */
export function monthlyAllowanceSql(feature: BillingFeature): string {
  return `CASE ${EFFECTIVE_TIER_RANK_SQL}
    WHEN 2 THEN ${TIER_LIMITS.zoption_pro.monthly[feature]}
    WHEN 1 THEN ${TIER_LIMITS.zoption_budget.monthly[feature]}
    ELSE ${TIER_LIMITS.free.monthly[feature]}
  END`;
}
