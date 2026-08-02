import { describe, expect, it, vi } from "vitest";

import { billingRepository, type BillingSubscriptionSnapshot } from "../src/db/billing";
import type { Bindings } from "../src/types";

interface RepositoryDatabaseOptions {
  existingSubscription?: {
    tenantId: string;
    providerCustomerId: string | null;
    lastProviderOccurredAt: string;
    lastProviderEventId: string;
  } | null;
  reference?: { tenantId: string; providerPlanId: string } | null;
  customerForTenant?: { providerCustomerId: string | null } | null;
  sharedPayerTenant?: string;
}

function repositoryEnvironment(options: RepositoryDatabaseOptions = {}) {
  const preparedSql: string[] = [];
  const batch = vi.fn(async (statements: D1PreparedStatement[]) => {
    void statements;
    return [];
  });
  const database = {
    prepare: vi.fn((sql: string) => {
      preparedSql.push(sql);
      return {
        bind: vi.fn((...args: unknown[]) => ({
          first: vi.fn(async () => {
            if (sql.includes("FROM billing_subscriptions")) {
              return options.existingSubscription ?? null;
            }
            if (sql.includes("FROM billing_checkout_references")) {
              return options.reference ?? null;
            }
            if (sql.includes("FROM billing_customers") && sql.includes("tenant_id = ?")) {
              return options.customerForTenant ?? null;
            }
            if (
              sql.includes("FROM billing_customers") &&
              sql.includes("provider_customer_id = ?")
            ) {
              return options.sharedPayerTenant ? { tenantId: options.sharedPayerTenant } : null;
            }
            throw new Error(`Unexpected first() query: ${sql} (${args.length} args)`);
          }),
          all: vi.fn(async () => {
            if (
              sql.includes("FROM billing_customers") &&
              sql.includes("provider_customer_id = ?")
            ) {
              return options.sharedPayerTenant
                ? {
                    results: [
                      {
                        tenantId: options.sharedPayerTenant,
                        providerCustomerId: "payer-shared",
                      },
                    ],
                    success: true,
                    meta: {},
                  }
                : { results: [], success: true, meta: {} };
            }
            throw new Error(`Unexpected all() query: ${sql}`);
          }),
        })),
      };
    }),
    batch,
  } as unknown as D1Database;

  return {
    env: {
      DB: database,
      PAYPAL_PRO_MONTHLY_PLAN_ID: "P-monthly",
      PAYPAL_PRO_ANNUAL_PLAN_ID: "P-annual",
    } as Bindings,
    preparedSql,
    batch,
  };
}

function snapshot(
  overrides: Partial<BillingSubscriptionSnapshot> = {},
): BillingSubscriptionSnapshot {
  return {
    provider: "paypal",
    providerUpdateId: "reconcile:I-new:2026-08-02T00:00:00.000Z:ACTIVE",
    occurredAt: "2026-08-02T00:00:00.000Z",
    providerSubscriptionId: "I-new",
    providerCustomerId: "payer-shared",
    providerProductId: null,
    providerPlanId: "P-monthly",
    providerStatus: "ACTIVE",
    status: "active",
    interval: "month",
    currentPeriodEndsAt: "2099-09-01T00:00:00.000Z",
    scheduledChangeAt: null,
    cancelAtPeriodEnd: false,
    checkoutReference: "checkout-tenant-b",
    ...overrides,
  };
}

describe("PayPal subscription ownership", () => {
  it("allows a shared payer through an exact independent checkout", async () => {
    const { env, preparedSql, batch } = repositoryEnvironment({
      reference: { tenantId: "tenant-b", providerPlanId: "P-monthly" },
      customerForTenant: null,
      sharedPayerTenant: "tenant-a",
    });

    const outcome = await billingRepository.applySubscriptionSnapshot(env, snapshot());

    expect(outcome).toBe("applied");
    expect(batch).toHaveBeenCalledOnce();
    expect(vi.mocked(batch).mock.calls[0]?.[0]).toHaveLength(3);
    expect(
      preparedSql.some(
        (sql) =>
          sql.includes("FROM billing_customers") &&
          sql.includes("provider_customer_id = ?") &&
          !sql.includes("tenant_id = ?"),
      ),
    ).toBe(false);
  });

  it("does not use payer identity to match a subscription without a checkout", async () => {
    const { env, preparedSql, batch } = repositoryEnvironment({ sharedPayerTenant: "tenant-a" });

    const outcome = await billingRepository.applySubscriptionSnapshot(
      env,
      snapshot({ checkoutReference: null }),
    );

    expect(outcome).toBe("unmatched");
    expect(batch).not.toHaveBeenCalled();
    expect(preparedSql.some((sql) => sql.includes("FROM billing_customers"))).toBe(false);
  });

  it("still rejects a payer change on an existing provider subscription", async () => {
    const { env, batch } = repositoryEnvironment({
      existingSubscription: {
        tenantId: "tenant-a",
        providerCustomerId: "payer-original",
        lastProviderOccurredAt: "2026-08-01T00:00:00.000Z",
        lastProviderEventId: "older-update",
      },
    });

    await expect(
      billingRepository.applySubscriptionSnapshot(
        env,
        snapshot({
          providerSubscriptionId: "I-existing",
          providerCustomerId: "payer-different",
        }),
      ),
    ).rejects.toMatchObject({ code: "invalid_webhook_ownership", status: 409 });
    expect(batch).not.toHaveBeenCalled();
  });
});
