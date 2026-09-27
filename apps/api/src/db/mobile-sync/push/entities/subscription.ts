import {
  mobileSyncSubscriptionSnapshotSchema,
  normalizeSignedAmount,
  type MobileSyncPushOperation,
} from "@zoption/shared";

import type { Bindings } from "../../../../types";
import type { EntityMutation } from "../results";
import type { EntitySnapshot } from "../snapshots";

type SubscriptionOperation = Extract<MobileSyncPushOperation, { entityType: "subscription" }>;

export function subscriptionMutation(
  env: Bindings,
  tenantId: string,
  operation: SubscriptionOperation,
  current: EntitySnapshot | null,
  timestamp: string,
): EntityMutation {
  let mutation: D1PreparedStatement;
  const extraStatements: D1PreparedStatement[] = [];
  if (operation.operationType === "create") {
    const payload = operation.payload;
    mutation = env.DB.prepare(
      `INSERT INTO subscriptions (
         id, tenant_id, account_id, category_id, name, amount_minor, currency,
         billing_cycle, next_billing_date, last_charged_date, status, revision, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, 'PHP', ?, ?, ?, 'active', 1, ?)`,
    ).bind(
      operation.entityId,
      tenantId,
      payload.accountId,
      payload.categoryId,
      payload.name,
      payload.amountMinor,
      payload.billingCycle,
      payload.nextBillingDate,
      payload.nextBillingDate,
      timestamp,
    );
    extraStatements.push(
      env.DB.prepare(
        `INSERT INTO transactions (
           id, tenant_id, account_id, category_id, date, description, amount_minor,
           currency, kind, source_kind, subscription_id, revision, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, 'PHP', 'expense', 'manual', ?, 1, ?)`,
      ).bind(
        crypto.randomUUID(),
        tenantId,
        payload.accountId,
        payload.categoryId,
        payload.nextBillingDate,
        payload.name,
        normalizeSignedAmount(payload.amountMinor, "expense"),
        operation.entityId,
        timestamp,
      ),
    );
  } else if (operation.operationType === "update") {
    const payload = operation.payload;
    const sub = mobileSyncSubscriptionSnapshotSchema.parse(current);
    const merged = {
      name: payload.name ?? sub.name,
      amountMinor: payload.amountMinor ?? sub.amountMinor,
      billingCycle: payload.billingCycle ?? sub.billingCycle,
      nextBillingDate: payload.nextBillingDate ?? sub.nextBillingDate,
      accountId: payload.accountId ?? sub.accountId,
      categoryId: payload.categoryId ?? sub.categoryId,
      status: payload.status ?? sub.status,
    };
    mutation = env.DB.prepare(
      `UPDATE subscriptions SET
         name = ?, amount_minor = ?, billing_cycle = ?, next_billing_date = ?,
         account_id = ?, category_id = ?, status = ?, updated_at = ?
       WHERE id = ? AND tenant_id = ? AND revision = ?`,
    ).bind(
      merged.name,
      merged.amountMinor,
      merged.billingCycle,
      merged.nextBillingDate,
      merged.accountId,
      merged.categoryId,
      merged.status,
      timestamp,
      operation.entityId,
      tenantId,
      operation.baseRevision,
    );
    if (merged.accountId) {
      extraStatements.push(
        env.DB.prepare(
          `UPDATE transactions SET
             account_id = ?, category_id = ?, date = ?, description = ?,
             amount_minor = ?, currency = 'PHP', kind = 'expense', updated_at = datetime('now')
           WHERE tenant_id = ? AND subscription_id = ?`,
        ).bind(
          merged.accountId,
          merged.categoryId,
          merged.nextBillingDate,
          merged.name,
          normalizeSignedAmount(merged.amountMinor, "expense"),
          tenantId,
          operation.entityId,
        ),
      );
    }
  } else {
    mutation = env.DB.prepare(
      "UPDATE transactions SET subscription_id = NULL, updated_at = datetime('now') WHERE tenant_id = ? AND subscription_id = ?",
    ).bind(tenantId, operation.entityId);
    extraStatements.push(
      env.DB.prepare(
        "DELETE FROM subscriptions WHERE id = ? AND tenant_id = ? AND revision = ?",
      ).bind(operation.entityId, tenantId, operation.baseRevision),
    );
  }
  return { mutation, extraStatements };
}
