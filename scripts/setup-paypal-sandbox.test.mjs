import { describe, expect, it } from "vitest";

import {
  formatSetupResult,
  machineSetupResult,
  setupPayPalSandbox,
} from "./setup-paypal-sandbox.mjs";
import { PAYPAL_PLANS } from "./paypal-plans.mjs";

const webhookUrl =
  "https://budget-expense-api-preview.dondon3109.workers.dev/api/billing/paypal/webhook";
const env = {
  PAYPAL_CLIENT_ID: "sandbox-client-id",
  PAYPAL_CLIENT_SECRET: "sandbox-client-secret",
  PAYPAL_WEBHOOK_URL: webhookUrl,
};
const eventTypes = [
  "BILLING.SUBSCRIPTION.ACTIVATED",
  "BILLING.SUBSCRIPTION.UPDATED",
  "BILLING.SUBSCRIPTION.SUSPENDED",
  "BILLING.SUBSCRIPTION.CANCELLED",
  "BILLING.SUBSCRIPTION.EXPIRED",
  "BILLING.SUBSCRIPTION.PAYMENT.FAILED",
  "PAYMENT.SALE.COMPLETED",
  "PAYMENT.SALE.REFUNDED",
  "PAYMENT.CAPTURE.REVERSED",
  "CUSTOMER.DISPUTE.CREATED",
];

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function product(overrides = {}) {
  return {
    id: "PROD-1",
    name: "Zoption",
    type: "SERVICE",
    category: "SOFTWARE",
    description: "Zoption subscription plans",
    ...overrides,
  };
}

/** The plan PayPal would return for a catalog entry; its id is `P-<variable>`. */
function plan(entry, overrides = {}) {
  const { name, intervalUnit, fixedPrice } = entry;
  return {
    id: `P-${entry.variable}`,
    product_id: "PROD-1",
    name,
    status: "ACTIVE",
    billing_cycles: [
      {
        frequency: { interval_unit: intervalUnit, interval_count: 1 },
        tenure_type: "REGULAR",
        sequence: 1,
        total_cycles: 0,
        pricing_scheme: { fixed_price: { value: fixedPrice, currency_code: "PHP" } },
      },
    ],
    payment_preferences: {
      auto_bill_outstanding: true,
      payment_failure_threshold: 3,
      setup_fee: { value: "0", currency_code: "PHP" },
      setup_fee_failure_action: "CANCEL",
    },
    ...overrides,
  };
}

function webhook(overrides = {}) {
  return {
    id: "WH-1",
    url: webhookUrl,
    event_types: eventTypes.map((name) => ({ name })),
    ...overrides,
  };
}

function queuedFetch(responses) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), init });
    const response = responses.shift();
    if (!response) throw new Error("Unexpected request");
    return response;
  };
  return { calls, fetchImpl };
}

/** One value per catalog plan, keyed by its Worker variable. */
function perPlan(value) {
  return Object.fromEntries(PAYPAL_PLANS.map((entry) => [entry.variable, value(entry)]));
}

/** OAuth, an empty catalog, then a new product and every plan created in catalog order. */
function createResponses() {
  return [
    json({ access_token: "sandbox-access-token" }),
    json({ products: [], total_pages: 1 }),
    json({ id: "PROD-1" }, 201),
    json({ plans: [], total_pages: 1 }),
    ...PAYPAL_PLANS.map((entry) => json({ id: `P-${entry.variable}` }, 201)),
  ];
}

function reuseResponses(webhookResponse = webhook()) {
  const plans = PAYPAL_PLANS.map((entry) => plan(entry));
  // PayPal may answer with trailing zeros; they still match.
  plans[0].billing_cycles[0].pricing_scheme.fixed_price.value += ".0";
  plans[0].payment_preferences.setup_fee.value = "0.00";
  return [
    json({ access_token: "sandbox-access-token" }),
    json({ products: [{ id: "PROD-1", name: "Zoption" }], total_pages: 1 }),
    json(product()),
    json({ plans: plans.map(({ id, name }) => ({ id, name })), total_pages: 1 }),
    ...plans.map((details) => json(details)),
    json({ webhooks: [webhookResponse] }),
  ];
}

describe("setupPayPalSandbox", () => {
  it("fails before any request when a required local value is absent", async () => {
    const { calls, fetchImpl } = queuedFetch([]);

    await expect(
      setupPayPalSandbox({ env: { ...env, PAYPAL_CLIENT_SECRET: "" }, fetchImpl }),
    ).rejects.toThrow("missing PAYPAL_CLIENT_SECRET");
    await expect(
      setupPayPalSandbox({ env: { ...env, PAYPAL_WEBHOOK_URL: "" }, fetchImpl }),
    ).rejects.toThrow("missing PAYPAL_WEBHOOK_URL");

    expect(calls).toEqual([]);
  });

  it.each([
    "http://budget-expense-api-preview.dondon3109.workers.dev/api/billing/paypal/webhook",
    "https://budget-expense-api-preview.dondon3109.workers.dev/wrong",
    "https://api.zoption.site/api/billing/paypal/webhook",
    "https://www.paypal.com/api/billing/paypal/webhook",
    `${webhookUrl}?unexpected=1`,
  ])("rejects an unapproved webhook URL before requesting OAuth: %s", async (value) => {
    const { calls, fetchImpl } = queuedFetch([]);

    await expect(
      setupPayPalSandbox({ env: { ...env, PAYPAL_WEBHOOK_URL: value }, fetchImpl }),
    ).rejects.toThrow("validating PAYPAL_WEBHOOK_URL");
    expect(calls).toEqual([]);
  });

  it("preflights missing resources without resource-mutating requests", async () => {
    const { calls, fetchImpl } = queuedFetch([
      json({ access_token: "sandbox-access-token" }),
      json({ products: [], total_pages: 1 }),
      json({ webhooks: [] }),
    ]);

    await expect(setupPayPalSandbox({ env, fetchImpl })).resolves.toEqual({
      mode: "preflight",
      productId: null,
      plans: perPlan(() => null),
      webhookId: null,
      actions: { product: "create", plans: perPlan(() => "create"), webhook: "create" },
    });

    expect(calls).toHaveLength(3);
    expect(
      calls.some((call) => call.init.method === "POST" && !call.url.endsWith("/v1/oauth2/token")),
    ).toBe(false);
    expect(calls.every((call) => call.url.startsWith("https://api-m.sandbox.paypal.com/"))).toBe(
      true,
    );
  });

  it("creates only the requested PHP Sandbox catalog and Preview webhook with --apply", async () => {
    const { calls, fetchImpl } = queuedFetch([
      ...createResponses(),
      json({ webhooks: [] }),
      json({ id: "WH-SECRET" }, 201),
    ]);
    let requestCount = 0;

    await expect(
      setupPayPalSandbox({
        env,
        fetchImpl,
        randomUuid: () => `uuid-${(requestCount += 1)}`,
        apply: true,
      }),
    ).resolves.toEqual({
      mode: "apply",
      productId: "PROD-1",
      plans: perPlan((entry) => `P-${entry.variable}`),
      webhookId: "WH-SECRET",
      actions: { product: "create", plans: perPlan(() => "create"), webhook: "create" },
    });

    expect(calls).toHaveLength(6 + PAYPAL_PLANS.length);
    expect(calls.every((call) => call.url.startsWith("https://api-m.sandbox.paypal.com/"))).toBe(
      true,
    );
    expect(calls.map((call) => call.url)).not.toContain(
      expect.stringContaining("https://api-m.paypal.com"),
    );

    const createProduct = calls.find(
      (call) => call.url.endsWith("/v1/catalogs/products") && call.init.method === "POST",
    );
    expect(JSON.parse(createProduct.init.body)).toEqual({
      name: "Zoption",
      type: "SERVICE",
      category: "SOFTWARE",
      description: "Zoption subscription plans",
    });

    const createPlans = calls.filter(
      (call) => call.url.endsWith("/v1/billing/plans") && call.init.method === "POST",
    );
    expect(createPlans.map((call) => JSON.parse(call.init.body).name)).toEqual(
      PAYPAL_PLANS.map((entry) => entry.name),
    );
    expect(JSON.parse(createPlans[0].init.body)).toMatchObject({
      product_id: "PROD-1",
      name: "Zoption Budget Monthly",
      billing_cycles: [
        {
          frequency: { interval_unit: "MONTH", interval_count: 1 },
          tenure_type: "REGULAR",
          total_cycles: 0,
          pricing_scheme: { fixed_price: { value: "149", currency_code: "PHP" } },
        },
      ],
    });
    expect(JSON.parse(createPlans[7].init.body)).toMatchObject({
      name: "Family Pro Annual",
      billing_cycles: [
        {
          frequency: { interval_unit: "YEAR", interval_count: 1 },
          pricing_scheme: { fixed_price: { value: "7990", currency_code: "PHP" } },
        },
      ],
    });

    const createWebhook = calls.find(
      (call) => call.url.endsWith("/v1/notifications/webhooks") && call.init.method === "POST",
    );
    expect(JSON.parse(createWebhook.init.body)).toEqual({
      url: webhookUrl,
      event_types: eventTypes.map((name) => ({ name })),
    });

    const createIds = [createProduct, ...createPlans, createWebhook].map(
      (call) => call.init.headers["PayPal-Request-Id"],
    );
    expect(new Set(createIds).size).toBe(2 + PAYPAL_PLANS.length);
  });

  it("reuses exact resources and reads canonical plan details", async () => {
    const { calls, fetchImpl } = queuedFetch(reuseResponses());

    await expect(setupPayPalSandbox({ env, fetchImpl })).resolves.toEqual({
      mode: "preflight",
      productId: "PROD-1",
      plans: perPlan((entry) => `P-${entry.variable}`),
      webhookId: "WH-1",
      actions: { product: "reuse", plans: perPlan(() => "reuse"), webhook: "reuse" },
    });

    for (const entry of PAYPAL_PLANS) {
      expect(calls.some((call) => call.url.endsWith(`/v1/billing/plans/P-${entry.variable}`))).toBe(
        true,
      );
    }
    expect(
      calls.some((call) => call.init.method === "POST" && !call.url.endsWith("/v1/oauth2/token")),
    ).toBe(false);
  });

  it("follows Sandbox webhook pagination and reuses the exact target", async () => {
    const { calls, fetchImpl } = queuedFetch([
      json({ access_token: "sandbox-access-token" }),
      json({ products: [], total_pages: 1 }),
      json({
        webhooks: [{ id: "WH-OTHER", url: "https://example.com/webhook", event_types: [] }],
        links: [
          {
            rel: "next",
            href: "https://api-m.sandbox.paypal.com/v1/notifications/webhooks?page=2",
          },
        ],
      }),
      json({ webhooks: [webhook()] }),
    ]);

    await expect(setupPayPalSandbox({ env, fetchImpl })).resolves.toMatchObject({
      webhookId: "WH-1",
      actions: { webhook: "reuse" },
    });
    expect(calls[3].url).toBe("https://api-m.sandbox.paypal.com/v1/notifications/webhooks?page=2");
  });

  it("rejects duplicate target webhooks without mutating them", async () => {
    const { calls, fetchImpl } = queuedFetch([
      ...createResponses(),
      json({ webhooks: [webhook(), webhook({ id: "WH-2" })] }),
    ]);

    await expect(setupPayPalSandbox({ env, fetchImpl, apply: true })).rejects.toThrow(
      "reconciling the Preview webhook",
    );
    expect(calls.some((call) => ["PATCH", "DELETE"].includes(call.init.method))).toBe(false);
  });

  it("rejects a mismatched webhook event set without mutating it", async () => {
    const { calls, fetchImpl } = queuedFetch([
      ...createResponses(),
      json({ webhooks: [webhook({ event_types: [{ name: eventTypes[0] }] })] }),
    ]);

    await expect(setupPayPalSandbox({ env, fetchImpl, apply: true })).rejects.toThrow(
      "reconciling the Preview webhook",
    );
    expect(calls.some((call) => ["PATCH", "DELETE"].includes(call.init.method))).toBe(false);
  });

  it("rejects same-name products that conflict with the required definition", async () => {
    const { calls, fetchImpl } = queuedFetch([
      json({ access_token: "sandbox-access-token" }),
      json({ products: [{ id: "PROD-1", name: "Zoption" }], total_pages: 1 }),
      json(product({ category: "BOOKS" })),
    ]);

    await expect(setupPayPalSandbox({ env, fetchImpl, apply: true })).rejects.toThrow(
      "reconciling an existing product",
    );
    expect(
      calls.some((call) => call.init.method === "POST" && !call.url.endsWith("/v1/oauth2/token")),
    ).toBe(false);
  });

  it("rejects a conflicting target plan instead of mutating it", async () => {
    const conflicting = plan({ ...PAYPAL_PLANS[0], fixedPrice: "199" });
    const { calls, fetchImpl } = queuedFetch([
      json({ access_token: "sandbox-access-token" }),
      json({ products: [{ id: "PROD-1", name: "Zoption" }], total_pages: 1 }),
      json(product()),
      json({ plans: [{ id: conflicting.id, name: conflicting.name }], total_pages: 1 }),
      json(conflicting),
    ]);

    await expect(setupPayPalSandbox({ env, fetchImpl, apply: true })).rejects.toThrow(
      "reconciling an existing plan",
    );
    expect(calls.some((call) => ["PATCH", "DELETE"].includes(call.init.method))).toBe(false);
  });

  it("keeps secret values and provider responses out of sanitized failures", async () => {
    const rawProviderBody = "sandbox-client-secret sandbox-access-token internal failure";
    const { fetchImpl } = queuedFetch([json({ error: rawProviderBody }, 401)]);

    const error = await setupPayPalSandbox({ env, fetchImpl }).catch((caught) => caught);
    expect(error.message).toBe("requesting an OAuth token");
    expect(error.message).not.toContain(env.PAYPAL_CLIENT_SECRET);
    expect(error.message).not.toContain("sandbox-access-token");
    expect(error.message).not.toContain(rawProviderBody);
  });

  it("keeps the webhook ID out of ordinary output and exposes it only in machine output", () => {
    const result = {
      mode: "apply",
      productId: "PROD-1",
      plans: { PAYPAL_BUDGET_MONTHLY_PLAN_ID: "P-BUDGET", PAYPAL_PRO_MONTHLY_PLAN_ID: null },
      webhookId: "WH-SECRET",
      actions: {
        product: "reuse",
        plans: { PAYPAL_BUDGET_MONTHLY_PLAN_ID: "reuse", PAYPAL_PRO_MONTHLY_PLAN_ID: "create" },
        webhook: "create",
      },
    };

    expect(formatSetupResult(result)).toBe(
      "Mode: apply\nProduct: reuse\nPAYPAL_BUDGET_MONTHLY_PLAN_ID: reuse\nPAYPAL_PRO_MONTHLY_PLAN_ID: create\nPreview webhook: create\nProduct ID: PROD-1\nPAYPAL_BUDGET_MONTHLY_PLAN_ID=P-BUDGET",
    );
    expect(formatSetupResult(result)).not.toContain("WH-SECRET");
    expect(JSON.parse(machineSetupResult(result))).toMatchObject({
      webhook_id: "WH-SECRET",
      plans: { PAYPAL_BUDGET_MONTHLY_PLAN_ID: "P-BUDGET" },
    });
  });
});
