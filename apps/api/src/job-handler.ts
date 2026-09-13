import { createAccountDeletionService } from "./account-deletion";
import { reconcilePayPalCheckout } from "./billing/reconciliation";
import { billingRepository } from "./db/billing";
import type { JobMessage } from "./jobs";
import { bugReportService } from "./support/bug-reports";
import type { Bindings } from "./types";

const accountDeletionService = createAccountDeletionService();

export async function handleQueuedJob(env: Bindings, message: JobMessage): Promise<void> {
  switch (message.type) {
    case "paypal-reconcile":
      if (!message.tenantId) return;
      await reconcilePayPalCheckout(billingRepository, env, message.tenantId);
      return;
    case "bug-report-notify":
      if (!message.reportId) return;
      await bugReportService.retryNotification(env, message.reportId);
      return;
    case "account-deletion":
      if (!message.userId) return;
      await accountDeletionService.reconcileUser(env, message.userId);
      return;
  }
}
