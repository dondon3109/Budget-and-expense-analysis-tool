import { createAccountDeletionService } from "./account-deletion";
import { createApp } from "./app";
import { reconcileDuePayPalCheckouts } from "./billing/scheduled-reconciliation";
import { assistantRepository } from "./db/assistant";
import { billingRepository } from "./db/billing";
import { compactMobileSyncChanges } from "./db/mobile-sync";
import { refreshDailyFxRate } from "./fx/rates";
import { creditDueInterest } from "./interest/scheduled-credit";
import { handleQueuedJob } from "./job-handler";
import type { JobMessage } from "./jobs";
import { RateLimitDurableObject } from "./rate-limit-do";
import { deleteExpiredRateLimits } from "./rate-limit";
import { validateRequiredApiBindings } from "./readiness";
import { subscriptionRenewalService } from "./subscriptions/renewals";
import { bugReportService } from "./support/bug-reports";
import type { Bindings } from "./types";

export { RateLimitDurableObject };

const app = createApp();
const accountDeletionService = createAccountDeletionService();
const FIVE_MINUTE_CRON = "*/5 * * * *";
const DAILY_MAINTENANCE_CRON = "17 3 * * *";
const DAILY_INTEREST_CRON = "17 4 * * *";

export default {
  fetch: app.fetch,
  async queue(batch, env) {
    validateRequiredApiBindings(env);
    for (const message of batch.messages) {
      try {
        await handleQueuedJob(env, message.body as JobMessage);
        message.ack();
      } catch (error) {
        console.error(
          JSON.stringify({
            message: "Queued job failed",
            type:
              message.body && typeof message.body === "object" && "type" in message.body
                ? message.body.type
                : undefined,
            errorCode: error instanceof Error ? error.name : "unknown_error",
          }),
        );
        message.retry();
      }
    }
  },
  async scheduled(controller, env) {
    validateRequiredApiBindings(env);
    if (controller.cron === FIVE_MINUTE_CRON) {
      const result = await reconcileDuePayPalCheckouts(billingRepository, env, 25);
      if (result.checked > 0) {
        console.log(JSON.stringify({ message: "Pending PayPal checkouts reconciled", ...result }));
      }
      const notifications = await bugReportService.retryPendingNotifications(env, 25);
      if (notifications.claimed > 0) {
        console.log(
          JSON.stringify({ message: "Bug report notifications retried", ...notifications }),
        );
      }
      const renewals = await subscriptionRenewalService.runDueRenewals(env, 100);
      if (renewals.charged > 0 || renewals.uncovered > 0) {
        console.log(JSON.stringify({ message: "Subscription renewals processed", ...renewals }));
      }
      const renewalNotifications = await subscriptionRenewalService.retryPendingNotifications(
        env,
        25,
      );
      if (renewalNotifications.claimed > 0) {
        console.log(
          JSON.stringify({
            message: "Subscription renewal notifications retried",
            ...renewalNotifications,
          }),
        );
      }
      const expiredCounters = await deleteExpiredRateLimits(env);
      if (expiredCounters > 0) {
        console.log(
          JSON.stringify({ message: "Expired rate limit counters deleted", expiredCounters }),
        );
      }
      return;
    }
    if (controller.cron === DAILY_INTEREST_CRON) {
      const result = await creditDueInterest(env);
      if (result.credited > 0) {
        console.log(JSON.stringify({ message: "Interest credited", ...result }));
      }
      return;
    }
    if (controller.cron !== DAILY_MAINTENANCE_CRON) return;

    const fx = await refreshDailyFxRate(env);
    if (fx) {
      console.log(
        JSON.stringify({
          message: "Daily exchange rate refreshed",
          date: fx.date,
          rate: fx.usdToPhp,
        }),
      );
    }

    for (;;) {
      const deleted = await assistantRepository.cleanupExpired(env);
      if (deleted > 0)
        console.log(JSON.stringify({ message: "Expired assistant chats deleted", deleted }));
      if (deleted < 100) break;
    }
    const reconciled = await accountDeletionService.reconcile(env, 25);
    if (reconciled > 0)
      console.log(JSON.stringify({ message: "Pending account deletions reconciled", reconciled }));
    for (;;) {
      const deleted = await bugReportService.cleanupExpired(env, 100);
      if (deleted > 0)
        console.log(JSON.stringify({ message: "Expired bug reports deleted", deleted }));
      if (deleted < 100) break;
    }
    const syncCompaction = await compactMobileSyncChanges(env);
    if (syncCompaction.deletedChanges > 0 || syncCompaction.expiredClients > 0) {
      console.log(
        JSON.stringify({ message: "Mobile sync retention compacted", ...syncCompaction }),
      );
    }
  },
} satisfies ExportedHandler<Bindings>;
