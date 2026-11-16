import type { SubscriptionUsageList } from "@zoption/shared";

import type { LocalMutationContext } from "../context";

export type SubscriptionUsageAction = "check_in" | "undo" | "track" | "untrack";

export interface QueuedSubscriptionUsage {
  sequence: number;
  subscriptionId: string;
  action: SubscriptionUsageAction;
  usedOn: string | null;
}

/**
 * Applies a Subscription ROI tap to this phone's copy and queues it for upload, in one SQLite
 * transaction, so the card shows it at once and an offline tap is never lost.
 */
export function queueSubscriptionUsage(
  ctx: LocalMutationContext,
  subscriptionId: string,
  action: SubscriptionUsageAction,
  usedOn: string | null = null,
): Promise<void> {
  return ctx.writer.run(() =>
    ctx.database.withTransactionAsync(async () => {
      if (action === "check_in") {
        await ctx.database.runAsync(
          "INSERT OR IGNORE INTO subscription_usage (subscription_id, used_on) VALUES (?, ?)",
          subscriptionId,
          usedOn,
        );
      } else if (action === "undo") {
        await ctx.database.runAsync(
          "DELETE FROM subscription_usage WHERE subscription_id = ? AND used_on = ?",
          subscriptionId,
          usedOn,
        );
      } else {
        await ctx.database.runAsync(
          "INSERT OR REPLACE INTO subscription_usage_tracking (subscription_id, tracked) VALUES (?, ?)",
          subscriptionId,
          action === "track" ? 1 : 0,
        );
      }
      await ctx.database.runAsync(
        "INSERT INTO subscription_usage_queue (subscription_id, action, used_on) VALUES (?, ?, ?)",
        subscriptionId,
        action,
        usedOn,
      );
    }),
  );
}

/**
 * Queued taps in order, leaving out those for a bill still waiting to sync (the Worker would not
 * know it yet); they upload after the bill does.
 */
export function readyQueuedSubscriptionUsage(
  ctx: LocalMutationContext,
): Promise<QueuedSubscriptionUsage[]> {
  return ctx.database.getAllAsync<QueuedSubscriptionUsage>(
    `SELECT q.sequence, q.subscription_id AS subscriptionId, q.action, q.used_on AS usedOn
     FROM subscription_usage_queue q
     LEFT JOIN subscriptions s ON s.id = q.subscription_id
     WHERE s.id IS NULL OR s.sync_state = 'synced'
     ORDER BY q.sequence`,
  );
}

export function finishQueuedSubscriptionUsage(
  ctx: LocalMutationContext,
  sequence: number,
): Promise<void> {
  return ctx.writer.run(async () => {
    await ctx.database.runAsync(
      "DELETE FROM subscription_usage_queue WHERE sequence = ?",
      sequence,
    );
  });
}

/**
 * Replaces this phone's copy with the Worker's list. Skipped while any tap is still queued, since
 * the list would not show it yet; the next upload reads it again. Returns whether it replaced.
 */
export function replaceSubscriptionUsage(
  ctx: LocalMutationContext,
  list: SubscriptionUsageList,
): Promise<boolean> {
  return ctx.writer.run(async () => {
    let replaced = false;
    await ctx.database.withTransactionAsync(async () => {
      const queued = await ctx.database.getFirstAsync<{ count: number }>(
        "SELECT COUNT(*) AS count FROM subscription_usage_queue",
      );
      if ((queued?.count ?? 0) > 0) return;
      await ctx.database.runAsync("DELETE FROM subscription_usage");
      await ctx.database.runAsync("DELETE FROM subscription_usage_tracking");
      for (const row of list.usage) {
        for (const usedOn of row.usedOn) {
          await ctx.database.runAsync(
            "INSERT OR IGNORE INTO subscription_usage (subscription_id, used_on) VALUES (?, ?)",
            row.subscriptionId,
            usedOn,
          );
        }
      }
      for (const row of list.tracking) {
        await ctx.database.runAsync(
          "INSERT OR REPLACE INTO subscription_usage_tracking (subscription_id, tracked) VALUES (?, ?)",
          row.subscriptionId,
          row.tracked ? 1 : 0,
        );
      }
      replaced = true;
    });
    return replaced;
  });
}
