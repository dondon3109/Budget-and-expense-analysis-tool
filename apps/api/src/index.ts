import { createAccountDeletionService } from "./account-deletion";
import { createApp } from "./app";
import { reconcileDuePayPalCheckouts } from "./billing/scheduled-reconciliation";
import { assistantRepository } from "./db/assistant";
import { billingRepository } from "./db/billing";
import { refreshDailyFxRate } from "./fx/rates";
import { creditDueInterest } from "./interest/scheduled-credit";
import type { Bindings } from "./types";

const app = createApp();
const accountDeletionService = createAccountDeletionService();
const BILLING_RECONCILIATION_CRON = "*/5 * * * *";
const DAILY_MAINTENANCE_CRON = "17 3 * * *";
const DAILY_INTEREST_CRON = "17 4 * * *";

export default {
  fetch: app.fetch,
  async scheduled(controller, env) {
    if (controller.cron === BILLING_RECONCILIATION_CRON) {
      const result = await reconcileDuePayPalCheckouts(billingRepository, env, 25);
      if (result.checked > 0) {
        console.log(JSON.stringify({ message: "Pending PayPal checkouts reconciled", ...result }));
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
        JSON.stringify({ message: "Daily exchange rate refreshed", date: fx.date, rate: fx.usdToPhp }),
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
  },
} satisfies ExportedHandler<Bindings>;
