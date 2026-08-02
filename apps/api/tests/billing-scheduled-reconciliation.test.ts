import type { BillingSummary } from "@zoption/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

import { reconcileDuePayPalCheckouts } from "../src/billing/scheduled-reconciliation";
import type {
  BillingCheckoutReference,
  BillingDueCheckout,
  BillingRepository,
  BillingSubscriptionSnapshot,
} from "../src/db/billing";
import type { Bindings } from "../src/types";

function environment(): Bindings {
  return {
    DB: {} as D1Database,
    PAYPAL_ENVIRONMENT: "sandbox",
    PAYPAL_CLIENT_ID: "client-id",
    PAYPAL_CLIENT_SECRET: "client-secret",
    PAYPAL_PRO_MONTHLY_PLAN_ID: "P-monthly",
    PAYPAL_PRO_ANNUAL_PLAN_ID: "P-annual",
  };
}

function checkout(tenantId: string, reference: string, subscriptionId: string): BillingDueCheckout {
  return {
    tenantId,
    reference,
    provider: "paypal",
    interval: "month",
    providerPlanId: "P-monthly",
    providerSubscriptionId: subscriptionId,
    createdAt: "2026-08-01T00:00:00.000Z",
    expiresAt: "2099-08-01T00:15:00.000Z",
  };
}

function summary(active = false): BillingSummary {
  return {
    plan: active ? "zoption_pro" : "free",
    entitlementSource: active ? "paypal" : null,
    provider: active ? "paypal" : null,
    status: active ? "active" : null,
    interval: active ? "month" : null,
    currentPeriodEndsAt: active ? "2099-09-01T00:00:00.000Z" : null,
    scheduledChangeAt: null,
    cancelAtPeriodEnd: false,
    pendingCheckout: active
      ? null
      : {
          provider: "paypal",
          interval: "month",
          createdAt: "2026-08-01T00:00:00.000Z",
          expiresAt: "2099-08-01T00:15:00.000Z",
        },
    canCheckout: false,
    canManageBilling: active,
    canManageSponsoredSeats: false,
    nonTerminalSubscriptionCount: active ? 1 : 0,
    usages: [],
    allowances: [],
  };
}

function tokenResponse() {
  return new Response(JSON.stringify({ access_token: "access-token" }), { status: 200 });
}

function subscriptionResponse(
  checkoutValue: BillingCheckoutReference,
  status: "ACTIVE" | "APPROVED" | "CANCELLED",
) {
  return new Response(
    JSON.stringify({
      id: checkoutValue.providerSubscriptionId,
      status,
      status_update_time: "2026-08-01T00:00:00.000Z",
      plan_id: checkoutValue.providerPlanId,
      custom_id: checkoutValue.reference,
      subscriber: { payer_id: "payer-id" },
      billing_info: { next_billing_time: "2099-09-01T00:00:00.000Z" },
    }),
    { status: 200 },
  );
}

function repository(due: BillingDueCheckout[]): BillingRepository {
  const byTenant = new Map(due.map((value) => [value.tenantId, value]));
  const activeTenants = new Set<string>();
  return {
    listDuePendingCheckouts: vi.fn(async () => due),
    getPendingCheckout: vi.fn(
      async (_env: Bindings, tenantId: string) => byTenant.get(tenantId) ?? null,
    ),
    recordCheckoutReconciliation: vi.fn(async () => undefined),
    applySubscriptionSnapshot: vi.fn(
      async (_env: Bindings, snapshot: BillingSubscriptionSnapshot) => {
        if (snapshot.status === "active")
          activeTenants.add(byTenantTenantId(due, snapshot.checkoutReference));
        return "applied" as const;
      },
    ),
    getSummary: vi.fn(async (_env: Bindings, tenantId: string) =>
      summary(activeTenants.has(tenantId)),
    ),
    getProviderSubscription: vi.fn(async (_env: Bindings, tenantId: string) => {
      const value = byTenant.get(tenantId);
      if (!value || !activeTenants.has(tenantId)) return null;
      return {
        provider: "paypal" as const,
        providerSubscriptionId: value.providerSubscriptionId!,
        providerCustomerId: "payer-id",
        providerPlanId: value.providerPlanId,
        status: "active" as const,
        currentPeriodEndsAt: "2099-09-01T00:00:00.000Z",
        cancelAtPeriodEnd: false,
      };
    }),
  } as unknown as BillingRepository;
}

function byTenantTenantId(due: BillingDueCheckout[], reference: string | null): string {
  return due.find((value) => value.reference === reference)?.tenantId ?? "";
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("scheduled PayPal reconciliation", () => {
  it("processes a bounded batch and counts canonical outcomes", async () => {
    const active = checkout("user:active", "checkout-active", "I-active");
    const pending = checkout("user:pending", "checkout-pending", "I-pending");
    const canceled = checkout("user:canceled", "checkout-canceled", "I-canceled");
    const billing = repository([active, pending, canceled]);
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(tokenResponse())
        .mockResolvedValueOnce(subscriptionResponse(active, "ACTIVE"))
        .mockResolvedValueOnce(tokenResponse())
        .mockResolvedValueOnce(subscriptionResponse(pending, "APPROVED"))
        .mockResolvedValueOnce(tokenResponse())
        .mockResolvedValueOnce(subscriptionResponse(canceled, "CANCELLED")),
    );

    const result = await reconcileDuePayPalCheckouts(billing, environment(), 7);

    expect(result).toEqual({ checked: 3, confirmed: 1, closed: 1, pending: 1, failed: 0 });
    expect(billing.listDuePendingCheckouts).toHaveBeenCalledWith(expect.anything(), 7);
  });

  it("continues processing after an individual provider failure", async () => {
    const failed = checkout("user:failed", "checkout-failed", "I-failed");
    const pending = checkout("user:pending", "checkout-pending", "I-pending");
    const billing = repository([failed, pending]);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response("provider unavailable", { status: 503 }))
        .mockResolvedValueOnce(tokenResponse())
        .mockResolvedValueOnce(subscriptionResponse(pending, "APPROVED")),
    );

    const result = await reconcileDuePayPalCheckouts(billing, environment());

    expect(result).toEqual({ checked: 2, confirmed: 0, closed: 0, pending: 1, failed: 1 });
    expect(billing.recordCheckoutReconciliation).toHaveBeenCalledWith(
      expect.anything(),
      failed.tenantId,
      failed.reference,
      null,
      "billing_provider_error",
    );
    expect(consoleError).toHaveBeenCalledOnce();
    consoleError.mockRestore();
  });
});
