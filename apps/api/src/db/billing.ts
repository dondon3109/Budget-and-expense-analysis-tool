import {
  billingPlanKeys,
  isFamilyPlan,
  type BillingCapability,
  type BillingInterval,
  type BillingPendingChange,
  type BillingPlanKey,
  type BillingProvider,
  type BillingSubscriptionStatus,
  type BillingSummary,
  type FamilyBillingPlan,
  type FamilyBillingSummary,
  type FamilyPlanState,
} from "@zoption/shared";

import {
  FAMILY_PLAN_STATE_SQL,
  monthlyLimit,
  paidPlanRequiredError,
  readEffectiveAccess,
  readTier,
} from "../billing/entitlements";
import { configuredPlanId } from "../billing/plan-ids";
import { HttpError } from "../errors";
import type { Bindings } from "../types";
import { applySubscriptionUpdate } from "./billing-apply";
import {
  buildMonthlyUsageStatement,
  databaseMessage,
  getCustomCategoryAllowance,
  isMonthlyLimitDatabaseError,
  monthlyFeatureUsage,
  monthlyLimitError,
} from "./billing-usage";

export const PRO_BILLING_STATUSES = ["active", "trialing"] as const;
export const NON_TERMINAL_BILLING_STATUSES = ["active", "trialing", "past_due", "paused"] as const;

const PRO_STATUS_SET = new Set<BillingSubscriptionStatus>(PRO_BILLING_STATUSES);
const NON_TERMINAL_STATUS_SET = new Set<BillingSubscriptionStatus>(NON_TERMINAL_BILLING_STATUSES);

export const CHECKOUT_BLOCKING_SUBSCRIPTION_CONDITION = `(
  status IN ('active', 'trialing', 'past_due', 'paused')
  OR (
    status = 'canceled'
    AND cancel_at_period_end = 1
    AND current_period_ends_at IS NOT NULL
    AND datetime(current_period_ends_at) > datetime('now')
  )
)`;

export function hasEffectiveProEntitlement(
  status: BillingSubscriptionStatus,
  currentPeriodEndsAt: string | null,
  now = new Date(),
  cancelAtPeriodEnd = false,
): boolean {
  const isEligibleStatus =
    isProBillingStatus(status) || (status === "canceled" && cancelAtPeriodEnd);
  if (!isEligibleStatus || !currentPeriodEndsAt) return false;
  const periodEnd = new Date(currentPeriodEndsAt);
  return !Number.isNaN(periodEnd.getTime()) && periodEnd.getTime() > now.getTime();
}

export function isCheckoutBlockingSubscription(
  status: BillingSubscriptionStatus,
  currentPeriodEndsAt: string | null,
  cancelAtPeriodEnd: boolean,
  now = new Date(),
): boolean {
  if (isNonTerminalBillingStatus(status)) return true;
  return hasEffectiveProEntitlement(status, currentPeriodEndsAt, now, cancelAtPeriodEnd);
}

interface SubscriptionSummaryRow {
  provider: BillingProvider;
  providerSubscriptionId: string;
  tenantId: string;
  plan: BillingPlanKey | null;
  status: BillingSubscriptionStatus;
  interval: BillingInterval | null;
  currentPeriodEndsAt: string | null;
  scheduledChangeAt: string | null;
  cancelAtPeriodEnd: number;
  entitledUntil: string | null;
  pendingPlan: BillingPlanKey | null;
  pendingInterval: BillingInterval | null;
}

export interface BillingSubscriptionEvent {
  provider: BillingProvider;
  providerEventId: string;
  type: string;
  occurredAt: string;
  providerSubscriptionId: string;
  providerCustomerId: string | null;
  providerProductId: string | null;
  providerPlanId: string;
  providerStatus: string;
  status: BillingSubscriptionStatus;
  interval: BillingInterval | null;
  currentPeriodEndsAt: string | null;
  scheduledChangeAt: string | null;
  cancelAtPeriodEnd: boolean;
  checkoutReference: string | null;
  /**
   * A reversal or dispute that must terminate the subscription even when the plan that sold it
   * is no longer configured. Normal subscription updates still require a configured plan.
   */
  revocation?: boolean;
}

export interface BillingProviderSubscription {
  provider: BillingProvider;
  providerSubscriptionId: string;
  providerCustomerId: string | null;
  providerPlanId: string;
  plan: BillingPlanKey | null;
  interval: BillingInterval | null;
  familyTenantId: string | null;
  status: BillingSubscriptionStatus;
  currentPeriodEndsAt: string | null;
  cancelAtPeriodEnd: boolean;
}

interface BillingProviderSubscriptionRow extends Omit<
  BillingProviderSubscription,
  "cancelAtPeriodEnd"
> {
  cancelAtPeriodEnd: number;
}

export interface BillingCheckoutReference {
  reference: string;
  provider: BillingProvider;
  plan: BillingPlanKey;
  interval: BillingInterval;
  /** The family a family plan checkout covers; null for a personal plan. */
  familyTenantId: string | null;
  providerPlanId: string;
  providerSubscriptionId: string | null;
  /** Dodo's checkout session id; PayPal creates the subscription itself at checkout. */
  providerCheckoutId: string | null;
  createdAt: string;
  expiresAt: string;
}

export interface BillingDueCheckout extends BillingCheckoutReference {
  tenantId: string;
}

export type BillingSubscriptionApplyOutcome =
  "applied" | "duplicate_or_stale" | "unmatched" | "rejected_plan";

export type BillingSubscriptionSnapshot = Omit<
  BillingSubscriptionEvent,
  "providerEventId" | "type"
> & {
  providerUpdateId: string;
};

export interface CheckoutRequest {
  plan: BillingPlanKey;
  interval: BillingInterval;
  provider: BillingProvider;
  /** Set for a family plan, which the owner pays from their personal workspace. */
  familyTenantId: string | null;
}

/** What a plan change leaves on the subscription row until the provider confirms it. */
export interface PlanChangeRecord {
  plan: BillingPlanKey;
  interval: BillingInterval;
  providerPlanId: string;
  /** The tier floor kept until `entitledUntil`: the old plan on a downgrade, the new on an upgrade. */
  entitledPlan: BillingPlanKey;
  entitledUntil: string | null;
  /** Set on a downgrade, naming what the subscription becomes when the period ends. */
  pending: { plan: BillingPlanKey; interval: BillingInterval } | null;
}

export interface BillingRepository {
  getSummary(env: Bindings, tenantId: string): Promise<BillingSummary>;
  requirePaidPlan(env: Bindings, tenantId: string, capability: BillingCapability): Promise<void>;
  createCheckoutReference(
    env: Bindings,
    tenantId: string,
    request: CheckoutRequest,
  ): Promise<BillingCheckoutReference>;
  createMonthlyImportUsageStatement(env: Bindings, tenantId: string): D1PreparedStatement;
  rethrowMonthlyImportUsageError(env: Bindings, tenantId: string, error: unknown): Promise<never>;
  /** Any live subscription the tenant pays for, personal or family; it blocks account deletion. */
  hasNonTerminalSubscription(env: Bindings, tenantId: string): Promise<boolean>;
  /** The live subscription the tenant pays for one purpose: personal (null) or a family. */
  getProviderSubscription(
    env: Bindings,
    tenantId: string,
    familyTenantId: string | null,
  ): Promise<BillingProviderSubscription | null>;
  recordPlanChange(
    env: Bindings,
    tenantId: string,
    subscription: Pick<BillingProviderSubscription, "provider" | "providerSubscriptionId">,
    change: PlanChangeRecord,
  ): Promise<void>;
  familyPlanState(env: Bindings, familyTenantId: string): Promise<FamilyPlanState>;
  getFamilySummary(
    env: Bindings,
    familyTenantId: string,
    ownerTenantId: string,
  ): Promise<FamilyBillingSummary>;
  /** Live subscriptions paying for a family, whoever pays them; renewals stop on a transfer. */
  listFamilySubscriptions(
    env: Bindings,
    familyTenantId: string,
  ): Promise<BillingProviderSubscription[]>;
  getPendingCheckout(env: Bindings, tenantId: string): Promise<BillingCheckoutReference | null>;
  listDuePendingCheckouts(env: Bindings, limit: number): Promise<BillingDueCheckout[]>;
  recordCheckoutReconciliation(
    env: Bindings,
    tenantId: string,
    reference: string,
    providerStatus: string | null,
    errorCode: string | null,
  ): Promise<void>;
  supersedePendingCheckout(env: Bindings, tenantId: string, reference: string): Promise<void>;
  bindCheckoutProviderSubscription(
    env: Bindings,
    tenantId: string,
    reference: string,
    provider: BillingProvider,
    providerSubscriptionId: string,
  ): Promise<void>;
  bindCheckoutProviderSession(
    env: Bindings,
    tenantId: string,
    reference: string,
    provider: BillingProvider,
    providerCheckoutId: string,
  ): Promise<void>;
  /**
   * Attach a paid subscription to the checkout that sold it, found by the provider's checkout
   * id or by the checkout reference it echoes. A superseded checkout still links, because the
   * buyer was charged. Returns the checkout reference, or null when nothing matches.
   */
  linkCheckoutSubscription(
    env: Bindings,
    provider: BillingProvider,
    match: { providerCheckoutId: string | null; reference: string | null },
    providerSubscriptionId: string,
  ): Promise<string | null>;
  applySubscriptionEvent(
    env: Bindings,
    event: BillingSubscriptionEvent,
  ): Promise<BillingSubscriptionApplyOutcome>;
  applySubscriptionSnapshot(
    env: Bindings,
    snapshot: BillingSubscriptionSnapshot,
  ): Promise<BillingSubscriptionApplyOutcome>;
}

const SUBSCRIPTION_SUMMARY_COLUMNS = `provider, provider_subscription_id AS providerSubscriptionId,
  tenant_id AS tenantId, plan, status, interval,
  current_period_ends_at AS currentPeriodEndsAt, scheduled_change_at AS scheduledChangeAt,
  cancel_at_period_end AS cancelAtPeriodEnd, entitled_until AS entitledUntil,
  pending_plan AS pendingPlan, pending_interval AS pendingInterval`;

const SUBSCRIPTION_ORDER = `CASE status
       WHEN 'active' THEN 0
       WHEN 'trialing' THEN 1
       WHEN 'past_due' THEN 2
       WHEN 'paused' THEN 3
       WHEN 'canceled' THEN 4
       ELSE 5
     END, last_provider_occurred_at DESC, last_provider_event_id DESC`;

/** The personal subscription the tenant pays for; family plans it pays are left out. */
async function currentSubscription(
  env: Bindings,
  tenantId: string,
): Promise<SubscriptionSummaryRow | null> {
  return env.DB.prepare(
    `SELECT ${SUBSCRIPTION_SUMMARY_COLUMNS}
     FROM billing_subscriptions
     WHERE tenant_id = ? AND family_tenant_id IS NULL
     ORDER BY ${SUBSCRIPTION_ORDER}
     LIMIT 1`,
  )
    .bind(tenantId)
    .first<SubscriptionSummaryRow>();
}

/** The latest subscription paying for a family, from whichever owner bought it. */
async function currentFamilySubscription(
  env: Bindings,
  familyTenantId: string,
): Promise<SubscriptionSummaryRow | null> {
  return env.DB.prepare(
    `SELECT ${SUBSCRIPTION_SUMMARY_COLUMNS}
     FROM billing_subscriptions
     WHERE family_tenant_id = ?
     ORDER BY ${SUBSCRIPTION_ORDER}
     LIMIT 1`,
  )
    .bind(familyTenantId)
    .first<SubscriptionSummaryRow>();
}

function pendingChange(
  subscription: SubscriptionSummaryRow | null,
  now = Date.now(),
): BillingPendingChange | null {
  if (!subscription?.pendingPlan || !subscription.pendingInterval || !subscription.entitledUntil) {
    return null;
  }
  if (new Date(subscription.entitledUntil).getTime() <= now) return null;
  return {
    plan: subscription.pendingPlan,
    interval: subscription.pendingInterval,
    effectiveAt: subscription.entitledUntil,
  };
}

/** A plan can change while it is paid and renewing; a cancelled one ends instead. */
function canChangePlan(subscription: SubscriptionSummaryRow | null): boolean {
  return Boolean(
    subscription?.plan &&
    subscription.interval &&
    (subscription.status === "active" || subscription.status === "trialing") &&
    !subscription.cancelAtPeriodEnd,
  );
}

async function activeTrialEndsAt(env: Bindings, tenantId: string): Promise<string | null> {
  const row = await env.DB.prepare(
    `SELECT ends_at AS endsAt FROM pro_trials
     WHERE tenant_id = ? AND datetime(ends_at) > datetime('now')`,
  )
    .bind(tenantId)
    .first<{ endsAt: string }>();
  return row?.endsAt ?? null;
}

async function canManageSponsoredSeats(env: Bindings, tenantId: string): Promise<boolean> {
  const row = await env.DB.prepare(
    `SELECT 1 AS found
     FROM user_tenants AS user_tenant
     JOIN platform_admin_grants AS grant ON grant.user_id = user_tenant.user_id
     WHERE user_tenant.tenant_id = ? AND grant.complimentary_pro_enabled = 1
     LIMIT 1`,
  )
    .bind(tenantId)
    .first<{ found: number }>();
  return Boolean(row);
}

async function nonTerminalSubscriptionCount(env: Bindings, tenantId: string): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS count FROM billing_subscriptions
     WHERE tenant_id = ? AND family_tenant_id IS NULL
       AND ${CHECKOUT_BLOCKING_SUBSCRIPTION_CONDITION}`,
  )
    .bind(tenantId)
    .first<{ count: number }>();
  return Number(row?.count ?? 0);
}

/**
 * A family can be bought for while nothing renews for it. A previous owner's plan that runs to
 * the end of its period does not block the new owner, who would otherwise wait for a lapse.
 */
const FAMILY_CHECKOUT_BLOCKING_CONDITION = `(
  status IN ('active', 'trialing', 'past_due', 'paused') AND cancel_at_period_end = 0
)`;

async function hasBlockingSubscription(
  env: Bindings,
  tenantId: string,
  familyTenantId: string | null,
): Promise<boolean> {
  if (!familyTenantId) return (await nonTerminalSubscriptionCount(env, tenantId)) > 0;
  const row = await env.DB.prepare(
    `SELECT 1 AS found FROM billing_subscriptions
     WHERE family_tenant_id = ? AND ${FAMILY_CHECKOUT_BLOCKING_CONDITION}
     LIMIT 1`,
  )
    .bind(familyTenantId)
    .first<{ found: number }>();
  return Boolean(row);
}

const PROVIDER_SUBSCRIPTION_COLUMNS = `provider, provider_subscription_id AS providerSubscriptionId,
  provider_customer_id AS providerCustomerId, provider_plan_id AS providerPlanId, plan, interval,
  family_tenant_id AS familyTenantId, status, current_period_ends_at AS currentPeriodEndsAt,
  cancel_at_period_end AS cancelAtPeriodEnd`;

/** The family and plan behind a member's family-granted tier. */
async function familyCoverage(
  env: Bindings,
  familyTenantId: string,
): Promise<BillingSummary["coveredBy"]> {
  const row = await env.DB.prepare(
    `SELECT tenant.name AS familyName, subscription.plan AS plan
     FROM tenants AS tenant
     JOIN billing_subscriptions AS subscription ON subscription.family_tenant_id = tenant.id
     WHERE tenant.id = ? AND subscription.plan IN ('family_budget', 'family_pro')
     ORDER BY CASE subscription.status WHEN 'active' THEN 0 ELSE 1 END,
       subscription.last_provider_occurred_at DESC
     LIMIT 1`,
  )
    .bind(familyTenantId)
    .first<{ familyName: string; plan: FamilyBillingPlan }>();
  if (!row) return null;
  return { familyId: familyTenantId, familyName: row.familyName, plan: row.plan };
}

const CHECKOUT_REFERENCE_COLUMNS = `id AS reference, provider, plan, interval,
  provider_plan_id AS providerPlanId, family_tenant_id AS familyTenantId,
  provider_subscription_id AS providerSubscriptionId,
  provider_checkout_id AS providerCheckoutId, created_at AS createdAt, expires_at AS expiresAt`;

/** The tenant's open checkout already handed to a provider, for any purpose. */
async function pendingCheckoutReference(
  env: Bindings,
  tenantId: string,
): Promise<BillingCheckoutReference | null> {
  const checkout = await env.DB.prepare(
    `SELECT ${CHECKOUT_REFERENCE_COLUMNS}
     FROM billing_checkout_references
     WHERE tenant_id = ? AND completed_at IS NULL AND superseded_at IS NULL
       AND (provider_subscription_id IS NOT NULL OR provider_checkout_id IS NOT NULL)
     ORDER BY created_at DESC
     LIMIT 1`,
  )
    .bind(tenantId)
    .first<BillingCheckoutReference>();
  return checkout ?? null;
}

function summaryPendingCheckout(
  checkout: BillingCheckoutReference | null,
  familyTenantId: string | null,
): BillingSummary["pendingCheckout"] {
  if (!checkout || checkout.familyTenantId !== familyTenantId) return null;
  // A checkout the previous Worker opened sold Pro.
  const plan = (billingPlanKeys as readonly string[]).includes(checkout.plan)
    ? checkout.plan
    : "pro";
  return {
    provider: checkout.provider,
    plan,
    interval: checkout.interval,
    createdAt: checkout.createdAt,
    expiresAt: checkout.expiresAt,
  };
}

export const billingRepository: BillingRepository = {
  async getSummary(env, tenantId) {
    const [subscription, access, nonTerminalCount, adminSeatManagement, pendingCheckout] =
      await Promise.all([
        currentSubscription(env, tenantId),
        readEffectiveAccess(env, tenantId),
        nonTerminalSubscriptionCount(env, tenantId),
        canManageSponsoredSeats(env, tenantId),
        pendingCheckoutReference(env, tenantId),
      ]);
    const tier = access.tier;
    // A plan bought during the trial is reported over the trial that still outranks it.
    const trialEndsAt =
      access.source === "trial" && !subscription ? await activeTrialEndsAt(env, tenantId) : null;
    const period = trialEndsAt
      ? {
          provider: null,
          status: "trialing" as const,
          interval: null,
          currentPeriodEndsAt: trialEndsAt,
          scheduledChangeAt: null,
          cancelAtPeriodEnd: false,
        }
      : {
          provider: subscription?.provider ?? null,
          status: subscription?.status ?? null,
          interval: subscription?.interval ?? null,
          currentPeriodEndsAt: subscription?.currentPeriodEndsAt ?? null,
          scheduledChangeAt: subscription?.scheduledChangeAt ?? null,
          cancelAtPeriodEnd: Boolean(subscription?.cancelAtPeriodEnd),
        };
    const subscriptionPlan =
      subscription?.plan === "budget" || subscription?.plan === "pro" ? subscription.plan : null;
    return {
      plan: tier,
      entitlementSource: access.source === "trial" ? null : access.source,
      subscriptionPlan,
      ...period,
      pendingChange: pendingChange(subscription),
      pendingCheckout: summaryPendingCheckout(pendingCheckout, null),
      coveredBy:
        access.source === "family" && access.familyTenantId
          ? await familyCoverage(env, access.familyTenantId)
          : null,
      canCheckout: nonTerminalCount === 0 && pendingCheckout === null,
      canChangePlan: canChangePlan(subscription),
      canManageBilling: Boolean(subscription),
      canManageSponsoredSeats: adminSeatManagement,
      nonTerminalSubscriptionCount: nonTerminalCount,
      usages: await Promise.all([
        monthlyFeatureUsage(env, tenantId, "ai_usage", monthlyLimit(tier, "ai_usage")),
        monthlyFeatureUsage(env, tenantId, "file_import", monthlyLimit(tier, "file_import")),
      ]),
      allowances: [await getCustomCategoryAllowance(env, tenantId, tier)],
    };
  },

  async requirePaidPlan(env, tenantId, capability) {
    if ((await readTier(env, tenantId)) !== "free") return;
    throw paidPlanRequiredError(capability);
  },

  async createCheckoutReference(env, tenantId, request) {
    const { plan, interval, provider, familyTenantId } = request;
    if (isFamilyPlan(plan) !== (familyTenantId !== null)) {
      throw new HttpError(400, "invalid_request", "Choose a plan that matches the workspace.");
    }
    if (await hasBlockingSubscription(env, tenantId, familyTenantId)) {
      throw new HttpError(
        409,
        "subscription_already_exists",
        "Resolve your existing subscription before starting another checkout.",
        { billingPath: "/app/settings" },
      );
    }

    const now = new Date().toISOString();
    await env.DB.prepare(
      `UPDATE billing_checkout_references
       SET superseded_at = ?, updated_at = datetime('now')
       WHERE tenant_id = ? AND completed_at IS NULL AND superseded_at IS NULL
         AND provider_subscription_id IS NULL AND provider_checkout_id IS NULL
         AND datetime(expires_at) <= datetime(?)`,
    )
      .bind(now, tenantId, now)
      .run();

    const id = crypto.randomUUID();
    const selectedPlanId = configuredPlanId(env, provider, plan, interval);
    const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
    try {
      // The personal guard re-checks atomically; a family's is checked above, since the
      // subscription paying for it may sit on a previous owner's workspace.
      const result = await env.DB.prepare(
        `INSERT INTO billing_checkout_references
           (id, tenant_id, provider, plan, interval, provider_plan_id, family_tenant_id, expires_at)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?
         WHERE ? IS NOT NULL OR NOT EXISTS (
           SELECT 1 FROM billing_subscriptions
           WHERE tenant_id = ? AND family_tenant_id IS NULL
             AND ${CHECKOUT_BLOCKING_SUBSCRIPTION_CONDITION}
         )`,
      )
        .bind(
          id,
          tenantId,
          provider,
          plan,
          interval,
          selectedPlanId,
          familyTenantId,
          expiresAt,
          familyTenantId,
          tenantId,
        )
        .run();
      if ((result.meta.changes ?? 0) !== 1) {
        throw new HttpError(
          409,
          "subscription_already_exists",
          "Resolve your existing subscription before starting another checkout.",
          { billingPath: "/app/settings" },
        );
      }
    } catch (error) {
      const message = databaseMessage(error);
      if (
        message.includes("billing_checkout_references_tenant_open_unique") ||
        message.includes("billing_checkout_references.tenant_id")
      ) {
        const existing = await env.DB.prepare(
          `SELECT ${CHECKOUT_REFERENCE_COLUMNS}
           FROM billing_checkout_references
           WHERE tenant_id = ? AND completed_at IS NULL AND superseded_at IS NULL
             AND (
               datetime(expires_at) > datetime(?)
               OR provider_subscription_id IS NOT NULL
               OR provider_checkout_id IS NOT NULL
             )
           LIMIT 1`,
        )
          .bind(tenantId, now)
          .first<BillingCheckoutReference>();
        if (
          existing?.provider === provider &&
          existing.plan === plan &&
          existing.interval === interval &&
          existing.providerPlanId === selectedPlanId &&
          existing.familyTenantId === familyTenantId
        ) {
          return existing;
        }
        throw new HttpError(
          409,
          "checkout_in_progress",
          "A checkout is already open. Finish it or wait for it to expire.",
        );
      }
      throw error;
    }
    return {
      reference: id,
      provider,
      plan,
      interval,
      familyTenantId,
      providerPlanId: selectedPlanId,
      providerSubscriptionId: null,
      providerCheckoutId: null,
      createdAt: now,
      expiresAt,
    };
  },

  createMonthlyImportUsageStatement(env, tenantId) {
    return buildMonthlyUsageStatement(env, tenantId, "file_import");
  },

  async rethrowMonthlyImportUsageError(env, tenantId, error) {
    if (isMonthlyLimitDatabaseError(error)) {
      throw await monthlyLimitError(
        env,
        tenantId,
        "file_import",
        "You have reached this month’s import limit.",
      );
    }
    throw error;
  },

  async hasNonTerminalSubscription(env, tenantId) {
    const row = await env.DB.prepare(
      `SELECT 1 AS found FROM billing_subscriptions
       WHERE tenant_id = ? AND ${CHECKOUT_BLOCKING_SUBSCRIPTION_CONDITION}
       LIMIT 1`,
    )
      .bind(tenantId)
      .first<{ found: number }>();
    return Boolean(row);
  },

  async getProviderSubscription(env, tenantId, familyTenantId) {
    const subscription = await env.DB.prepare(
      `SELECT ${PROVIDER_SUBSCRIPTION_COLUMNS}
       FROM billing_subscriptions
       WHERE tenant_id = ? AND family_tenant_id IS ?
         AND ${CHECKOUT_BLOCKING_SUBSCRIPTION_CONDITION}
       ORDER BY last_provider_occurred_at DESC, last_provider_event_id DESC
       LIMIT 1`,
    )
      .bind(tenantId, familyTenantId)
      .first<BillingProviderSubscriptionRow>();
    if (!subscription) return null;
    return { ...subscription, cancelAtPeriodEnd: Boolean(subscription.cancelAtPeriodEnd) };
  },

  async recordPlanChange(env, tenantId, subscription, change) {
    await env.DB.prepare(
      `UPDATE billing_subscriptions
       SET provider_plan_id = ?, plan = ?, interval = ?,
           entitled_plan = ?, entitled_until = ?, pending_plan = ?, pending_interval = ?,
           updated_at = datetime('now')
       WHERE tenant_id = ? AND provider = ? AND provider_subscription_id = ?`,
    )
      .bind(
        change.providerPlanId,
        change.plan,
        change.interval,
        change.entitledPlan,
        change.entitledUntil,
        change.pending?.plan ?? null,
        change.pending?.interval ?? null,
        tenantId,
        subscription.provider,
        subscription.providerSubscriptionId,
      )
      .run();
  },

  async familyPlanState(env, familyTenantId) {
    const row = await env.DB.prepare(`SELECT ${FAMILY_PLAN_STATE_SQL} AS state`)
      .bind(familyTenantId, familyTenantId)
      .first<{ state: FamilyPlanState }>();
    return row?.state ?? "unpaid";
  },

  async getFamilySummary(env, familyTenantId, ownerTenantId) {
    const [subscription, state, blocked, pendingCheckout] = await Promise.all([
      currentFamilySubscription(env, familyTenantId),
      this.familyPlanState(env, familyTenantId),
      hasBlockingSubscription(env, ownerTenantId, familyTenantId),
      pendingCheckoutReference(env, ownerTenantId),
    ]);
    const plan =
      subscription?.plan === "family_budget" || subscription?.plan === "family_pro"
        ? subscription.plan
        : null;
    const paidByYou = subscription?.tenantId === ownerTenantId;
    const checkout = summaryPendingCheckout(pendingCheckout, familyTenantId);
    return {
      state,
      plan: state === "unpaid" ? null : plan,
      interval: subscription?.interval ?? null,
      provider: subscription?.provider ?? null,
      status: subscription?.status ?? null,
      currentPeriodEndsAt: subscription?.currentPeriodEndsAt ?? null,
      cancelAtPeriodEnd: Boolean(subscription?.cancelAtPeriodEnd),
      paidByYou,
      pendingChange: paidByYou ? pendingChange(subscription) : null,
      pendingCheckout: checkout,
      canCheckout: !blocked && pendingCheckout === null,
      canChangePlan: paidByYou && canChangePlan(subscription),
    };
  },

  async listFamilySubscriptions(env, familyTenantId) {
    const rows = await env.DB.prepare(
      `SELECT ${PROVIDER_SUBSCRIPTION_COLUMNS}
       FROM billing_subscriptions
       WHERE family_tenant_id = ? AND ${FAMILY_CHECKOUT_BLOCKING_CONDITION}`,
    )
      .bind(familyTenantId)
      .all<BillingProviderSubscriptionRow>();
    return rows.results.map((row) => ({
      ...row,
      cancelAtPeriodEnd: Boolean(row.cancelAtPeriodEnd),
    }));
  },

  async getPendingCheckout(env, tenantId) {
    return pendingCheckoutReference(env, tenantId);
  },

  async listDuePendingCheckouts(env, limit) {
    const boundedLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
    const rows = await env.DB.prepare(
      `SELECT ${CHECKOUT_REFERENCE_COLUMNS}, tenant_id AS tenantId
       FROM billing_checkout_references
       WHERE completed_at IS NULL AND superseded_at IS NULL
         AND (provider_subscription_id IS NOT NULL OR provider_checkout_id IS NOT NULL)
         AND datetime(COALESCE(last_reconciled_at, created_at)) <= datetime('now', '-5 minutes')
       ORDER BY COALESCE(last_reconciled_at, created_at), created_at
       LIMIT ?`,
    )
      .bind(boundedLimit)
      .all<BillingDueCheckout>();
    return rows.results;
  },

  async recordCheckoutReconciliation(env, tenantId, reference, providerStatus, errorCode) {
    await env.DB.prepare(
      `UPDATE billing_checkout_references
       SET last_reconciled_at = datetime('now'),
           reconciliation_attempts = reconciliation_attempts + 1,
           last_provider_status = ?,
           last_reconciliation_error = ?,
           updated_at = datetime('now')
       WHERE id = ? AND tenant_id = ? AND completed_at IS NULL AND superseded_at IS NULL`,
    )
      .bind(providerStatus, errorCode, reference, tenantId)
      .run();
  },

  async supersedePendingCheckout(env, tenantId, reference) {
    const result = await env.DB.prepare(
      `UPDATE billing_checkout_references
       SET superseded_at = ?, updated_at = datetime('now')
       WHERE id = ? AND tenant_id = ? AND completed_at IS NULL AND superseded_at IS NULL`,
    )
      .bind(new Date().toISOString(), reference, tenantId)
      .run();
    if ((result.meta.changes ?? 0) !== 1) {
      throw new HttpError(
        409,
        "invalid_checkout_reference",
        "This checkout is no longer available.",
      );
    }
  },

  async bindCheckoutProviderSubscription(
    env,
    tenantId,
    reference,
    provider,
    providerSubscriptionId,
  ) {
    const result = await env.DB.prepare(
      `UPDATE billing_checkout_references
       SET provider_subscription_id = ?, updated_at = datetime('now')
       WHERE id = ? AND tenant_id = ? AND provider = ?
         AND completed_at IS NULL AND superseded_at IS NULL
         AND (provider_subscription_id IS NULL OR provider_subscription_id = ?)`,
    )
      .bind(providerSubscriptionId, reference, tenantId, provider, providerSubscriptionId)
      .run();
    if ((result.meta.changes ?? 0) !== 1) {
      throw new HttpError(
        409,
        "invalid_checkout_reference",
        "This checkout is no longer available.",
      );
    }
  },

  async bindCheckoutProviderSession(env, tenantId, reference, provider, providerCheckoutId) {
    const result = await env.DB.prepare(
      `UPDATE billing_checkout_references
       SET provider_checkout_id = ?, updated_at = datetime('now')
       WHERE id = ? AND tenant_id = ? AND provider = ?
         AND completed_at IS NULL AND superseded_at IS NULL AND provider_checkout_id IS NULL`,
    )
      .bind(providerCheckoutId, reference, tenantId, provider)
      .run();
    if ((result.meta.changes ?? 0) !== 1) {
      throw new HttpError(
        409,
        "invalid_checkout_reference",
        "This checkout is no longer available.",
      );
    }
  },

  async linkCheckoutSubscription(env, provider, match, providerSubscriptionId) {
    if (!match.providerCheckoutId && !match.reference) return null;
    const row = await env.DB.prepare(
      `UPDATE billing_checkout_references
       SET provider_subscription_id = ?, updated_at = datetime('now')
       WHERE provider = ? AND completed_at IS NULL
         AND (provider_checkout_id = ? OR id = ?)
         AND (provider_subscription_id IS NULL OR provider_subscription_id = ?)
       RETURNING id`,
    )
      .bind(
        providerSubscriptionId,
        provider,
        match.providerCheckoutId,
        match.reference,
        providerSubscriptionId,
      )
      .first<{ id: string }>();
    return row?.id ?? null;
  },

  async applySubscriptionEvent(env, event) {
    return applySubscriptionUpdate(
      env,
      { ...event, providerUpdateId: event.providerEventId },
      { providerEventId: event.providerEventId, type: event.type },
    );
  },

  async applySubscriptionSnapshot(env, snapshot) {
    return applySubscriptionUpdate(env, snapshot);
  },
};

export function isNonTerminalBillingStatus(status: BillingSubscriptionStatus): boolean {
  return NON_TERMINAL_STATUS_SET.has(status);
}

export function isProBillingStatus(status: BillingSubscriptionStatus): boolean {
  return PRO_STATUS_SET.has(status);
}
