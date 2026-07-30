import type {
  BillingCapability,
  BillingFeature,
  BillingInterval,
  BillingSubscriptionStatus,
  BillingSummary,
  BillingUsage,
} from "@zoption/shared";

import { HttpError } from "../errors";
import type { Bindings } from "../types";

const FREE_LIMITS: Record<BillingFeature, number> = {
  assistant_question: 4,
  file_import: 1,
};

const PRO_LIMITS: Record<BillingFeature, number> = {
  assistant_question: 100,
  file_import: 10,
};

export const PRO_BILLING_STATUSES = ["active", "trialing"] as const;
export const NON_TERMINAL_BILLING_STATUSES = ["active", "trialing", "past_due", "paused"] as const;

const PRO_STATUS_SET = new Set<BillingSubscriptionStatus>(PRO_BILLING_STATUSES);
const NON_TERMINAL_STATUS_SET = new Set<BillingSubscriptionStatus>(NON_TERMINAL_BILLING_STATUSES);

export function manilaMonth(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-01`;
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

function priceId(env: Bindings, interval: BillingInterval): string {
  const value =
    interval === "month" ? env.PADDLE_PRO_MONTHLY_PRICE_ID : env.PADDLE_PRO_ANNUAL_PRICE_ID;
  if (!value?.startsWith("pri_")) {
    throw new HttpError(503, "billing_not_configured", "Billing is not configured yet.");
  }
  return value;
}

function configuredInterval(env: Bindings, paddlePriceId: string): BillingInterval | null {
  if (paddlePriceId === env.PADDLE_PRO_MONTHLY_PRICE_ID) return "month";
  if (paddlePriceId === env.PADDLE_PRO_ANNUAL_PRICE_ID) return "year";
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
    message.includes("billing_webhook_events.paddle_event_id")
  );
}

interface SubscriptionSummaryRow {
  status: BillingSubscriptionStatus;
  interval: BillingInterval | null;
  currentPeriodEndsAt: string | null;
  scheduledChangeAt: string | null;
}

export interface BillingSubscriptionEvent {
  id: string;
  type: string;
  occurredAt: string;
  subscriptionId: string;
  customerId: string;
  productId: string;
  priceId: string;
  status: BillingSubscriptionStatus;
  interval: BillingInterval | null;
  currentPeriodEndsAt: string | null;
  scheduledChangeAt: string | null;
  checkoutReference: string | null;
}

export interface BillingRepository {
  getSummary(env: Bindings, tenantId: string): Promise<BillingSummary>;
  requirePro(env: Bindings, tenantId: string, capability: BillingCapability): Promise<void>;
  createCheckoutReference(
    env: Bindings,
    tenantId: string,
    interval: BillingInterval,
  ): Promise<{ reference: string; priceId: string }>;
  createUsageStatement(
    env: Bindings,
    tenantId: string,
    feature: BillingFeature,
  ): D1PreparedStatement;
  consumeUsage(env: Bindings, tenantId: string, feature: BillingFeature): Promise<void>;
  rethrowUsageError(
    env: Bindings,
    tenantId: string,
    feature: BillingFeature,
    error: unknown,
  ): Promise<never>;
  hasNonTerminalSubscription(env: Bindings, tenantId: string): Promise<boolean>;
  getPortalCustomer(
    env: Bindings,
    tenantId: string,
  ): Promise<{ customerId: string; subscriptionIds: string[] } | null>;
  applySubscriptionEvent(env: Bindings, event: BillingSubscriptionEvent): Promise<void>;
}

async function currentSubscription(
  env: Bindings,
  tenantId: string,
): Promise<SubscriptionSummaryRow | null> {
  return env.DB.prepare(
    `SELECT status, interval, current_period_ends_at AS currentPeriodEndsAt,
            scheduled_change_at AS scheduledChangeAt
     FROM billing_subscriptions
     WHERE tenant_id = ?
     ORDER BY CASE status
       WHEN 'active' THEN 0
       WHEN 'trialing' THEN 1
       WHEN 'past_due' THEN 2
       WHEN 'paused' THEN 3
       ELSE 4
     END, last_paddle_occurred_at DESC, last_paddle_event_id DESC
     LIMIT 1`,
  )
    .bind(tenantId)
    .first<SubscriptionSummaryRow>();
}

async function hasProSubscription(env: Bindings, tenantId: string): Promise<boolean> {
  const row = await env.DB.prepare(
    "SELECT 1 AS found FROM billing_subscriptions WHERE tenant_id = ? AND status IN ('active', 'trialing') LIMIT 1",
  )
    .bind(tenantId)
    .first<{ found: number }>();
  return Boolean(row);
}

async function nonTerminalSubscriptionCount(env: Bindings, tenantId: string): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS count FROM billing_subscriptions
     WHERE tenant_id = ? AND status IN ('active', 'trialing', 'past_due', 'paused')`,
  )
    .bind(tenantId)
    .first<{ count: number }>();
  return Number(row?.count ?? 0);
}

async function usage(
  env: Bindings,
  tenantId: string,
  feature: BillingFeature,
  limit: number,
): Promise<BillingUsage> {
  const row = await env.DB.prepare(
    "SELECT count FROM billing_monthly_usage WHERE tenant_id = ? AND month = ? AND feature = ?",
  )
    .bind(tenantId, manilaMonth(), feature)
    .first<{ count: number }>();
  return { feature, used: Number(row?.count ?? 0), limit, resetsAt: nextManilaMonth() };
}

async function monthlyLimitError(
  env: Bindings,
  tenantId: string,
  feature: BillingFeature,
): Promise<HttpError> {
  const isPro = await hasProSubscription(env, tenantId);
  const limit = (isPro ? PRO_LIMITS : FREE_LIMITS)[feature];
  const item = await usage(env, tenantId, feature, limit);
  return new HttpError(409, "monthly_limit_reached", "You have reached this month’s plan limit.", {
    feature,
    used: item.used,
    limit,
    resetsAt: item.resetsAt,
    billingPath: "/app/settings",
  });
}

function buildUsageStatement(
  env: Bindings,
  tenantId: string,
  feature: BillingFeature,
): D1PreparedStatement {
  const proLimit = PRO_LIMITS[feature];
  const freeLimit = FREE_LIMITS[feature];
  return env.DB.prepare(
    `INSERT INTO billing_monthly_usage (tenant_id, month, feature, count, allowance)
     VALUES (
       ?, ?, ?, 1,
       CASE WHEN EXISTS (
         SELECT 1 FROM billing_subscriptions
         WHERE tenant_id = ? AND status IN ('active', 'trialing')
       ) THEN ? ELSE ? END
     )
     ON CONFLICT(tenant_id, month, feature) DO UPDATE SET
       count = billing_monthly_usage.count + 1,
       allowance = CASE WHEN EXISTS (
         SELECT 1 FROM billing_subscriptions
         WHERE tenant_id = ? AND status IN ('active', 'trialing')
       ) THEN ? ELSE ? END,
       updated_at = datetime('now')`,
  ).bind(
    tenantId,
    manilaMonth(),
    feature,
    tenantId,
    proLimit,
    freeLimit,
    tenantId,
    proLimit,
    freeLimit,
  );
}

export const billingRepository: BillingRepository = {
  async getSummary(env, tenantId) {
    const [subscription, isPro, nonTerminalCount] = await Promise.all([
      currentSubscription(env, tenantId),
      hasProSubscription(env, tenantId),
      nonTerminalSubscriptionCount(env, tenantId),
    ]);
    const plan = isPro ? "zoption_pro" : "free";
    const limits = isPro ? PRO_LIMITS : FREE_LIMITS;
    return {
      plan,
      status: subscription?.status ?? null,
      interval: subscription?.interval ?? null,
      currentPeriodEndsAt: subscription?.currentPeriodEndsAt ?? null,
      scheduledChangeAt: subscription?.scheduledChangeAt ?? null,
      canCheckout: nonTerminalCount === 0,
      canManageBilling: Boolean(subscription),
      nonTerminalSubscriptionCount: nonTerminalCount,
      usages: await Promise.all(
        (Object.keys(limits) as BillingFeature[]).map((feature) =>
          usage(env, tenantId, feature, limits[feature]),
        ),
      ),
    };
  },

  async requirePro(env, tenantId, capability) {
    if (await hasProSubscription(env, tenantId)) return;
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
        "Manage your existing subscription in the billing portal.",
        { billingPath: "/app/settings" },
      );
    }

    const now = new Date().toISOString();
    await env.DB.prepare(
      `UPDATE billing_checkout_references
       SET superseded_at = ?, updated_at = datetime('now')
       WHERE tenant_id = ? AND completed_at IS NULL AND superseded_at IS NULL
         AND datetime(expires_at) <= datetime(?)`,
    )
      .bind(now, tenantId, now)
      .run();

    const id = crypto.randomUUID();
    const selectedPriceId = priceId(env, interval);
    const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
    try {
      const result = await env.DB.prepare(
        `INSERT INTO billing_checkout_references
           (id, tenant_id, plan, interval, paddle_price_id, expires_at)
         SELECT ?, ?, 'zoption_pro', ?, ?, ?
         WHERE NOT EXISTS (
           SELECT 1 FROM billing_subscriptions
           WHERE tenant_id = ? AND status IN ('active', 'trialing', 'past_due', 'paused')
         )`,
      )
        .bind(id, tenantId, interval, selectedPriceId, expiresAt, tenantId)
        .run();
      if ((result.meta.changes ?? 0) !== 1) {
        throw new HttpError(
          409,
          "subscription_already_exists",
          "Manage your existing subscription in the billing portal.",
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
          `SELECT id, interval, paddle_price_id AS priceId
           FROM billing_checkout_references
           WHERE tenant_id = ? AND completed_at IS NULL AND superseded_at IS NULL
             AND datetime(expires_at) > datetime(?)
           LIMIT 1`,
        )
          .bind(tenantId, now)
          .first<{ id: string; interval: BillingInterval; priceId: string }>();
        if (existing?.interval === interval && existing.priceId === selectedPriceId) {
          return { reference: existing.id, priceId: existing.priceId };
        }
        throw new HttpError(
          409,
          "checkout_in_progress",
          "A checkout is already open. Finish it or try again after it expires.",
        );
      }
      throw error;
    }
    return { reference: id, priceId: selectedPriceId };
  },

  createUsageStatement(env, tenantId, feature) {
    return buildUsageStatement(env, tenantId, feature);
  },

  async consumeUsage(env, tenantId, feature) {
    try {
      await buildUsageStatement(env, tenantId, feature).run();
    } catch (error) {
      await this.rethrowUsageError(env, tenantId, feature, error);
    }
  },

  async rethrowUsageError(env, tenantId, feature, error) {
    if (isMonthlyLimitDatabaseError(error)) {
      throw await monthlyLimitError(env, tenantId, feature);
    }
    throw error;
  },

  async hasNonTerminalSubscription(env, tenantId) {
    const row = await env.DB.prepare(
      `SELECT 1 AS found FROM billing_subscriptions
       WHERE tenant_id = ? AND status IN ('active', 'trialing', 'past_due', 'paused')
       LIMIT 1`,
    )
      .bind(tenantId)
      .first<{ found: number }>();
    return Boolean(row);
  },

  async getPortalCustomer(env, tenantId) {
    const customer = await env.DB.prepare(
      "SELECT paddle_customer_id AS customerId FROM billing_customers WHERE tenant_id = ?",
    )
      .bind(tenantId)
      .first<{ customerId: string }>();
    if (!customer) return null;

    const subscriptions = await env.DB.prepare(
      `SELECT paddle_subscription_id AS subscriptionId
       FROM billing_subscriptions
       WHERE tenant_id = ? AND status IN ('active', 'trialing', 'past_due', 'paused')
       ORDER BY last_paddle_occurred_at DESC, last_paddle_event_id DESC`,
    )
      .bind(tenantId)
      .all<{ subscriptionId: string }>();
    return {
      customerId: customer.customerId,
      subscriptionIds: subscriptions.results.map((row) => row.subscriptionId),
    };
  },

  async applySubscriptionEvent(env, event) {
    const interval = configuredInterval(env, event.priceId);
    if (!interval || (event.interval && event.interval !== interval)) return;

    const existingEvent = await env.DB.prepare(
      "SELECT 1 AS found FROM billing_webhook_events WHERE paddle_event_id = ?",
    )
      .bind(event.id)
      .first();
    if (existingEvent) return;

    const existingSubscription = await env.DB.prepare(
      `SELECT tenant_id AS tenantId, paddle_customer_id AS customerId
       FROM billing_subscriptions
       WHERE paddle_subscription_id = ?`,
    )
      .bind(event.subscriptionId)
      .first<{ tenantId: string; customerId: string }>();
    if (existingSubscription && existingSubscription.customerId !== event.customerId) {
      throw new HttpError(409, "invalid_webhook_ownership", "Invalid webhook ownership.");
    }

    const reference =
      !existingSubscription && event.checkoutReference
        ? await env.DB.prepare(
            `SELECT tenant_id AS tenantId, paddle_price_id AS priceId
             FROM billing_checkout_references
             WHERE id = ? AND completed_at IS NULL
               AND datetime(?) >= datetime(created_at)
               AND datetime(?) <= datetime(expires_at)
               AND (superseded_at IS NULL OR datetime(?) <= datetime(superseded_at))`,
          )
            .bind(event.checkoutReference, event.occurredAt, event.occurredAt, event.occurredAt)
            .first<{ tenantId: string; priceId: string }>()
        : null;
    if (reference && reference.priceId !== event.priceId) {
      throw new HttpError(409, "invalid_webhook_price", "Invalid webhook price.");
    }

    const knownCustomer = !existingSubscription
      ? await env.DB.prepare(
          "SELECT tenant_id AS tenantId FROM billing_customers WHERE paddle_customer_id = ?",
        )
          .bind(event.customerId)
          .first<{ tenantId: string }>()
      : null;
    const tenantId =
      existingSubscription?.tenantId ?? reference?.tenantId ?? knownCustomer?.tenantId;
    if (!tenantId) return;

    const customerLinks = await env.DB.prepare(
      `SELECT tenant_id AS tenantId, paddle_customer_id AS customerId
       FROM billing_customers
       WHERE tenant_id = ? OR paddle_customer_id = ?`,
    )
      .bind(tenantId, event.customerId)
      .all<{ tenantId: string; customerId: string }>();
    if (
      customerLinks.results.some(
        (customer) => customer.tenantId !== tenantId || customer.customerId !== event.customerId,
      )
    ) {
      throw new HttpError(409, "invalid_webhook_ownership", "Invalid webhook ownership.");
    }

    const statements = [
      env.DB.prepare(
        "INSERT INTO billing_webhook_events (paddle_event_id, event_type, occurred_at) VALUES (?, ?, ?)",
      ).bind(event.id, event.type, event.occurredAt),
      env.DB.prepare(
        `INSERT OR IGNORE INTO billing_customers (tenant_id, paddle_customer_id)
         VALUES (?, ?)`,
      ).bind(tenantId, event.customerId),
      env.DB.prepare(
        `INSERT INTO billing_subscriptions
           (paddle_subscription_id, tenant_id, paddle_customer_id, paddle_product_id,
            paddle_price_id, status, interval, current_period_ends_at, scheduled_change_at,
            last_paddle_occurred_at, last_paddle_event_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(paddle_subscription_id) DO UPDATE SET
           paddle_customer_id = excluded.paddle_customer_id,
           paddle_product_id = excluded.paddle_product_id,
           paddle_price_id = excluded.paddle_price_id,
           status = excluded.status,
           interval = excluded.interval,
           current_period_ends_at = excluded.current_period_ends_at,
           scheduled_change_at = excluded.scheduled_change_at,
           last_paddle_occurred_at = excluded.last_paddle_occurred_at,
           last_paddle_event_id = excluded.last_paddle_event_id,
           updated_at = datetime('now')
         WHERE excluded.last_paddle_occurred_at > billing_subscriptions.last_paddle_occurred_at
            OR (
              excluded.last_paddle_occurred_at = billing_subscriptions.last_paddle_occurred_at
              AND excluded.last_paddle_event_id > billing_subscriptions.last_paddle_event_id
            )`,
      ).bind(
        event.subscriptionId,
        tenantId,
        event.customerId,
        event.productId,
        event.priceId,
        event.status,
        interval,
        event.currentPeriodEndsAt,
        event.scheduledChangeAt,
        event.occurredAt,
        event.id,
      ),
    ];
    if (reference && event.checkoutReference) {
      statements.push(
        env.DB.prepare(
          `UPDATE billing_checkout_references
           SET completed_at = ?, updated_at = datetime('now')
           WHERE id = ? AND completed_at IS NULL`,
        ).bind(event.occurredAt, event.checkoutReference),
      );
    }

    try {
      await env.DB.batch(statements);
    } catch (error) {
      if (isWebhookDuplicateError(error)) return;
      throw error;
    }
  },
};

export function isNonTerminalBillingStatus(status: BillingSubscriptionStatus): boolean {
  return NON_TERMINAL_STATUS_SET.has(status);
}

export function isProBillingStatus(status: BillingSubscriptionStatus): boolean {
  return PRO_STATUS_SET.has(status);
}
