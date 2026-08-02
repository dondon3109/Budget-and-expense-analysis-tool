import { createAccountDeletionService } from "./account-deletion";
import { createApp } from "./app";
import { reconcileDuePayPalCheckouts } from "./billing/scheduled-reconciliation";
import { assistantRepository } from "./db/assistant";
import { billingRepository } from "./db/billing";
import type { Bindings } from "./types";

const app = createApp();
const accountDeletionService = createAccountDeletionService();
const BILLING_RECONCILIATION_CRON = "*/5 * * * *";
const DAILY_MAINTENANCE_CRON = "17 3 * * *";

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
    if (controller.cron !== DAILY_MAINTENANCE_CRON) return;

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
