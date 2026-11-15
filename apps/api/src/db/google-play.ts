import type { BillingInterval, BillingPlanKey, BillingSubscriptionStatus } from "@zoption/shared";

import type { Bindings } from "../types";
import type { BillingSubscriptionApplyOutcome, BillingSubscriptionSnapshot } from "./billing";
import { applySubscriptionUpdate, type SubscriptionOwner } from "./billing-apply";

// Google Play subscription rows in `billing_subscriptions`: the purchase token is the
// subscription id, and `last_provider_occurred_at` is when the Worker last read it from Google.

export interface StoredGooglePlayPurchase {
  plan: BillingPlanKey;
  interval: BillingInterval;
  status: BillingSubscriptionStatus;
  currentPeriodEndsAt: string | null;
  cancelAtPeriodEnd: boolean;
}

export interface GooglePlayRepository {
  /** Stores a verified read. `owner` claims a token the first time its payer reports it. */
  applyPurchase(
    env: Bindings,
    snapshot: BillingSubscriptionSnapshot,
    owner?: SubscriptionOwner,
  ): Promise<BillingSubscriptionApplyOutcome>;
  getPurchase(
    env: Bindings,
    tenantId: string,
    purchaseToken: string,
  ): Promise<StoredGooglePlayPurchase | null>;
  /**
   * Ends a token Google replaced with a new one (an upgrade, downgrade, or resubscribe names the
   * old token as `linkedPurchaseToken`). Only the same payer's row is touched.
   */
  supersedePurchase(env: Bindings, tenantId: string, purchaseToken: string): Promise<void>;
  /** System scoped: ends a stored token Google no longer knows. */
  expirePurchase(env: Bindings, purchaseToken: string): Promise<void>;
  /** System scoped: live tokens not read today, or whose period just ended without a renewal. */
  listDuePurchases(env: Bindings, limit: number): Promise<string[]>;
}

const END_PURCHASE_SQL = `UPDATE billing_subscriptions
  SET status = 'canceled', cancel_at_period_end = 0, provider_status = ?,
      current_period_ends_at = CASE
        WHEN current_period_ends_at IS NULL OR datetime(current_period_ends_at) > datetime(?)
        THEN ? ELSE current_period_ends_at
      END,
      last_provider_occurred_at = ?, last_provider_event_id = ?, updated_at = datetime('now')
  WHERE provider = 'google_play' AND provider_subscription_id = ?`;

function endPurchase(
  env: Bindings,
  purchaseToken: string,
  reason: string,
  tenantId: string | null,
): Promise<D1Result> {
  const now = new Date().toISOString();
  const statement = tenantId
    ? env.DB.prepare(`${END_PURCHASE_SQL} AND tenant_id = ?`).bind(
        reason,
        now,
        now,
        now,
        reason,
        purchaseToken,
        tenantId,
      )
    : env.DB.prepare(END_PURCHASE_SQL).bind(reason, now, now, now, reason, purchaseToken);
  return statement.run();
}

export const googlePlayRepository: GooglePlayRepository = {
  applyPurchase(env, snapshot, owner) {
    return applySubscriptionUpdate(env, snapshot, undefined, owner);
  },

  async getPurchase(env, tenantId, purchaseToken) {
    const row = await env.DB.prepare(
      `SELECT plan, interval, status, current_period_ends_at AS currentPeriodEndsAt,
              cancel_at_period_end AS cancelAtPeriodEnd
       FROM billing_subscriptions
       WHERE provider = 'google_play' AND provider_subscription_id = ? AND tenant_id = ?`,
    )
      .bind(purchaseToken, tenantId)
      .first<Omit<StoredGooglePlayPurchase, "cancelAtPeriodEnd"> & { cancelAtPeriodEnd: number }>();
    if (!row) return null;
    return { ...row, cancelAtPeriodEnd: Boolean(row.cancelAtPeriodEnd) };
  },

  async supersedePurchase(env, tenantId, purchaseToken) {
    await endPurchase(env, purchaseToken, "SUPERSEDED", tenantId);
  },

  async expirePurchase(env, purchaseToken) {
    await endPurchase(env, purchaseToken, "TOKEN_GONE", null);
  },

  async listDuePurchases(env, limit) {
    const boundedLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
    const rows = await env.DB.prepare(
      `SELECT provider_subscription_id AS purchaseToken
       FROM billing_subscriptions
       WHERE provider = 'google_play'
         AND (
           status IN ('active', 'trialing', 'past_due', 'paused')
           OR (
             status = 'canceled' AND cancel_at_period_end = 1
             AND datetime(current_period_ends_at) > datetime('now', '-3 days')
           )
         )
         AND (
           datetime(last_provider_occurred_at) <= datetime('now', '-1 day')
           OR (
             (status IN ('active', 'trialing') OR cancel_at_period_end = 1)
             AND datetime(current_period_ends_at) <= datetime('now')
             AND datetime(last_provider_occurred_at) <= datetime('now', '-30 minutes')
           )
         )
       ORDER BY last_provider_occurred_at
       LIMIT ?`,
    )
      .bind(boundedLimit)
      .all<{ purchaseToken: string }>();
    return rows.results.map((row) => row.purchaseToken);
  },
};
