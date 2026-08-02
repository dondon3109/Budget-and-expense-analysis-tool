import type { BillingRepository } from "../db/billing";
import type { Bindings } from "../types";
import { reconcilePayPalCheckout } from "./reconciliation";

export interface ScheduledBillingReconciliationResult {
  checked: number;
  confirmed: number;
  closed: number;
  pending: number;
  failed: number;
}

export async function reconcileDuePayPalCheckouts(
  repository: BillingRepository,
  env: Bindings,
  limit = 25,
): Promise<ScheduledBillingReconciliationResult> {
  const due = await repository.listDuePendingCheckouts(env, limit);
  const result: ScheduledBillingReconciliationResult = {
    checked: 0,
    confirmed: 0,
    closed: 0,
    pending: 0,
    failed: 0,
  };

  for (const checkout of due) {
    result.checked += 1;
    try {
      const reconciliation = await reconcilePayPalCheckout(repository, env, checkout.tenantId);
      if (reconciliation.outcome === "confirmed") result.confirmed += 1;
      else if (reconciliation.outcome === "closed") result.closed += 1;
      else result.pending += 1;
    } catch (error) {
      result.failed += 1;
      console.error(
        JSON.stringify({
          message: "Scheduled PayPal reconciliation failed",
          checkoutReference: checkout.reference,
          subscriptionId: checkout.providerSubscriptionId,
          errorCode: error instanceof Error ? error.name : "unknown_error",
        }),
      );
    }
  }

  return result;
}
