import type {
  BillingCapability,
  BillingInterval,
  BillingProvider,
  BillingResourceAllowance,
  BillingSubscriptionStatus,
  BillingSummary,
  ProEntitlementSource,
  BillingUsage,
  CategoryRequiredPlan,
} from "@zoption/shared";

import {
  EFFECTIVE_PRO_ENTITLEMENT_CONDITION,
  FREE_LIMITS,
  PRO_LIMITS,
} from "../billing/usage-limits";
import { HttpError } from "../errors";
import type { Bindings } from "../types";
import { assistantUsageRepository } from "./assistant-usage";

export { EFFECTIVE_PRO_ENTITLEMENT_CONDITION } from "../billing/usage-limits";

export const FREE_CUSTOM_CATEGORY_LIMIT = 4;

export const PRO_BILLING_STATUSES = ["active", "trialing"] as const;
export const NON_TERMINAL_BILLING_STATUSES = ["active", "trialing", "past_due", "paused"] as const;

const PRO_STATUS_SET = new Set<BillingSubscriptionStatus>(PRO_BILLING_STATUSES);
const NON_TERMINAL_STATUS_SET = new Set<BillingSubscriptionStatus>(NON_TERMINAL_BILLING_STATUSES);

export const EFFECTIVE_PRO_SUBSCRIPTION_CONDITION = `current_period_ends_at IS NOT NULL
  AND datetime(current_period_ends_at) > datetime('now')
  AND (
    status IN ('active', 'trialing')
    OR (provider = 'paypal' AND status = 'canceled' AND cancel_at_period_end = 1)
  )`;

export const CHECKOUT_BLOCKING_SUBSCRIPTION_CONDITION = `(
  status IN ('active', 'trialing', 'past_due', 'paused')
  OR (
    provider = 'paypal'
    AND status = 'canceled'
    AND cancel_at_period_end = 1
    AND current_period_ends_at IS NOT NULL
    AND datetime(current_period_ends_at) > datetime('now')
  )
)`;

export function hasEffectiveProEntitlement(
  status: BillingSubscriptionStatus,
  currentPeriodEndsAt: string | null,
  now = new Date(),
  provider: BillingProvider = "paypal",
  cancelAtPeriodEnd = false,
): boolean {
  const isEligibleStatus =
    isProBillingStatus(status) ||
    (provider === "paypal" && status === "canceled" && cancelAtPeriodEnd);
  if (!isEligibleStatus || !currentPeriodEndsAt) return false;
  const periodEnd = new Date(currentPeriodEndsAt);
  return !Number.isNaN(periodEnd.getTime()) && periodEnd.getTime() > now.getTime();
}

export function isCheckoutBlockingSubscription(
  status: BillingSubscriptionStatus,
  currentPeriodEndsAt: string | null,
  provider: BillingProvider,
  cancelAtPeriodEnd: boolean,
  now = new Date(),
): boolean {
  if (isNonTerminalBillingStatus(status)) return true;
  return hasEffectiveProEntitlement(status, currentPeriodEndsAt, now, provider, cancelAtPeriodEnd);
}

export function isCategoryPlanAvailable(
  requiredPlan: CategoryRequiredPlan,
  hasPro: boolean,
): boolean {
  return requiredPlan === "free" || hasPro;
}

export function categoryRequiresProError(): HttpError {
  return new HttpError(
    403,
    "category_requires_pro",
    "This category requires an active Zoption Pro subscription.",
    { requiredPlan: "zoption_pro", billingPath: "/app/settings" },
  );
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

function configuredPlanId(env: Bindings, interval: BillingInterval): string {
  const value =
    interval === "month" ? env.PAYPAL_PRO_MONTHLY_PLAN_ID : env.PAYPAL_PRO_ANNUAL_PLAN_ID;
  if (!value?.startsWith("P-")) {
    throw new HttpError(503, "billing_not_configured", "Billing is not configured yet.");
  }
  return value;
}

function configuredInterval(env: Bindings, providerPlanId: string): BillingInterval | null {
  if (providerPlanId === env.PAYPAL_PRO_MONTHLY_PLAN_ID) return "month";
  if (providerPlanId === env.PAYPAL_PRO_ANNUAL_PLAN_ID) return "year";
  return null;
}

function databaseMessage(error: unknown): string {
  return error instanceof Error ? error.message.toLowerCase() : "";
}

export function isMonthlyLimitDatabaseError(error: unknown): boolean {
  return databaseMessage(error).includes("billing_monthly_limit_reached");
}

function isWebhookDuplicateError(error: unknown): boolean {
  const message = databaseMessage(error);
  return (
    message.includes("unique constraint failed") &&
    (message.includes("billing_webhook_events.provider") ||
      message.includes("billing_webhook_events.provider_event_id"))
  );
}

interface SubscriptionSummaryRow {
  provider: BillingProvider;
  status: BillingSubscriptionStatus;
  interval: BillingInterval | null;
  currentPeriodEndsAt: string | null;
  scheduledChangeAt: string | null;
  cancelAtPeriodEnd: number;
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
}

export interface BillingProviderSubscription {
  provider: BillingProvider;
  providerSubscriptionId: string;
  providerCustomerId: string | null;
  providerPlanId: string;
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
  interval: BillingInterval;
  providerPlanId: string;
  providerSubscriptionId: string | null;
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

export interface BillingRepository {
  getSummary(env: Bindings, tenantId: string): Promise<BillingSummary>;
  requirePro(env: Bindings, tenantId: string, capability: BillingCapability): Promise<void>;
  createCheckoutReference(
    env: Bindings,
    tenantId: string,
    interval: BillingInterval,
  ): Promise<BillingCheckoutReference>;
  createMonthlyImportUsageStatement(env: Bindings, tenantId: string): D1PreparedStatement;
  rethrowMonthlyImportUsageError(
    env: Bindings,
    tenantId: string,
    error: unknown,
  ): Promise<never>;
  hasNonTerminalSubscription(env: Bindings, tenantId: string): Promise<boolean>;
  getProviderSubscription(
    env: Bindings,
    tenantId: string,
    provider: BillingProvider,
  ): Promise<BillingProviderSubscription | null>;
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
  applySubscriptionEvent(
    env: Bindings,
    event: BillingSubscriptionEvent,
  ): Promise<BillingSubscriptionApplyOutcome>;
  applySubscriptionSnapshot(
    env: Bindings,
    snapshot: BillingSubscriptionSnapshot,
  ): Promise<BillingSubscriptionApplyOutcome>;
}

async function currentSubscription(
  env: Bindings,
  tenantId: string,
): Promise<SubscriptionSummaryRow | null> {
  return env.DB.prepare(
    `SELECT provider, status, interval, current_period_ends_at AS currentPeriodEndsAt,
            scheduled_change_at AS scheduledChangeAt,
            cancel_at_period_end AS cancelAtPeriodEnd
     FROM billing_subscriptions
     WHERE tenant_id = ?
     ORDER BY CASE status
       WHEN 'active' THEN 0
       WHEN 'trialing' THEN 1
       WHEN 'past_due' THEN 2
       WHEN 'paused' THEN 3
       WHEN 'canceled' THEN 4
       ELSE 5
     END, last_provider_occurred_at DESC, last_provider_event_id DESC
     LIMIT 1`,
  )
    .bind(tenantId)
    .first<SubscriptionSummaryRow>();
}

export async function getProEntitlementSource(
  env: Bindings,
  tenantId: string,
): Promise<ProEntitlementSource | null> {
  const row = await env.DB.prepare(
    `SELECT source FROM effective_pro_entitlements
     WHERE tenant_id = ?
     ORDER BY CASE source
       WHEN 'paypal' THEN 0
       WHEN 'platform_admin' THEN 1
       WHEN 'sponsored' THEN 2
       ELSE 3
     END
     LIMIT 1`,
  )
    .bind(tenantId)
    .first<{ source: ProEntitlementSource }>();
  return row?.source ?? null;
}

export async function hasProEntitlement(env: Bindings, tenantId: string): Promise<boolean> {
  return (await getProEntitlementSource(env, tenantId)) !== null;
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
     WHERE tenant_id = ? AND ${CHECKOUT_BLOCKING_SUBSCRIPTION_CONDITION}`,
  )
    .bind(tenantId)
    .first<{ count: number }>();
  return Number(row?.count ?? 0);
}

async function pendingCheckoutReference(
  env: Bindings,
  tenantId: string,
): Promise<BillingCheckoutReference | null> {
  const checkout = await env.DB.prepare(
    `SELECT id AS reference, provider, interval, provider_plan_id AS providerPlanId,
            provider_subscription_id AS providerSubscriptionId, created_at AS createdAt,
            expires_at AS expiresAt
     FROM billing_checkout_references
     WHERE tenant_id = ? AND completed_at IS NULL AND superseded_at IS NULL
       AND provider_subscription_id IS NOT NULL
     ORDER BY created_at DESC
     LIMIT 1`,
  )
    .bind(tenantId)
    .first<BillingCheckoutReference>();
  return checkout ?? null;
}

async function monthlyImportUsage(
  env: Bindings,
  tenantId: string,
  limit: number,
  now = new Date(),
): Promise<BillingUsage> {
  const month = manilaMonth(now);
  const row = await env.DB.prepare(
    "SELECT count FROM billing_monthly_usage WHERE tenant_id = ? AND month = ? AND feature = 'file_import'",
  )
    .bind(tenantId, month)
    .first<{ count: number }>();
  return {
    feature: "file_import",
    used: Number(row?.count ?? 0),
    limit,
    periodKind: "calendar_month",
    periodStartedAt: manilaMonthStart(now),
    resetsAt: nextManilaMonth(now),
  };
}

export async function getCustomCategoryAllowance(
  env: Bindings,
  tenantId: string,
  isPro?: boolean,
): Promise<BillingResourceAllowance> {
  const hasPro = isPro ?? (await hasProEntitlement(env, tenantId));
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS count FROM categories
     WHERE tenant_id = ? AND origin = 'custom' AND archived = 0
       AND (? = 1 OR required_plan = 'free')`,
  )
    .bind(tenantId, hasPro ? 1 : 0)
    .first<{ count: number }>();
  return {
    resource: "custom_category",
    used: Number(row?.count ?? 0),
    limit: hasPro ? null : FREE_CUSTOM_CATEGORY_LIMIT,
  };
}

export async function customCategoryLimitError(
  env: Bindings,
  tenantId: string,
): Promise<HttpError> {
  const allowance = await getCustomCategoryAllowance(env, tenantId, false);
  return new HttpError(
    409,
    "resource_limit_reached",
    "You have reached your custom category limit.",
    {
      resource: allowance.resource,
      used: allowance.used,
      limit: FREE_CUSTOM_CATEGORY_LIMIT,
      billingPath: "/app/settings#plan-and-billing",
    },
  );
}

async function monthlyImportLimitError(env: Bindings, tenantId: string): Promise<HttpError> {
  const isPro = await hasProEntitlement(env, tenantId);
  const limit = (isPro ? PRO_LIMITS : FREE_LIMITS).file_import;
  const item = await monthlyImportUsage(env, tenantId, limit);
  return new HttpError(409, "monthly_limit_reached", "You have reached this month’s import limit.", {
    feature: item.feature,
    used: item.used,
    limit,
    periodKind: item.periodKind,
    periodStartedAt: item.periodStartedAt,
    resetsAt: item.resetsAt,
    billingPath: "/app/settings#plan-and-billing",
  });
}

function buildMonthlyImportUsageStatement(
  env: Bindings,
  tenantId: string,
): D1PreparedStatement {
  return env.DB.prepare(
    `INSERT INTO billing_monthly_usage (tenant_id, month, feature, count, allowance)
     VALUES (
       ?, ?, 'file_import', 1,
       CASE WHEN ${EFFECTIVE_PRO_ENTITLEMENT_CONDITION} THEN ? ELSE ? END
     )
     ON CONFLICT(tenant_id, month, feature) DO UPDATE SET
       count = billing_monthly_usage.count + 1,
       allowance = CASE WHEN ${EFFECTIVE_PRO_ENTITLEMENT_CONDITION} THEN ? ELSE ? END,
       updated_at = datetime('now')`,
  ).bind(
    tenantId,
    manilaMonth(),
    tenantId,
    PRO_LIMITS.file_import,
    FREE_LIMITS.file_import,
    tenantId,
    PRO_LIMITS.file_import,
    FREE_LIMITS.file_import,
  );
}

async function applySubscriptionUpdate(
  env: Bindings,
  update: BillingSubscriptionSnapshot,
  webhook?: { providerEventId: string; type: string },
): Promise<BillingSubscriptionApplyOutcome> {
  const interval = configuredInterval(env, update.providerPlanId);
  if (!interval || (update.interval && update.interval !== interval)) return "rejected_plan";

  if (webhook) {
    const existingEvent = await env.DB.prepare(
      `SELECT 1 AS found FROM billing_webhook_events
       WHERE provider = ? AND provider_event_id = ?`,
    )
      .bind(update.provider, webhook.providerEventId)
      .first();
    if (existingEvent) return "duplicate_or_stale";
  }

  const existingSubscription = await env.DB.prepare(
    `SELECT tenant_id AS tenantId, provider_customer_id AS providerCustomerId,
            last_provider_occurred_at AS lastProviderOccurredAt,
            last_provider_event_id AS lastProviderEventId
     FROM billing_subscriptions
     WHERE provider = ? AND provider_subscription_id = ?`,
  )
    .bind(update.provider, update.providerSubscriptionId)
    .first<{
      tenantId: string;
      providerCustomerId: string | null;
      lastProviderOccurredAt: string;
      lastProviderEventId: string;
    }>();
  if (
    existingSubscription?.providerCustomerId &&
    update.providerCustomerId &&
    existingSubscription.providerCustomerId !== update.providerCustomerId
  ) {
    throw new HttpError(409, "invalid_webhook_ownership", "Invalid billing ownership.");
  }
  if (
    existingSubscription &&
    (update.occurredAt < existingSubscription.lastProviderOccurredAt ||
      (update.occurredAt === existingSubscription.lastProviderOccurredAt &&
        update.providerUpdateId <= existingSubscription.lastProviderEventId))
  ) {
    return "duplicate_or_stale";
  }

  const reference =
    !existingSubscription && update.checkoutReference
      ? await env.DB.prepare(
          `SELECT tenant_id AS tenantId, provider_plan_id AS providerPlanId
           FROM billing_checkout_references
           WHERE id = ? AND provider = ? AND completed_at IS NULL
             AND provider_plan_id = ?
             AND (
               provider_subscription_id = ?
               OR (
                 provider_subscription_id IS NULL
                 AND datetime(?) >= datetime(created_at)
                 AND datetime(?) <= datetime(expires_at)
                 AND (superseded_at IS NULL OR datetime(?) <= datetime(superseded_at))
               )
             )`,
        )
          .bind(
            update.checkoutReference,
            update.provider,
            update.providerPlanId,
            update.providerSubscriptionId,
            update.occurredAt,
            update.occurredAt,
            update.occurredAt,
          )
          .first<{ tenantId: string; providerPlanId: string }>()
      : null;

  const tenantId = existingSubscription?.tenantId ?? reference?.tenantId;
  if (!tenantId) return "unmatched";

  if (update.providerCustomerId) {
    const customerLink = await env.DB.prepare(
      `SELECT provider_customer_id AS providerCustomerId
       FROM billing_customers
       WHERE provider = ? AND tenant_id = ?`,
    )
      .bind(update.provider, tenantId)
      .first<{ providerCustomerId: string | null }>();
    if (
      customerLink?.providerCustomerId &&
      customerLink.providerCustomerId !== update.providerCustomerId
    ) {
      throw new HttpError(409, "invalid_webhook_ownership", "Invalid billing ownership.");
    }
  }

  const statements: D1PreparedStatement[] = [];
  if (webhook) {
    statements.push(
      env.DB.prepare(
        `INSERT INTO billing_webhook_events
           (provider, provider_event_id, event_type, occurred_at)
         VALUES (?, ?, ?, ?)`,
      ).bind(update.provider, webhook.providerEventId, webhook.type, update.occurredAt),
    );
  }
  if (update.providerCustomerId) {
    statements.push(
      env.DB.prepare(
        `INSERT INTO billing_customers (tenant_id, provider, provider_customer_id)
         VALUES (?, ?, ?)
         ON CONFLICT(tenant_id, provider) DO UPDATE SET
           provider_customer_id = excluded.provider_customer_id,
           updated_at = datetime('now')
         WHERE billing_customers.provider_customer_id IS NULL
            OR billing_customers.provider_customer_id = excluded.provider_customer_id`,
      ).bind(tenantId, update.provider, update.providerCustomerId),
    );
  }
  statements.push(
    env.DB.prepare(
      `INSERT INTO billing_subscriptions
         (provider, provider_subscription_id, tenant_id, provider_customer_id,
          provider_product_id, provider_plan_id, provider_status, status, interval,
          current_period_ends_at, scheduled_change_at, cancel_at_period_end,
          last_provider_occurred_at, last_provider_event_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(provider, provider_subscription_id) DO UPDATE SET
         provider_customer_id = COALESCE(excluded.provider_customer_id, billing_subscriptions.provider_customer_id),
         provider_product_id = COALESCE(excluded.provider_product_id, billing_subscriptions.provider_product_id),
         provider_plan_id = excluded.provider_plan_id,
         provider_status = excluded.provider_status,
         status = excluded.status,
         interval = excluded.interval,
         current_period_ends_at = CASE
           WHEN excluded.status = 'canceled'
             AND excluded.cancel_at_period_end = 1
             AND excluded.current_period_ends_at IS NULL
           THEN billing_subscriptions.current_period_ends_at
           ELSE excluded.current_period_ends_at
         END,
         scheduled_change_at = excluded.scheduled_change_at,
         cancel_at_period_end = excluded.cancel_at_period_end,
         last_provider_occurred_at = excluded.last_provider_occurred_at,
         last_provider_event_id = excluded.last_provider_event_id,
         updated_at = datetime('now')
       WHERE excluded.last_provider_occurred_at > billing_subscriptions.last_provider_occurred_at
          OR (
            excluded.last_provider_occurred_at = billing_subscriptions.last_provider_occurred_at
            AND excluded.last_provider_event_id > billing_subscriptions.last_provider_event_id
          )`,
    ).bind(
      update.provider,
      update.providerSubscriptionId,
      tenantId,
      update.providerCustomerId,
      update.providerProductId,
      update.providerPlanId,
      update.providerStatus,
      update.status,
      interval,
      update.currentPeriodEndsAt,
      update.scheduledChangeAt,
      update.cancelAtPeriodEnd ? 1 : 0,
      update.occurredAt,
      update.providerUpdateId,
    ),
  );
  if (reference && update.checkoutReference) {
    statements.push(
      env.DB.prepare(
        `UPDATE billing_checkout_references
         SET completed_at = ?, updated_at = datetime('now')
         WHERE id = ? AND provider = ? AND provider_subscription_id = ? AND completed_at IS NULL`,
      ).bind(
        update.occurredAt,
        update.checkoutReference,
        update.provider,
        update.providerSubscriptionId,
      ),
    );
  }

  try {
    await env.DB.batch(statements);
  } catch (error) {
    if (webhook && isWebhookDuplicateError(error)) return "duplicate_or_stale";
    throw error;
  }
  return "applied";
}

export const billingRepository: BillingRepository = {
  async getSummary(env, tenantId) {
    const [
      subscription,
      entitlementSource,
      nonTerminalCount,
      adminSeatManagement,
      pendingCheckout,
    ] = await Promise.all([
      currentSubscription(env, tenantId),
      getProEntitlementSource(env, tenantId),
      nonTerminalSubscriptionCount(env, tenantId),
      canManageSponsoredSeats(env, tenantId),
      pendingCheckoutReference(env, tenantId),
    ]);
    const isPro = entitlementSource !== null;
    const plan = isPro ? "zoption_pro" : "free";
    const limits = isPro ? PRO_LIMITS : FREE_LIMITS;
    return {
      plan,
      entitlementSource,
      provider: subscription?.provider ?? null,
      status: subscription?.status ?? null,
      interval: subscription?.interval ?? null,
      currentPeriodEndsAt: subscription?.currentPeriodEndsAt ?? null,
      scheduledChangeAt: subscription?.scheduledChangeAt ?? null,
      cancelAtPeriodEnd: Boolean(subscription?.cancelAtPeriodEnd),
      pendingCheckout: pendingCheckout
        ? {
            provider: pendingCheckout.provider,
            interval: pendingCheckout.interval,
            createdAt: pendingCheckout.createdAt,
            expiresAt: pendingCheckout.expiresAt,
          }
        : null,
      canCheckout: nonTerminalCount === 0 && pendingCheckout === null,
      canManageBilling: Boolean(subscription),
      canManageSponsoredSeats: adminSeatManagement,
      nonTerminalSubscriptionCount: nonTerminalCount,
      usages: await Promise.all([
        assistantUsageRepository.getUsage(env, tenantId, limits.assistant_question),
        monthlyImportUsage(env, tenantId, limits.file_import),
      ]),
      allowances: [await getCustomCategoryAllowance(env, tenantId, isPro)],
    };
  },

  async requirePro(env, tenantId, capability) {
    if (await hasProEntitlement(env, tenantId)) return;
    throw new HttpError(403, "upgrade_required", "This feature requires Zoption Pro.", {
      capability,
      requiredPlan: "zoption_pro",
      billingPath: "/app/settings",
    });
  },

  async createCheckoutReference(env, tenantId, interval) {
    if (await this.hasNonTerminalSubscription(env, tenantId)) {
      throw new HttpError(
        409,
        "subscription_already_exists",
        "Resolve your existing subscription before starting another checkout.",
        { billingPath: "/app/settings" },
      );
    }

    const provider: BillingProvider = "paypal";
    const now = new Date().toISOString();
    await env.DB.prepare(
      `UPDATE billing_checkout_references
       SET superseded_at = ?, updated_at = datetime('now')
       WHERE tenant_id = ? AND completed_at IS NULL AND superseded_at IS NULL
         AND provider_subscription_id IS NULL
         AND datetime(expires_at) <= datetime(?)`,
    )
      .bind(now, tenantId, now)
      .run();

    const id = crypto.randomUUID();
    const selectedPlanId = configuredPlanId(env, interval);
    const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
    try {
      const result = await env.DB.prepare(
        `INSERT INTO billing_checkout_references
           (id, tenant_id, provider, plan, interval, provider_plan_id, expires_at)
         SELECT ?, ?, ?, 'zoption_pro', ?, ?, ?
         WHERE NOT EXISTS (
           SELECT 1 FROM billing_subscriptions
           WHERE tenant_id = ? AND ${CHECKOUT_BLOCKING_SUBSCRIPTION_CONDITION}
         )`,
      )
        .bind(id, tenantId, provider, interval, selectedPlanId, expiresAt, tenantId)
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
          `SELECT id, provider, interval, provider_plan_id AS providerPlanId,
                  provider_subscription_id AS providerSubscriptionId, created_at AS createdAt,
                  expires_at AS expiresAt
           FROM billing_checkout_references
           WHERE tenant_id = ? AND completed_at IS NULL AND superseded_at IS NULL
             AND (
               datetime(expires_at) > datetime(?)
               OR provider_subscription_id IS NOT NULL
             )
           LIMIT 1`,
        )
          .bind(tenantId, now)
          .first<{
            id: string;
            provider: BillingProvider;
            interval: BillingInterval;
            providerPlanId: string;
            providerSubscriptionId: string | null;
            createdAt: string;
            expiresAt: string;
          }>();
        if (
          existing?.provider === provider &&
          existing.interval === interval &&
          existing.providerPlanId === selectedPlanId
        ) {
          return {
            reference: existing.id,
            provider: existing.provider,
            interval: existing.interval,
            providerPlanId: existing.providerPlanId,
            providerSubscriptionId: existing.providerSubscriptionId,
            createdAt: existing.createdAt,
            expiresAt: existing.expiresAt,
          };
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
      interval,
      providerPlanId: selectedPlanId,
      providerSubscriptionId: null,
      createdAt: now,
      expiresAt,
    };
  },

  createMonthlyImportUsageStatement(env, tenantId) {
    return buildMonthlyImportUsageStatement(env, tenantId);
  },

  async rethrowMonthlyImportUsageError(env, tenantId, error) {
    if (isMonthlyLimitDatabaseError(error)) {
      throw await monthlyImportLimitError(env, tenantId);
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

  async getProviderSubscription(env, tenantId, provider) {
    const subscription = await env.DB.prepare(
      `SELECT provider, provider_subscription_id AS providerSubscriptionId,
              provider_customer_id AS providerCustomerId, provider_plan_id AS providerPlanId,
              status, current_period_ends_at AS currentPeriodEndsAt,
              cancel_at_period_end AS cancelAtPeriodEnd
       FROM billing_subscriptions
       WHERE tenant_id = ? AND provider = ? AND ${CHECKOUT_BLOCKING_SUBSCRIPTION_CONDITION}
       ORDER BY last_provider_occurred_at DESC, last_provider_event_id DESC
       LIMIT 1`,
    )
      .bind(tenantId, provider)
      .first<BillingProviderSubscriptionRow>();
    if (!subscription) return null;
    return { ...subscription, cancelAtPeriodEnd: Boolean(subscription.cancelAtPeriodEnd) };
  },

  async getPendingCheckout(env, tenantId) {
    return pendingCheckoutReference(env, tenantId);
  },

  async listDuePendingCheckouts(env, limit) {
    const boundedLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
    const rows = await env.DB.prepare(
      `SELECT id AS reference, tenant_id AS tenantId, provider, interval,
              provider_plan_id AS providerPlanId,
              provider_subscription_id AS providerSubscriptionId,
              created_at AS createdAt, expires_at AS expiresAt
       FROM billing_checkout_references
       WHERE provider = 'paypal' AND completed_at IS NULL AND superseded_at IS NULL
         AND provider_subscription_id IS NOT NULL
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
