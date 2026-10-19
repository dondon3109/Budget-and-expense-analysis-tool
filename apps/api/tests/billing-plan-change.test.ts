import type { DatabaseSync } from "node:sqlite";

import { afterEach, describe, expect, it, vi } from "vitest";

import { changePlan } from "../src/billing/checkout";
import { readTier } from "../src/billing/entitlements";
import { billingRepository } from "../src/db/billing";
import { tenantBootstrapRepository, tenantIdForUser } from "../src/db/tenants";
import type { Bindings } from "../src/types";
import { createD1TestDatabase } from "./helpers/d1-test-harness";

const TENANT_ID = tenantIdForUser("payer");
const PERIOD_END = "2099-01-01T00:00:00.000Z";
const databases: DatabaseSync[] = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
  vi.unstubAllGlobals();
});

async function setup(provider: "dodo" | "paypal", plan: "budget" | "pro") {
  const { binding, database } = createD1TestDatabase();
  databases.push(database);
  const env = {
    DB: binding,
    DODO_PAYMENTS_ENVIRONMENT: "test_mode",
    DODO_PAYMENTS_API_KEY: "dodo-key",
    DODO_BUDGET_MONTHLY_PRODUCT_ID: "pdt_budget_month",
    DODO_PRO_MONTHLY_PRODUCT_ID: "pdt_pro_month",
    PAYPAL_ENVIRONMENT: "sandbox",
    PAYPAL_CLIENT_ID: "client-id",
    PAYPAL_CLIENT_SECRET: "client-secret",
    PAYPAL_BUDGET_MONTHLY_PLAN_ID: "P-budget-month",
    PAYPAL_PRO_MONTHLY_PLAN_ID: "P-pro-month",
  } as Bindings;
  await tenantBootstrapRepository.bootstrap(env, { id: "payer" });
  database
    .prepare(
      `INSERT INTO billing_subscriptions (
         provider, provider_subscription_id, tenant_id, provider_customer_id, provider_plan_id,
         plan, provider_status, status, interval, current_period_ends_at, cancel_at_period_end,
         last_provider_occurred_at, last_provider_event_id
       ) VALUES (?, 'sub-1', ?, 'customer', ?, ?, 'active', 'active', 'month', ?, 0,
                 '2026-08-01T00:00:00.000Z', 'event-1')`,
    )
    .run(
      provider,
      TENANT_ID,
      provider === "dodo" ? `pdt_${plan}_month` : `P-${plan}-month`,
      plan,
      PERIOD_END,
    );
  const fetchMock = vi.fn(async (url: string | URL | Request, _init?: RequestInit) =>
    String(url).endsWith("/v1/oauth2/token")
      ? Response.json({ access_token: "token", expires_in: 3_600 })
      : Response.json({ id: "sub-1", links: [] }),
  );
  vi.stubGlobal("fetch", fetchMock);
  const row = () =>
    database
      .prepare(
        `SELECT plan, provider_plan_id AS providerPlanId, entitled_plan AS entitledPlan,
                entitled_until AS entitledUntil, pending_plan AS pendingPlan
         FROM billing_subscriptions`,
      )
      .get();
  return { env, fetchMock, row };
}

function providerCall(fetchMock: Awaited<ReturnType<typeof setup>>["fetchMock"]) {
  const call = fetchMock.mock.calls.find(([url]) => !String(url).endsWith("/v1/oauth2/token"));
  return { url: String(call?.[0]), body: JSON.parse(String(call?.[1]?.body)) as unknown };
}

describe("plan changes", () => {
  it("charges a Dodo upgrade now and grants the new tier at once", async () => {
    const { env, fetchMock, row } = await setup("dodo", "budget");

    await expect(
      changePlan(billingRepository, env, TENANT_ID, null, { plan: "pro", interval: "month" }),
    ).resolves.toEqual({ outcome: "applied", approvalUrl: null });

    expect(providerCall(fetchMock)).toEqual({
      url: "https://test.dodopayments.com/subscriptions/sub-1/change-plan",
      body: {
        product_id: "pdt_pro_month",
        quantity: 1,
        proration_billing_mode: "prorated_immediately",
        on_payment_failure: "prevent_change",
      },
    });
    expect(row()).toMatchObject({
      plan: "pro",
      providerPlanId: "pdt_pro_month",
      pendingPlan: null,
    });
    expect(await readTier(env, TENANT_ID)).toBe("zoption_pro");
  });

  it("keeps the paid tier until the period ends on a downgrade", async () => {
    const { env, fetchMock, row } = await setup("dodo", "pro");

    await expect(
      changePlan(billingRepository, env, TENANT_ID, null, { plan: "budget", interval: "month" }),
    ).resolves.toEqual({ outcome: "scheduled", approvalUrl: null });

    expect(providerCall(fetchMock).body).toMatchObject({ proration_billing_mode: "do_not_bill" });
    expect(row()).toEqual({
      plan: "budget",
      providerPlanId: "pdt_budget_month",
      entitledPlan: "pro",
      entitledUntil: PERIOD_END,
      pendingPlan: "budget",
    });
    expect(await readTier(env, TENANT_ID)).toBe("zoption_pro");
    expect((await billingRepository.getSummary(env, TENANT_ID)).pendingChange).toEqual({
      plan: "budget",
      interval: "month",
      effectiveAt: PERIOD_END,
    });
  });

  // PayPal bills a revised plan from the next cycle, so the upgrade is granted before it is paid.
  it("grants a PayPal upgrade now and holds it until PayPal bills it", async () => {
    const { env, fetchMock, row } = await setup("paypal", "budget");

    await expect(
      changePlan(billingRepository, env, TENANT_ID, null, { plan: "pro", interval: "month" }),
    ).resolves.toEqual({ outcome: "applied", approvalUrl: null });

    expect(providerCall(fetchMock)).toEqual({
      url: "https://api-m.sandbox.paypal.com/v1/billing/subscriptions/sub-1/revise",
      body: { plan_id: "P-pro-month" },
    });
    expect(row()).toMatchObject({ plan: "pro", entitledPlan: "pro", entitledUntil: PERIOD_END });
    expect(await readTier(env, TENANT_ID)).toBe("zoption_pro");
  });

  it("refuses a change to the plan already paid for", async () => {
    const { env, fetchMock } = await setup("dodo", "pro");

    await expect(
      changePlan(billingRepository, env, TENANT_ID, null, { plan: "pro", interval: "month" }),
    ).rejects.toMatchObject({ status: 409, code: "plan_unchanged" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
