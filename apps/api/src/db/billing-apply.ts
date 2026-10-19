import { isFamilyPlan } from "@zoption/shared";

import { configuredPlan } from "../billing/plan-ids";
import { HttpError } from "../errors";
import type { Bindings } from "../types";
import type { BillingSubscriptionApplyOutcome, BillingSubscriptionSnapshot } from "./billing";
import { databaseMessage } from "./billing-usage";

function isWebhookDuplicateError(error: unknown): boolean {
  const message = databaseMessage(error);
  return (
    message.includes("unique constraint failed") &&
    (message.includes("billing_webhook_events.provider") ||
      message.includes("billing_webhook_events.provider_event_id"))
  );
}

/**
 * Applies a provider's subscription state, from a verified webhook or a reconciliation read. A
 * new subscription is matched to the checkout that sold it and inherits its family; an update
 * older than the stored one is ignored.
 */
export async function applySubscriptionUpdate(
  env: Bindings,
  update: BillingSubscriptionSnapshot,
  webhook?: { providerEventId: string; type: string },
): Promise<BillingSubscriptionApplyOutcome> {
  const configured = configuredPlan(env, update.provider, update.providerPlanId);
  if (
    !update.revocation &&
    (!configured || (update.interval && update.interval !== configured.interval))
  ) {
    return "rejected_plan";
  }
  // A revocation of a subscription whose plan is no longer configured keeps the plan and
  // interval already recorded on its row instead of erasing them.
  const interval = configured?.interval ?? update.interval;
  const plan = configured?.plan ?? null;

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
            family_tenant_id AS familyTenantId,
            last_provider_occurred_at AS lastProviderOccurredAt,
            last_provider_event_id AS lastProviderEventId
     FROM billing_subscriptions
     WHERE provider = ? AND provider_subscription_id = ?`,
  )
    .bind(update.provider, update.providerSubscriptionId)
    .first<{
      tenantId: string;
      providerCustomerId: string | null;
      familyTenantId: string | null;
      lastProviderOccurredAt: string;
      lastProviderEventId: string;
    }>();
  // A plan change never turns a personal plan into a family one or back.
  if (
    existingSubscription &&
    plan &&
    isFamilyPlan(plan) !== (existingSubscription.familyTenantId !== null)
  ) {
    return "rejected_plan";
  }
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
          `SELECT tenant_id AS tenantId, provider_plan_id AS providerPlanId,
                  family_tenant_id AS familyTenantId
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
          .first<{ tenantId: string; providerPlanId: string; familyTenantId: string | null }>()
      : null;

  const tenantId = existingSubscription?.tenantId ?? reference?.tenantId;
  if (!tenantId) return "unmatched";
  const familyTenantId = existingSubscription
    ? existingSubscription.familyTenantId
    : (reference?.familyTenantId ?? null);
  if (!existingSubscription && plan && isFamilyPlan(plan) !== (familyTenantId !== null)) {
    return "rejected_plan";
  }

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
          last_provider_occurred_at, last_provider_event_id, plan, family_tenant_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(provider, provider_subscription_id) DO UPDATE SET
         provider_customer_id = COALESCE(excluded.provider_customer_id, billing_subscriptions.provider_customer_id),
         provider_product_id = COALESCE(excluded.provider_product_id, billing_subscriptions.provider_product_id),
         provider_plan_id = excluded.provider_plan_id,
         plan = COALESCE(excluded.plan, billing_subscriptions.plan),
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
      plan,
      familyTenantId,
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
