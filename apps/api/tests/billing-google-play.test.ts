import type { DatabaseSync } from "node:sqlite";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  cancelProviderSubscription,
  cancelSubscription,
  changePlan,
} from "../src/billing/checkout";
import { readTier } from "../src/billing/entitlements";
import { googlePlayAccountId } from "../src/billing/google-play";
import {
  recheckGooglePlaySubscriptions,
  verifyGooglePlayPurchase,
} from "../src/billing/google-play-purchases";
import { googlePlayRepository } from "../src/db/google-play";
import { tenantBootstrapRepository, tenantIdForUser } from "../src/db/tenants";
import { HttpError } from "../src/errors";
import { createBillingRoutes } from "../src/routes/billing";
import { billingRepository } from "../src/db/billing";
import type { Bindings } from "../src/types";
import { createD1TestDatabase } from "./helpers/d1-test-harness";
import { createTestApp } from "./helpers/test-app";

const USER_ID = "payer";
const TENANT_ID = tenantIdForUser(USER_ID);
const PERIOD_END = "2099-01-01T00:00:00.000Z";
const TOKEN = "purchase-token-1";
const API = "https://androidpublisher.googleapis.com/androidpublisher/v3/applications";
const PAYER = { userId: USER_ID, tenantId: TENANT_ID, familyTenantId: null };
const REQUEST = { productId: "zoption_pro", basePlanId: "monthly", purchaseToken: TOKEN };
const databases: DatabaseSync[] = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
  vi.unstubAllGlobals();
});

async function serviceAccount() {
  const keys = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", keys.privateKey));
  const body = btoa(String.fromCharCode(...pkcs8)).replace(/(.{64})/g, "$1\n");
  return {
    publicKey: keys.publicKey,
    json: JSON.stringify({
      type: "service_account",
      // A distinct account per test keeps the module's token cache from leaking between them.
      client_email: `zoption-play-billing-${crypto.randomUUID()}@example.iam.gserviceaccount.com`,
      private_key: `-----BEGIN PRIVATE KEY-----\n${body}\n-----END PRIVATE KEY-----\n`,
    }),
  };
}

async function purchase(overrides: Record<string, unknown> = {}) {
  return {
    kind: "androidpublisher#subscriptionPurchaseV2",
    subscriptionState: "SUBSCRIPTION_STATE_ACTIVE",
    acknowledgementState: "ACKNOWLEDGEMENT_STATE_PENDING",
    latestOrderId: "GPA.1111-2222-3333-44444",
    externalAccountIdentifiers: {
      obfuscatedExternalAccountId: await googlePlayAccountId(USER_ID),
    },
    lineItems: [
      {
        productId: "zoption_pro",
        expiryTime: PERIOD_END,
        autoRenewingPlan: { autoRenewEnabled: true },
        offerDetails: { basePlanId: "monthly" },
      },
    ],
    ...overrides,
  };
}

async function setup(env: Partial<Bindings> = {}) {
  const { binding, database } = createD1TestDatabase();
  databases.push(database);
  const account = await serviceAccount();
  const bindings = {
    DB: binding,
    GOOGLE_PLAY_PACKAGE_NAME: "site.zoption.app",
    GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: account.json,
    ...env,
  } as Bindings;
  await tenantBootstrapRepository.bootstrap(bindings, { id: USER_ID });
  // A new workspace starts on a Pro trial, which would hide the tier a purchase grants.
  database.prepare("DELETE FROM pro_trials").run();
  /** Google's answer per token: a purchase body, or an HTTP status. */
  const purchases = new Map<string, unknown>([[TOKEN, await purchase()]]);
  const assertions: string[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === "https://oauth2.googleapis.com/token") {
      assertions.push(new URLSearchParams(String(init?.body)).get("assertion") ?? "");
      return Response.json({ access_token: "play-access-token", expires_in: 3_600 });
    }
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer play-access-token");
    if (url.endsWith(":acknowledge") || url.endsWith(":cancel")) return Response.json({});
    const token = decodeURIComponent(url.split("/tokens/")[1] ?? "");
    const answer = purchases.get(token);
    if (typeof answer === "number") return new Response(null, { status: answer });
    return answer ? Response.json(answer) : new Response(null, { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  const row = (token = TOKEN) =>
    database
      .prepare(
        `SELECT tenant_id AS tenantId, plan, interval, status, provider_status AS providerStatus,
                provider_plan_id AS providerPlanId, current_period_ends_at AS currentPeriodEndsAt,
                cancel_at_period_end AS cancelAtPeriodEnd
         FROM billing_subscriptions WHERE provider = 'google_play' AND provider_subscription_id = ?`,
      )
      .get(token);
  const calls = (suffix: string) =>
    fetchMock.mock.calls.filter(([url]) => String(url).endsWith(suffix)).map(([url]) => url);
  return { env: bindings, database, purchases, assertions, fetchMock, row, calls, account };
}

describe("Google Play purchase verification", () => {
  it("grants a verified purchase to its payer and acknowledges it", async () => {
    const { env, row, calls, assertions, account } = await setup();

    await expect(
      verifyGooglePlayPurchase(googlePlayRepository, env, PAYER, REQUEST),
    ).resolves.toEqual({
      outcome: "applied",
      subscription: {
        plan: "pro",
        interval: "month",
        status: "active",
        currentPeriodEndsAt: PERIOD_END,
        cancelAtPeriodEnd: false,
      },
    });

    expect(row()).toMatchObject({
      tenantId: TENANT_ID,
      providerPlanId: "zoption_pro:monthly",
      providerStatus: "SUBSCRIPTION_STATE_ACTIVE",
    });
    expect(await readTier(env, TENANT_ID)).toBe("zoption_pro");
    expect((await billingRepository.getSummary(env, TENANT_ID)).provider).toBe("google_play");
    expect(calls(":acknowledge")).toEqual([
      `${API}/site.zoption.app/purchases/subscriptions/zoption_pro/tokens/${TOKEN}:acknowledge`,
    ]);

    // The grant is a service-account JWT signed with the key's RS256 private key.
    const [header, claims, signature] = assertions[0]!.split(".");
    const decode = (part: string) =>
      Uint8Array.from(atob(part.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
    expect(JSON.parse(new TextDecoder().decode(decode(claims!)))).toMatchObject({
      iss: JSON.parse(account.json).client_email,
      scope: "https://www.googleapis.com/auth/androidpublisher",
      aud: "https://oauth2.googleapis.com/token",
    });
    await expect(
      crypto.subtle.verify(
        "RSASSA-PKCS1-v1_5",
        account.publicKey,
        decode(signature!),
        new TextEncoder().encode(`${header}.${claims}`),
      ),
    ).resolves.toBe(true);
  });

  it("does not acknowledge a purchase twice", async () => {
    const { env, purchases, calls } = await setup();
    purchases.set(
      TOKEN,
      await purchase({ acknowledgementState: "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED" }),
    );

    await verifyGooglePlayPurchase(googlePlayRepository, env, PAYER, REQUEST);

    expect(calls(":acknowledge")).toEqual([]);
  });

  it("refuses a purchase made for another account", async () => {
    const { env, purchases, row, calls } = await setup();
    purchases.set(
      TOKEN,
      await purchase({
        externalAccountIdentifiers: {
          obfuscatedExternalAccountId: await googlePlayAccountId("someone-else"),
        },
      }),
    );

    await expect(
      verifyGooglePlayPurchase(googlePlayRepository, env, PAYER, REQUEST),
    ).rejects.toMatchObject({ status: 403, code: "play_account_mismatch" });
    expect(row()).toBeUndefined();
    expect(calls(":acknowledge")).toEqual([]);
  });

  it("refuses a purchase without an account id", async () => {
    const { env, purchases } = await setup();
    purchases.set(TOKEN, await purchase({ externalAccountIdentifiers: undefined }));

    await expect(
      verifyGooglePlayPurchase(googlePlayRepository, env, PAYER, REQUEST),
    ).rejects.toMatchObject({ code: "play_account_mismatch" });
  });

  it("never moves a stored purchase to another workspace", async () => {
    const { env, row } = await setup();
    await verifyGooglePlayPurchase(googlePlayRepository, env, PAYER, REQUEST);

    await expect(
      googlePlayRepository.applyPurchase(
        env,
        {
          provider: "google_play",
          providerUpdateId: "later",
          occurredAt: new Date(Date.now() + 1_000).toISOString(),
          providerSubscriptionId: TOKEN,
          providerCustomerId: null,
          providerProductId: "zoption_pro",
          providerPlanId: "zoption_pro:monthly",
          providerStatus: "SUBSCRIPTION_STATE_ACTIVE",
          status: "active",
          interval: "month",
          currentPeriodEndsAt: PERIOD_END,
          scheduledChangeAt: null,
          cancelAtPeriodEnd: false,
          checkoutReference: null,
        },
        { tenantId: "another-tenant", familyTenantId: null },
      ),
    ).rejects.toMatchObject({ code: "invalid_billing_ownership" });
    expect(row()).toMatchObject({ tenantId: TENANT_ID });
  });

  it("refuses a product that does not match the request or the workspace", async () => {
    const { env } = await setup();

    await expect(
      verifyGooglePlayPurchase(googlePlayRepository, env, PAYER, {
        ...REQUEST,
        productId: "zoption_budget",
      }),
    ).rejects.toMatchObject({ code: "play_purchase_mismatch" });
    await expect(
      verifyGooglePlayPurchase(googlePlayRepository, env, PAYER, {
        ...REQUEST,
        productId: "zoption_family_pro",
      }),
    ).rejects.toMatchObject({ status: 400, code: "invalid_request" });
  });

  it("refuses test purchases unless they are allowed", async () => {
    const { env, purchases } = await setup();
    purchases.set(TOKEN, await purchase({ testPurchase: {} }));

    await expect(
      verifyGooglePlayPurchase(googlePlayRepository, env, PAYER, REQUEST),
    ).rejects.toMatchObject({ code: "play_test_purchase" });
    await expect(
      verifyGooglePlayPurchase(
        googlePlayRepository,
        { ...env, GOOGLE_PLAY_ALLOW_TEST_PURCHASES: "true" },
        PAYER,
        REQUEST,
      ),
    ).resolves.toMatchObject({ outcome: "applied" });
  });

  it("keeps a canceled plan to the end of its period and ends an expired one", async () => {
    const { env, purchases } = await setup();
    purchases.set(TOKEN, await purchase({ subscriptionState: "SUBSCRIPTION_STATE_CANCELED" }));

    await expect(
      verifyGooglePlayPurchase(googlePlayRepository, env, PAYER, REQUEST),
    ).resolves.toMatchObject({
      subscription: { status: "canceled", cancelAtPeriodEnd: true },
    });
    expect(await readTier(env, TENANT_ID)).toBe("zoption_pro");

    const ended = new Date(Date.now() - 60_000).toISOString();
    purchases.set(
      TOKEN,
      await purchase({
        subscriptionState: "SUBSCRIPTION_STATE_EXPIRED",
        lineItems: [
          { productId: "zoption_pro", expiryTime: ended, offerDetails: { basePlanId: "monthly" } },
        ],
      }),
    );
    await expect(
      verifyGooglePlayPurchase(googlePlayRepository, env, PAYER, REQUEST),
    ).resolves.toMatchObject({
      subscription: { status: "canceled", cancelAtPeriodEnd: false, currentPeriodEndsAt: ended },
    });
    expect(await readTier(env, TENANT_ID)).toBe("free");
  });

  it("grants nothing while the payment is pending", async () => {
    const { env, purchases, row, calls } = await setup();
    purchases.set(TOKEN, await purchase({ subscriptionState: "SUBSCRIPTION_STATE_PENDING" }));

    await expect(
      verifyGooglePlayPurchase(googlePlayRepository, env, PAYER, REQUEST),
    ).resolves.toEqual({ outcome: "pending", subscription: null });
    expect(row()).toBeUndefined();
    expect(calls(":acknowledge")).toEqual([]);
  });

  it("ends the token a plan change replaced", async () => {
    const { env, purchases, row } = await setup();
    await verifyGooglePlayPurchase(googlePlayRepository, env, PAYER, REQUEST);
    purchases.set(
      "purchase-token-2",
      await purchase({
        linkedPurchaseToken: TOKEN,
        lineItems: [
          {
            productId: "zoption_budget",
            expiryTime: PERIOD_END,
            offerDetails: { basePlanId: "yearly" },
          },
        ],
      }),
    );

    await verifyGooglePlayPurchase(googlePlayRepository, env, PAYER, {
      productId: "zoption_budget",
      basePlanId: "yearly",
      purchaseToken: "purchase-token-2",
    });

    expect(row()).toMatchObject({ status: "canceled", providerStatus: "SUPERSEDED" });
    expect(row("purchase-token-2")).toMatchObject({ plan: "budget", interval: "year" });
    expect(await readTier(env, TENANT_ID)).toBe("zoption_budget");
  });

  it("answers 503 until the service account is configured", async () => {
    const { env } = await setup({ GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: undefined });

    await expect(
      verifyGooglePlayPurchase(googlePlayRepository, env, PAYER, REQUEST),
    ).rejects.toMatchObject({ status: 503, code: "billing_not_configured" });
  });
});

describe("Google Play plan management", () => {
  it("leaves changes and cancellation to Google Play", async () => {
    const { env } = await setup();
    await verifyGooglePlayPurchase(googlePlayRepository, env, PAYER, REQUEST);

    await expect(
      changePlan(billingRepository, env, TENANT_ID, null, { plan: "budget", interval: "month" }),
    ).rejects.toMatchObject({ status: 409, code: "managed_in_google_play" });
    await expect(cancelSubscription(billingRepository, env, TENANT_ID, null)).rejects.toMatchObject(
      { code: "managed_in_google_play" },
    );
  });

  it("stops renewal through Google when a family plan is handed over", async () => {
    const { env, calls } = await setup();

    await cancelProviderSubscription(env, {
      provider: "google_play",
      providerSubscriptionId: TOKEN,
      providerPlanId: "zoption_family_pro:yearly",
    });

    expect(calls(":cancel")).toEqual([
      `${API}/site.zoption.app/purchases/subscriptions/zoption_family_pro/tokens/${TOKEN}:cancel`,
    ]);
  });
});

describe("Google Play billing routes", () => {
  it("verifies for the signed-in payer and exposes their account id", async () => {
    const { env, row } = await setup();
    const app = createTestApp({
      user: { id: USER_ID },
      tenant: { tenantId: TENANT_ID } as never,
      env,
    });
    app.route("/billing", createBillingRoutes(billingRepository, googlePlayRepository));
    app.onError((error, context) =>
      context.json({ code: error instanceof HttpError ? error.code : "error" }, 500),
    );

    const account = await app.request("/billing/google-play/account");
    await expect(account.json()).resolves.toEqual({
      obfuscatedAccountId: await googlePlayAccountId(USER_ID),
    });
    const response = await app.request("/billing/google-play", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(REQUEST),
    });
    expect(response.status).toBe(200);
    expect(row()).toMatchObject({ tenantId: TENANT_ID, status: "active" });
  });
});

describe("Google Play recheck", () => {
  function age(database: DatabaseSync, token: string, readAt: string) {
    database
      .prepare(
        `UPDATE billing_subscriptions SET last_provider_occurred_at = ?
         WHERE provider_subscription_id = ?`,
      )
      .run(readAt, token);
  }

  it("rereads purchases not checked today and leaves fresh ones alone", async () => {
    const { env, database, purchases, row, fetchMock } = await setup();
    await verifyGooglePlayPurchase(googlePlayRepository, env, PAYER, REQUEST);
    fetchMock.mockClear();

    await expect(recheckGooglePlaySubscriptions(googlePlayRepository, env)).resolves.toEqual({
      checked: 0,
      updated: 0,
      expired: 0,
      failed: 0,
    });
    expect(fetchMock).not.toHaveBeenCalled();

    age(database, TOKEN, "2020-01-01T00:00:00.000Z");
    purchases.set(
      TOKEN,
      await purchase({
        subscriptionState: "SUBSCRIPTION_STATE_ON_HOLD",
        acknowledgementState: "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED",
      }),
    );
    await expect(recheckGooglePlaySubscriptions(googlePlayRepository, env)).resolves.toEqual({
      checked: 1,
      updated: 1,
      expired: 0,
      failed: 0,
    });
    expect(row()).toMatchObject({ status: "past_due" });
    expect(await readTier(env, TENANT_ID)).toBe("free");
  });

  it("picks up a renewal soon after the period ends", async () => {
    const { env, database, purchases, row } = await setup();
    await verifyGooglePlayPurchase(googlePlayRepository, env, PAYER, REQUEST);
    const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
    database
      .prepare(
        `UPDATE billing_subscriptions
         SET current_period_ends_at = ?, last_provider_occurred_at = ?
         WHERE provider_subscription_id = ?`,
      )
      .run(hourAgo, hourAgo, TOKEN);
    expect(await readTier(env, TENANT_ID)).toBe("free");

    await recheckGooglePlaySubscriptions(googlePlayRepository, env);

    expect(row()).toMatchObject({ status: "active", currentPeriodEndsAt: PERIOD_END });
    expect(await readTier(env, TENANT_ID)).toBe("zoption_pro");
  });

  it("ends a token Google no longer knows and keeps going after a failure", async () => {
    const { env, database, purchases, row } = await setup();
    await verifyGooglePlayPurchase(googlePlayRepository, env, PAYER, REQUEST);
    purchases.set("purchase-token-2", await purchase());
    await verifyGooglePlayPurchase(googlePlayRepository, env, PAYER, {
      ...REQUEST,
      purchaseToken: "purchase-token-2",
    });
    age(database, TOKEN, "2020-01-01T00:00:00.000Z");
    age(database, "purchase-token-2", "2020-01-02T00:00:00.000Z");
    purchases.set(TOKEN, 500);
    purchases.set("purchase-token-2", 410);
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(recheckGooglePlaySubscriptions(googlePlayRepository, env)).resolves.toEqual({
      checked: 2,
      updated: 0,
      expired: 1,
      failed: 1,
    });
    expect(row()).toMatchObject({ status: "active" });
    expect(row("purchase-token-2")).toMatchObject({
      status: "canceled",
      providerStatus: "TOKEN_GONE",
    });
  });

  it("does nothing until Google Play is configured", async () => {
    const { env, fetchMock } = await setup({ GOOGLE_PLAY_PACKAGE_NAME: undefined });

    await expect(recheckGooglePlaySubscriptions(googlePlayRepository, env)).resolves.toMatchObject({
      checked: 0,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
