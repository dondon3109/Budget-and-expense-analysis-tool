// Conflicts on a subscription.

import {
  mobileSyncSubscriptionSnapshotSchema,
  type SubscriptionBillingCycle,
  type SubscriptionStatus,
} from "@zoption/shared";

import type { LocalMutationContext } from "../context";
import {
  LocalMutationError,
  conflictRowSchema,
  uuidSchema,
  type LocalSubscriptionConflict,
} from "../model";

export function getSubscriptionConflict(
  ctx: LocalMutationContext,
  entityId: string,
): Promise<LocalSubscriptionConflict | null> {
  return ctx.writer.run(async () => {
    const local = await ctx.store.currentSubscriptionRowById(entityId);
    const row = await ctx.database.getFirstAsync(
      `SELECT conflict_id, operation_id, base_json, local_json, server_json,
        server_revision, created_at
       FROM sync_conflicts
       WHERE entity_type = 'subscription' AND entity_id = ? AND resolved_at IS NULL
       ORDER BY created_at DESC
       LIMIT 1`,
      entityId,
    );
    if (!row) return null;
    const conflict = conflictRowSchema.parse(row);
    let serverValue: unknown;
    try {
      serverValue = JSON.parse(conflict.server_json) as unknown;
    } catch {
      throw new LocalMutationError("The preserved conflict is invalid.", "invalid_outbox");
    }
    const serverSnapshot =
      serverValue === null ? null : mobileSyncSubscriptionSnapshotSchema.parse(serverValue);
    return {
      id: conflict.conflict_id,
      entityId,
      local: {
        name: local.name,
        amountMinor: local.amount_minor,
        billingCycle: local.billing_cycle,
        nextBillingDate: local.next_billing_date,
        status: local.status,
        categoryId: local.category_id,
        accountId: local.account_id,
      },
      server: serverSnapshot
        ? {
            name: serverSnapshot.name,
            amountMinor: serverSnapshot.amountMinor,
            billingCycle: serverSnapshot.billingCycle,
            nextBillingDate: serverSnapshot.nextBillingDate,
            status: serverSnapshot.status,
            categoryId: serverSnapshot.categoryId,
            accountId: serverSnapshot.accountId,
          }
        : null,
      serverRevision: conflict.server_revision,
      createdAt: conflict.created_at,
    };
  });
}

export function resolveSubscriptionConflict(
  ctx: LocalMutationContext,
  entityId: string,
  resolution: "keep_local" | "keep_server",
): Promise<void> {
  return ctx.writer.run(async () => {
    await ctx.database.withTransactionAsync(async () => {
      const local = await ctx.store.currentSubscriptionRowById(entityId);
      const conflict = await ctx.store.currentConflict("subscription", entityId);
      const outbox = await ctx.store.currentOutbox("subscription", entityId);
      if (
        !outbox ||
        outbox.operation_id !== conflict.operation_id ||
        outbox.state !== "conflicted"
      ) {
        throw new LocalMutationError(
          "The preserved subscription conflict changed before it could be resolved.",
          "mutation_blocked",
        );
      }
      let serverValue: unknown;
      try {
        serverValue = JSON.parse(conflict.server_json) as unknown;
      } catch {
        throw new LocalMutationError("The preserved conflict is invalid.", "invalid_outbox");
      }
      const serverSnapshot =
        serverValue === null ? null : mobileSyncSubscriptionSnapshotSchema.parse(serverValue);

      await ctx.database.runAsync(
        `UPDATE sync_conflicts SET resolved_at = ?, resolution = ?, operation_id = NULL
         WHERE conflict_id = ? AND resolved_at IS NULL`,
        ctx.now().toISOString(),
        resolution,
        conflict.conflict_id,
      );
      await ctx.database.runAsync(
        "DELETE FROM sync_outbox WHERE operation_id = ?",
        outbox.operation_id,
      );

      if (resolution === "keep_server") {
        if (!serverSnapshot) {
          await ctx.database.runAsync("DELETE FROM subscriptions WHERE id = ?", entityId);
          return;
        }
        await upsertSubscriptionSnapshot(ctx, serverSnapshot, "synced");
        return;
      }

      const operationType = outbox.operation_type;
      if (operationType === "delete") {
        if (!serverSnapshot) {
          await ctx.database.runAsync("DELETE FROM subscriptions WHERE id = ?", entityId);
          return;
        }
        await ctx.database.runAsync(
          `INSERT INTO sync_outbox (
            operation_id, idempotency_key, entity_type, entity_id, operation_type,
            base_revision, payload_json, dependency_ids_json, base_json, created_sequence
          ) VALUES (?, ?, 'subscription', ?, 'delete', ?, '{}', '[]', ?, ?)`,
          uuidSchema.parse(ctx.randomUuid()),
          uuidSchema.parse(ctx.randomUuid()),
          entityId,
          serverSnapshot.revision,
          JSON.stringify(serverSnapshot),
          await ctx.store.nextSequence(),
        );
        await ctx.database.runAsync(
          "UPDATE subscriptions SET sync_state = 'pending' WHERE id = ?",
          entityId,
        );
        return;
      }

      const localInput = {
        name: local.name,
        amountMinor: local.amount_minor,
        billingCycle: local.billing_cycle,
        nextBillingDate: local.next_billing_date,
        categoryId: local.category_id,
        accountId: local.account_id,
        status: local.status,
      };
      if (!serverSnapshot) {
        await ctx.database.runAsync(
          `UPDATE subscriptions SET server_revision = 0, server_updated_at = NULL,
            sync_state = 'pending' WHERE id = ?`,
          entityId,
        );
        await ctx.database.runAsync(
          `INSERT INTO sync_outbox (
            operation_id, idempotency_key, entity_type, entity_id, operation_type,
            base_revision, payload_json, dependency_ids_json, base_json, created_sequence
          ) VALUES (?, ?, 'subscription', ?, 'create', 0, ?, '[]', '{}', ?)`,
          uuidSchema.parse(ctx.randomUuid()),
          uuidSchema.parse(ctx.randomUuid()),
          entityId,
          JSON.stringify(localInput),
          await ctx.store.nextSequence(),
        );
        return;
      }
      await ctx.database.runAsync(
        `UPDATE subscriptions SET server_revision = ?, server_updated_at = ?,
          sync_state = 'pending' WHERE id = ?`,
        serverSnapshot.revision,
        serverSnapshot.updatedAt,
        entityId,
      );
      await ctx.database.runAsync(
        `INSERT INTO sync_outbox (
          operation_id, idempotency_key, entity_type, entity_id, operation_type,
          base_revision, payload_json, dependency_ids_json, base_json, created_sequence
        ) VALUES (?, ?, 'subscription', ?, 'update', ?, ?, '[]', ?, ?)`,
        uuidSchema.parse(ctx.randomUuid()),
        uuidSchema.parse(ctx.randomUuid()),
        entityId,
        serverSnapshot.revision,
        JSON.stringify(localInput),
        JSON.stringify(serverSnapshot),
        await ctx.store.nextSequence(),
      );
    });
  });
}

async function upsertSubscriptionSnapshot(
  ctx: LocalMutationContext,
  snapshot: {
    id: string;
    name: string;
    amountMinor: number;
    currency: string;
    billingCycle: SubscriptionBillingCycle;
    nextBillingDate: string;
    status: SubscriptionStatus;
    categoryId: string | null;
    accountId: string | null;
    revision: number;
    updatedAt: string | null;
  },
  syncState: "synced" | "pending",
): Promise<void> {
  await ctx.database.runAsync(
    `INSERT INTO subscriptions (
      id, name, amount_minor, currency, billing_cycle, next_billing_date, status,
      category_id, account_id, server_revision, server_updated_at, deleted_at, sync_state
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       amount_minor = excluded.amount_minor,
       currency = excluded.currency,
       billing_cycle = excluded.billing_cycle,
       next_billing_date = excluded.next_billing_date,
       status = excluded.status,
       category_id = excluded.category_id,
       account_id = excluded.account_id,
       server_revision = excluded.server_revision,
       server_updated_at = excluded.server_updated_at,
       deleted_at = NULL,
       sync_state = excluded.sync_state`,
    snapshot.id,
    snapshot.name,
    snapshot.amountMinor,
    snapshot.currency,
    snapshot.billingCycle,
    snapshot.nextBillingDate,
    snapshot.status,
    snapshot.categoryId,
    snapshot.accountId,
    snapshot.revision,
    snapshot.updatedAt,
    syncState,
  );
}
