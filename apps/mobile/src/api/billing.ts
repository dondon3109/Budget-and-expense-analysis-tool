import {
  billingCancelResponseSchema,
  billingCheckoutResponseSchema,
  billingPlanChangeResponseSchema,
  billingReconciliationResponseSchema,
  billingSummaryResponseSchema,
  familyBillingSummaryResponseSchema,
  isFamilyPlan,
  type BillingCheckoutReconciliation,
  type BillingCheckoutResponse,
  type BillingInterval,
  type BillingPlanChangeResponse,
  type BillingPlanKey,
  type BillingProvider,
  type BillingSummary,
  type FamilyBillingSummary,
} from "@zoption/shared";

import { ApiTransportError, apiRequest } from "./authenticated";
import type { FamilyApi } from "./family";

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

export interface PlanChoice {
  plan: BillingPlanKey;
  interval: BillingInterval;
}

/**
 * A personal plan is billed in the personal workspace; a family plan in the family it covers,
 * so its call must carry that family's `workspaceId`.
 */
function planBillingPath(plan: BillingPlanKey): string {
  return isFamilyPlan(plan) ? "/api/app/family/billing" : "/api/app/billing";
}

export function startBillingCheckout(
  api: BillingApi | FamilyApi,
  choice: PlanChoice,
  provider: BillingProvider = "paypal",
): Promise<BillingCheckoutResponse> {
  return apiRequest({
    ...api,
    path: `${planBillingPath(choice.plan)}/checkout`,
    method: "POST",
    body: { ...choice, provider },
    fallback: billingFallback,
    decode: (value) => billingCheckoutResponseSchema.parse(value),
  });
}

/** Upgrades apply now; downgrades wait for the period to end. */
export function changeBillingPlan(
  api: BillingApi | FamilyApi,
  choice: PlanChoice,
): Promise<BillingPlanChangeResponse> {
  return apiRequest({
    ...api,
    path: `${planBillingPath(choice.plan)}/change`,
    method: "POST",
    body: choice,
    fallback: billingFallback,
    decode: (value) => billingPlanChangeResponseSchema.parse(value),
  });
}

/** The plan of the family `api` names; owner only. */
export function getFamilyBillingSummary(api: FamilyApi): Promise<FamilyBillingSummary> {
  return apiRequest({
    ...api,
    path: "/api/app/family/billing",
    method: "GET",
    fallback: billingFallback,
    decode: (value) => familyBillingSummaryResponseSchema.parse(value),
  });
}

export function cancelFamilyPlan(api: FamilyApi): Promise<{ cancellationRequested: true }> {
  return apiRequest({
    ...api,
    path: "/api/app/family/billing/cancel",
    method: "POST",
    body: {},
    fallback: billingFallback,
    decode: (value) => billingCancelResponseSchema.parse(value),
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
    timeoutMs: 60_000,
  });
}

export { ApiTransportError };

export type { BillingInterval, BillingSummary };
