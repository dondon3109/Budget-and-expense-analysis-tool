import { createAccountDeletionService } from "./account-deletion";
import { createApp } from "./app";
import { reconcileDuePayPalCheckouts } from "./billing/scheduled-reconciliation";
import { assistantRepository } from "./db/assistant";
import { billingRepository } from "./db/billing";
import { compactMobileSyncChanges } from "./db/mobile-sync";
import { refreshDailyFxRate } from "./fx/rates";
import { creditDueInterest } from "./interest/scheduled-credit";
import { validateRequiredApiBindings } from "./readiness";
import { bugReportService } from "./support/bug-reports";
import type { Bindings } from "./types";

const app = createApp();
const accountDeletionService = createAccountDeletionService();
const BILLING_RECONCILIATION_CRON = "*/5 * * * *";
const DAILY_MAINTENANCE_CRON = "17 3 * * *";
const DAILY_INTEREST_CRON = "17 4 * * *";

export default {
  fetch: app.fetch,
  async scheduled(controller, env) {
    validateRequiredApiBindings(env);
    if (controller.cron === BILLING_RECONCILIATION_CRON) {
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
