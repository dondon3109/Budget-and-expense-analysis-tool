import {
  mobileSyncSubscriptionUpdateSchema,
  subscriptionInputSchema,
  type SubscriptionInput,
  type SubscriptionStatus,
} from "@zoption/shared";

import type { LocalCommandContext } from "../context";
import { LocalMutationError, subscriptionSnapshot, uuidSchema } from "../model";

export function createSubscription(
  ctx: LocalCommandContext,
  value: SubscriptionInput,
): Promise<string> {
  const input = subscriptionInputSchema.parse(value);
  return ctx.writer.run(async () => {
    let entityId = "";
    await ctx.database.withTransactionAsync(async () => {
      await ctx.store.validateSubscriptionReferences(input);
      await ctx.clientId();
      entityId = uuidSchema.parse(ctx.randomUuid());
      await ctx.database.runAsync(
        `INSERT INTO subscriptions (
          id, name, amount_minor, currency, billing_cycle, next_billing_date, status,
          category_id, account_id, server_revision, server_updated_at, deleted_at, sync_state
        ) VALUES (?, ?, ?, 'PHP', ?, ?, 'active', ?, ?, 0, NULL, NULL, 'pending')`,
        entityId,
        input.name,
        input.amountMinor,
        input.billingCycle,
        input.nextBillingDate,
        input.categoryId,
        input.accountId,
      );
      await ctx.database.runAsync(
        `INSERT INTO sync_outbox (
          operation_id, idempotency_key, entity_type, entity_id, operation_type,
          base_revision, payload_json, dependency_ids_json, base_json, created_sequence
        ) VALUES (?, ?, 'subscription', ?, 'create', 0, ?, '[]', '{}', ?)`,
        uuidSchema.parse(ctx.randomUuid()),
        uuidSchema.parse(ctx.randomUuid()),
        entityId,
        JSON.stringify({
          name: input.name,
          amountMinor: input.amountMinor,
          billingCycle: input.billingCycle,
          nextBillingDate: input.nextBillingDate,
          categoryId: input.categoryId,
          accountId: input.accountId,
        }),
        await ctx.store.nextSequence(),
      );
    });
    return entityId;
  });
}

export function updateSubscription(
  ctx: LocalCommandContext,
  id: string,
  value: SubscriptionInput & { status?: SubscriptionStatus },
): Promise<void> {
  const update = mobileSyncSubscriptionUpdateSchema.parse(value);
  return ctx.writer.run(async () => {
    await ctx.database.withTransactionAsync(async () => {
      const current = await ctx.store.currentSubscriptionById(id);
      if (current.sync_state === "failed" || current.sync_state === "conflicted") {
        throw new LocalMutationError(
          "Resolve this subscription's synchronization state before editing it.",
          "mutation_blocked",
        );
      }
      const outbox = await ctx.store.currentOutbox("subscription", id);
      if (outbox?.operation_type === "delete") {
        throw new LocalMutationError(
          "This subscription is already waiting to be deleted.",
          "mutation_blocked",
        );
      }
      if (outbox && (outbox.state !== "pending" || outbox.attempt_count > 0)) {
        throw new LocalMutationError(
          "Wait for the current synchronization attempt before editing this subscription.",
          "mutation_blocked",
        );
      }
      const merged = {
        name: update.name ?? current.name,
        amountMinor: update.amountMinor ?? current.amount_minor,
        billingCycle: update.billingCycle ?? current.billing_cycle,
        nextBillingDate: update.nextBillingDate ?? current.next_billing_date,
        categoryId: update.categoryId ?? current.category_id,
        accountId: update.accountId ?? current.account_id,
        status: update.status ?? current.status,
      };
      await ctx.store.validateSubscriptionReferences(merged);
      if (outbox) {
        await ctx.database.runAsync(
          `UPDATE sync_outbox SET payload_json = ?, state = 'pending', attempt_count = 0,
            next_attempt_at = NULL, last_error_code = NULL WHERE operation_id = ?`,
          JSON.stringify(merged),
          outbox.operation_id,
        );
      } else {
        await ctx.database.runAsync(
          `INSERT INTO sync_outbox (
            operation_id, idempotency_key, entity_type, entity_id, operation_type,
            base_revision, payload_json, dependency_ids_json, base_json, created_sequence
          ) VALUES (?, ?, 'subscription', ?, 'update', ?, ?, '[]', ?, ?)`,
          uuidSchema.parse(ctx.randomUuid()),
          uuidSchema.parse(ctx.randomUuid()),
          id,
          current.server_revision,
          JSON.stringify(merged),
          JSON.stringify(subscriptionSnapshot(current)),
          await ctx.store.nextSequence(),
        );
      }
      await ctx.database.runAsync(
        `UPDATE subscriptions SET
          name = ?, amount_minor = ?, billing_cycle = ?, next_billing_date = ?,
          status = ?, category_id = ?, account_id = ?, sync_state = 'pending'
         WHERE id = ?`,
        merged.name,
        merged.amountMinor,
        merged.billingCycle,
        merged.nextBillingDate,
        merged.status,
        merged.categoryId,
        merged.accountId,
        id,
      );
    });
  });
}

export function deleteSubscription(ctx: LocalCommandContext, id: string): Promise<void> {
  return ctx.writer.run(async () => {
    await ctx.database.withTransactionAsync(async () => {
      const current = await ctx.store.currentSubscriptionById(id);
      if (current.sync_state === "failed" || current.sync_state === "conflicted") {
        throw new LocalMutationError(
          "Resolve this subscription's synchronization state before deleting it.",
          "mutation_blocked",
        );
      }
      const outbox = await ctx.store.currentOutbox("subscription", id);
      if (outbox && (outbox.state !== "pending" || outbox.attempt_count > 0)) {
        throw new LocalMutationError(
          "Wait for the current synchronization attempt before deleting this subscription.",
          "mutation_blocked",
        );
      }
      if (current.server_revision === 0 && outbox?.operation_type === "create") {
        await ctx.database.runAsync(
          "DELETE FROM sync_outbox WHERE operation_id = ?",
          outbox.operation_id,
        );
        await ctx.database.runAsync("DELETE FROM subscriptions WHERE id = ?", id);
        return;
      }
      if (outbox) {
        await ctx.database.runAsync(
          `UPDATE sync_outbox SET operation_type = 'delete', payload_json = '{}',
            state = 'pending', attempt_count = 0, next_attempt_at = NULL,
            last_error_code = NULL WHERE operation_id = ?`,
          outbox.operation_id,
        );
      } else {
        await ctx.database.runAsync(
          `INSERT INTO sync_outbox (
            operation_id, idempotency_key, entity_type, entity_id, operation_type,
            base_revision, payload_json, dependency_ids_json, base_json, created_sequence
          ) VALUES (?, ?, 'subscription', ?, 'delete', ?, '{}', '[]', ?, ?)`,
          uuidSchema.parse(ctx.randomUuid()),
          uuidSchema.parse(ctx.randomUuid()),
          id,
          current.server_revision,
          JSON.stringify(subscriptionSnapshot(current)),
          await ctx.store.nextSequence(),
        );
      }
      await ctx.database.runAsync(
        "UPDATE subscriptions SET deleted_at = ?, sync_state = 'pending' WHERE id = ?",
        ctx.now().toISOString(),
        id,
      );
    });
  });
}
