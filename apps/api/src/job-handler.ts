import { createAccountDeletionService } from "./account-deletion";
import { reconcileBillingCheckout } from "./billing/reconciliation";
import { billingRepository } from "./db/billing";
import type { JobMessage } from "./jobs";
import { subscriptionRenewalService } from "./subscriptions/renewals";
import { bugReportService } from "./support/bug-reports";
import type { Bindings } from "./types";

const accountDeletionService = createAccountDeletionService();

export async function handleQueuedJob(env: Bindings, message: JobMessage): Promise<void> {
  switch (message.type) {
    case "billing-reconcile":
    case "paypal-reconcile":
      if (!message.tenantId) return;
      await reconcileBillingCheckout(billingRepository, env, message.tenantId);
      return;
    case "bug-report-notify":
      if (!message.reportId) return;
      await bugReportService.retryNotification(env, message.reportId);
      return;
    case "subscription-renewal-notify":
      if (!message.notificationId) return;
      await subscriptionRenewalService.retryNotification(env, message.notificationId);
      return;
    case "account-deletion":
      if (!message.userId) return;
      await accountDeletionService.reconcileUser(env, message.userId);
      return;
  }
}
