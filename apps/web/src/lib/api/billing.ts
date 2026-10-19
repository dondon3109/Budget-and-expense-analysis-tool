import {
  isFamilyPlan,
  type BillingCheckoutResponse,
  type BillingCheckoutReconciliation,
  type BillingInterval,
  type BillingPlanChangeResponse,
  type BillingPlanKey,
  type BillingProvider,
  type BillingProviderConfig,
  type BillingSummary,
  type FamilyBillingSummary,
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

export interface PlanChoice {
  plan: BillingPlanKey;
  interval: BillingInterval;
}

/** Personal plans are billed in the personal workspace; a family plan in the family it covers. */
function planBillingPath(plan: BillingPlanKey): string {
  return isFamilyPlan(plan) ? "/api/app/family/billing" : "/api/app/billing";
}

export function startBillingCheckout(
  workspace: AuthenticatedWorkspace,
  choice: PlanChoice,
  provider: BillingProvider = "paypal",
): Promise<BillingCheckoutResponse> {
  return requestJson(workspace, `${planBillingPath(choice.plan)}/checkout`, {
    method: "POST",
    body: JSON.stringify({ ...choice, provider }),
  });
}

export function changeBillingPlan(
  workspace: AuthenticatedWorkspace,
  choice: PlanChoice,
): Promise<BillingPlanChangeResponse> {
  return requestJson(workspace, `${planBillingPath(choice.plan)}/change`, {
    method: "POST",
    body: JSON.stringify(choice),
  });
}

/** The plan of the family `workspace` names; owner only. */
export function getFamilyBillingSummary(
  workspace: AuthenticatedWorkspace,
): Promise<FamilyBillingSummary> {
  return requestJson(workspace, "/api/app/family/billing");
}

export function cancelFamilyPlan(
  workspace: AuthenticatedWorkspace,
): Promise<{ cancellationRequested: true }> {
  return requestJson(workspace, "/api/app/family/billing/cancel", {
    method: "POST",
    body: JSON.stringify({}),
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
