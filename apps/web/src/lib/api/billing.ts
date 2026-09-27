import type {
  BillingCheckoutResponse,
  BillingCheckoutReconciliation,
  BillingInterval,
  BillingProvider,
  BillingProviderConfig,
  BillingSummary,
} from "@zoption/shared";

import type { AuthenticatedWorkspace } from "../workspace";
import { requestJson } from "./transport";

export function getBillingSummary(workspace: AuthenticatedWorkspace): Promise<BillingSummary> {
  return requestJson(workspace, "/api/app/billing");
}

export function reconcileBillingCheckout(
  workspace: AuthenticatedWorkspace,
  options: { abortPendingCheckout?: boolean } = {},
): Promise<BillingCheckoutReconciliation> {
  return requestJson(workspace, "/api/app/billing/reconcile", {
    method: "POST",
    body: JSON.stringify(options.abortPendingCheckout ? { abortPendingCheckout: true } : {}),
  });
}

export function startBillingCheckout(
  workspace: AuthenticatedWorkspace,
  interval: BillingInterval,
  provider: BillingProvider = "paypal",
): Promise<BillingCheckoutResponse> {
  return requestJson(workspace, "/api/app/billing/checkout", {
    method: "POST",
    body: JSON.stringify({ interval, provider }),
  });
}

export function getBillingProviderConfig(
  workspace: AuthenticatedWorkspace,
): Promise<BillingProviderConfig> {
  return requestJson(workspace, "/api/app/billing/checkout/config");
}

export function cancelBillingSubscription(
  workspace: AuthenticatedWorkspace,
): Promise<{ cancellationRequested: true }> {
  return requestJson(workspace, "/api/app/billing/cancel", {
    method: "POST",
    body: JSON.stringify({}),
  });
}
