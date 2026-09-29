import {
  mobileSyncSubscriptionUpdateSchema,
  subscriptionInputSchema,
  type SubscriptionInput,
  type SubscriptionStatus,
} from "@zoption/shared";

import { useWorkspaceCurrencyStore } from "@/stores/workspace-currency-store";

import type { LocalCommandContext } from "../context";
import { subscriptionSnapshot, uuidSchema } from "../model";
import {
  assertRowSettled,
  assertNotQueuedForRemoval,
  assertNoAttemptInFlight,
  queueCreate,
  queueUpdate,
  queueDelete,
} from "./outbox-writes";

export function createSubscription(
  ctx: LocalCommandContext,
  value: SubscriptionInput,
): Promise<string> {
  const input = subscriptionInputSchema.parse(value);
  return ctx.writer.run(async () => {
    let entityId = "";
    await ctx.database.withTransactionAsync(async () => {
      await ctx.store.validateSubscriptionReferences(input);
      // Omitted means the workspace currency, which the server assigns on create;
      // the local cache mirrors it so the row shows the right symbol before sync.
      const currency = input.currency ?? useWorkspaceCurrencyStore.getState().currency;
      await ctx.clientId();
      entityId = uuidSchema.parse(ctx.randomUuid());
      await ctx.database.runAsync(
        `INSERT INTO subscriptions (
          id, name, amount_minor, currency, billing_cycle, next_billing_date, status,
          category_id, account_id, server_revision, server_updated_at, deleted_at, sync_state
        ) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, 0, NULL, NULL, 'pending')`,
        entityId,
        input.name,
        input.amountMinor,
        currency,
        input.billingCycle,
        input.nextBillingDate,
        input.categoryId,
        input.accountId,
      );
      await queueCreate(ctx, "subscription", entityId, {
        name: input.name,
        amountMinor: input.amountMinor,
        currency,
        billingCycle: input.billingCycle,
        nextBillingDate: input.nextBillingDate,
        categoryId: input.categoryId,
        accountId: input.accountId,
      });
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
      assertRowSettled(current.sync_state, "subscription", "editing");
      const outbox = await ctx.store.currentOutbox("subscription", id);
      assertNotQueuedForRemoval(outbox, "subscription", "deleted");
      assertNoAttemptInFlight(outbox, "subscription", "editing");
      const merged = {
        name: update.name ?? current.name,
        amountMinor: update.amountMinor ?? current.amount_minor,
        currency: update.currency ?? current.currency,
        billingCycle: update.billingCycle ?? current.billing_cycle,
        nextBillingDate: update.nextBillingDate ?? current.next_billing_date,
        categoryId: update.categoryId ?? current.category_id,
        accountId: update.accountId ?? current.account_id,
        status: update.status ?? current.status,
      };
      await ctx.store.validateSubscriptionReferences(merged);
      await queueUpdate(ctx, outbox, {
        entityType: "subscription",
        entityId: id,
        baseRevision: current.server_revision,
        payload: merged,
        base: () => subscriptionSnapshot(current),
      });
      await ctx.database.runAsync(
        `UPDATE subscriptions SET
          name = ?, amount_minor = ?, currency = ?, billing_cycle = ?, next_billing_date = ?,
          status = ?, category_id = ?, account_id = ?, sync_state = 'pending'
         WHERE id = ?`,
        merged.name,
        merged.amountMinor,
        merged.currency,
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
      assertRowSettled(current.sync_state, "subscription", "deleting");
      const outbox = await ctx.store.currentOutbox("subscription", id);
      assertNoAttemptInFlight(outbox, "subscription", "deleting");
      if (current.server_revision === 0 && outbox?.operation_type === "create") {
        await ctx.database.runAsync(
          "DELETE FROM sync_outbox WHERE operation_id = ?",
          outbox.operation_id,
        );
        await ctx.database.runAsync("DELETE FROM subscriptions WHERE id = ?", id);
        return;
      }
      await queueDelete(ctx, outbox, {
        entityType: "subscription",
        entityId: id,
        baseRevision: current.server_revision,
        base: () => subscriptionSnapshot(current),
      });
      await ctx.database.runAsync(
        "UPDATE subscriptions SET deleted_at = ?, sync_state = 'pending' WHERE id = ?",
        ctx.now().toISOString(),
        id,
      );
    });
  });
}
