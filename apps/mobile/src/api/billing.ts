import {
  billingCancelResponseSchema,
  billingCheckoutResponseSchema,
  billingReconciliationResponseSchema,
  billingSummaryResponseSchema,
  type BillingCheckoutReconciliation,
  type BillingCheckoutResponse,
  type BillingInterval,
  type BillingSummary,
} from "@zoption/shared";

import { ApiTransportError, apiRequest } from "./authenticated";

export interface BillingApi {
  accessToken: string;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

const billingFallback = "Billing could not be reached. Try again shortly.";

export function getBillingSummary(api: BillingApi): Promise<BillingSummary> {
  return apiRequest({
    ...api,
    path: "/api/app/billing",
    method: "GET",
    fallback: billingFallback,
    decode: (value) => billingSummaryResponseSchema.parse(value),
  });
}

export function startBillingCheckout(
  api: BillingApi,
  interval: BillingInterval,
): Promise<BillingCheckoutResponse> {
  return apiRequest({
    ...api,
    path: "/api/app/billing/checkout",
    method: "POST",
    body: { interval },
    fallback: billingFallback,
    decode: (value) => billingCheckoutResponseSchema.parse(value),
  });
}

export function cancelBillingSubscription(
  api: BillingApi,
): Promise<{ cancellationRequested: true }> {
  return apiRequest({
    ...api,
    path: "/api/app/billing/cancel",
    method: "POST",
    body: {},
    fallback: billingFallback,
    decode: (value) => billingCancelResponseSchema.parse(value),
  });
}

export function reconcileBillingCheckout(
  api: BillingApi,
  options: { abortPendingCheckout?: boolean } = {},
): Promise<BillingCheckoutReconciliation> {
  return apiRequest({
    ...api,
    path: "/api/app/billing/reconcile",
    method: "POST",
    body: options.abortPendingCheckout ? { abortPendingCheckout: true } : {},
    fallback: billingFallback,
    decode: (value) => billingReconciliationResponseSchema.parse(value),
  });
}

export { ApiTransportError };

export type { BillingInterval, BillingSummary };
