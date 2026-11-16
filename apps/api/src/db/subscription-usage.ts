import {
  addDaysToIsoDate,
  manilaDate,
  SUBSCRIPTION_IDLE_DAYS,
  SUBSCRIPTION_USAGE_WINDOW_DAYS,
  type SubscriptionUsage,
  type SubscriptionUsageList,
} from "@zoption/shared";

import { proPlanRequiredError, readTier } from "../billing/entitlements";
import { HttpError } from "../errors";
import type { Bindings } from "../types";

/** An active subscription renewing on the nudge date whose last check-in is old enough. */
export interface IdleRenewal {
  tenantId: string;
  subscriptionId: string;
  name: string;
  nextBillingDate: string;
  lastUsedOn: string;
}

/**
 * Subscription ROI check-ins (Pro). The phone and the web both call these online; the log is
 * not part of mobile sync. `today` is the Asia/Manila date unless a caller passes one.
 */
export interface SubscriptionUsageRepository {
  list(env: Bindings, tenantId: string, today?: string): Promise<SubscriptionUsageList>;
  checkIn(
    env: Bindings,
    tenantId: string,
    subscriptionId: string,
    usedOn: string,
    today?: string,
  ): Promise<SubscriptionUsage>;
  undo(
    env: Bindings,
    tenantId: string,
    subscriptionId: string,
    usedOn: string,
    today?: string,
  ): Promise<SubscriptionUsage>;
  /**
   * Pro tenants' active subscriptions renewing on `billingDate` that were checked in at least once
   * but not in the last `SUBSCRIPTION_IDLE_DAYS`, and not nudged for that date yet. A subscription
   * never checked in is not tracked, so it is never nudged.
   */
  listIdleRenewals(
    env: Bindings,
    billingDate: string,
    today: string,
    limit: number,
  ): Promise<IdleRenewal[]>;
  /** Records the nudge for this billing date; false when it was already recorded. */
  claimNudge(env: Bindings, renewal: IdleRenewal): Promise<boolean>;
}

async function requirePro(env: Bindings, tenantId: string): Promise<void> {
  if ((await readTier(env, tenantId)) !== "zoption_pro") {
    throw proPlanRequiredError("subscription_roi");
  }
}

async function requireSubscription(
  env: Bindings,
  tenantId: string,
  subscriptionId: string,
): Promise<void> {
  const row = await env.DB.prepare(
    "SELECT 1 AS found FROM subscriptions WHERE tenant_id = ? AND id = ?",
  )
    .bind(tenantId, subscriptionId)
    .first<{ found: number }>();
  if (!row) throw new HttpError(404, "subscription_not_found", "Subscription not found.");
}

/**
 * A check-in may be a day ahead of the Manila date (a phone west of Manila is never behind it,
 * one east of it can be) and no older than the window the log is read over.
 */
function requireDateInWindow(usedOn: string, today: string): void {
  if (
    usedOn > addDaysToIsoDate(today, 1) ||
    usedOn <= addDaysToIsoDate(today, -SUBSCRIPTION_USAGE_WINDOW_DAYS)
  ) {
    throw new HttpError(400, "invalid_request", "Choose a check-in date from the last year.");
  }
}

async function readUsage(
  env: Bindings,
  tenantId: string,
  subscriptionId: string,
  today: string,
): Promise<SubscriptionUsage> {
  const { results } = await env.DB.prepare(
    `SELECT used_on AS usedOn FROM subscription_usage
     WHERE tenant_id = ? AND subscription_id = ? AND used_on > ?
     ORDER BY used_on`,
  )
    .bind(tenantId, subscriptionId, addDaysToIsoDate(today, -SUBSCRIPTION_USAGE_WINDOW_DAYS))
    .all<{ usedOn: string }>();
  return { subscriptionId, usedOn: results.map((row) => row.usedOn) };
}

export const subscriptionUsageRepository: SubscriptionUsageRepository = {
  async list(env, tenantId, today = manilaDate()) {
    await requirePro(env, tenantId);
    const { results } = await env.DB.prepare(
      `SELECT subscription_id AS subscriptionId, used_on AS usedOn FROM subscription_usage
       WHERE tenant_id = ? AND used_on > ?
       ORDER BY subscription_id, used_on`,
    )
      .bind(tenantId, addDaysToIsoDate(today, -SUBSCRIPTION_USAGE_WINDOW_DAYS))
      .all<{ subscriptionId: string; usedOn: string }>();
    const bySubscription = new Map<string, string[]>();
    for (const row of results) {
      const days = bySubscription.get(row.subscriptionId) ?? [];
      days.push(row.usedOn);
      bySubscription.set(row.subscriptionId, days);
    }
    return {
      usage: [...bySubscription].map(([subscriptionId, usedOn]) => ({ subscriptionId, usedOn })),
    };
  },

  async checkIn(env, tenantId, subscriptionId, usedOn, today = manilaDate()) {
    await requirePro(env, tenantId);
    requireDateInWindow(usedOn, today);
    await requireSubscription(env, tenantId, subscriptionId);
    // A second check-in on the same day is a no-op, so a double tap or a retry is safe.
    await env.DB.prepare(
      `INSERT INTO subscription_usage (tenant_id, subscription_id, used_on) VALUES (?, ?, ?)
       ON CONFLICT DO NOTHING`,
    )
      .bind(tenantId, subscriptionId, usedOn)
      .run();
    return readUsage(env, tenantId, subscriptionId, today);
  },

  async undo(env, tenantId, subscriptionId, usedOn, today = manilaDate()) {
    await requirePro(env, tenantId);
    await requireSubscription(env, tenantId, subscriptionId);
    await env.DB.prepare(
      "DELETE FROM subscription_usage WHERE tenant_id = ? AND subscription_id = ? AND used_on = ?",
    )
      .bind(tenantId, subscriptionId, usedOn)
      .run();
    return readUsage(env, tenantId, subscriptionId, today);
  },

  async listIdleRenewals(env, billingDate, today, limit) {
    const { results } = await env.DB.prepare(
      `SELECT s.tenant_id AS tenantId, s.id AS subscriptionId, s.name,
              s.next_billing_date AS nextBillingDate, MAX(u.used_on) AS lastUsedOn
       FROM subscriptions s
       JOIN subscription_usage u ON u.tenant_id = s.tenant_id AND u.subscription_id = s.id
       JOIN tenants t ON t.id = s.tenant_id AND t.kind = 'user'
       WHERE s.status = 'active' AND s.next_billing_date = ?
         AND (SELECT COALESCE(MAX(rank), 0) FROM effective_plan_access p
              WHERE p.tenant_id = s.tenant_id) >= 2
         AND NOT EXISTS (
           SELECT 1 FROM subscription_usage_nudges n
           WHERE n.tenant_id = s.tenant_id AND n.subscription_id = s.id AND n.billing_date = ?)
       GROUP BY s.tenant_id, s.id
       HAVING MAX(u.used_on) <= ?
       LIMIT ?`,
    )
      .bind(billingDate, billingDate, addDaysToIsoDate(today, -SUBSCRIPTION_IDLE_DAYS), limit)
      .all<IdleRenewal>();
    return results;
  },

  async claimNudge(env, renewal) {
    const result = await env.DB.prepare(
      `INSERT INTO subscription_usage_nudges (tenant_id, subscription_id, billing_date)
       VALUES (?, ?, ?) ON CONFLICT DO NOTHING`,
    )
      .bind(renewal.tenantId, renewal.subscriptionId, renewal.nextBillingDate)
      .run();
    return result.meta.changes > 0;
  },
};
