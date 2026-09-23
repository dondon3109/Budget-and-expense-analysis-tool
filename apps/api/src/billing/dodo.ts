import type { BillingSubscriptionStatus } from "@zoption/shared";

import { HttpError } from "../errors";
import type { Bindings } from "../types";

const PROVIDER_TIMEOUT_MS = 10_000;
/** Standard Webhooks re-signs every retry, so only a fresh signature is accepted. */
const WEBHOOK_TOLERANCE_SECONDS = 5 * 60;
const WEBHOOK_ID_PATTERN = /^[A-Za-z0-9._~-]{1,128}$/;
const WEBHOOK_TIMESTAMP_PATTERN = /^\d{1,12}$/;
const WEBHOOK_SIGNATURE_LIMIT = 4_096;

type RecordValue = Record<string, unknown>;

export interface DodoWebhookHeaders {
  id?: string;
  timestamp?: string;
  signature?: string;
}

export interface DodoCheckoutSession {
  sessionId: string;
  checkoutUrl: string;
}

export interface DodoPayment {
  paymentId: string;
  status: string | null;
  subscriptionId: string | null;
  checkoutSessionId: string | null;
}

export interface DodoSubscription {
  id: string;
  status: string;
  productId: string;
  customerId: string | null;
  checkoutReference: string | null;
  nextBillingDate: string | null;
  cancelAtNextBillingDate: boolean;
}

export function normalizeDodoSubscriptionStatus(
  providerStatus: string,
): BillingSubscriptionStatus | null {
  switch (providerStatus) {
    case "active":
      return "active";
    case "past_due":
    case "on_hold":
      return "past_due";
    case "paused":
      return "paused";
    case "cancelled":
    case "expired":
    case "failed":
      return "canceled";
    default:
      return null;
  }
}

function asRecord(value: unknown): RecordValue | null {
  return typeof value === "object" && value !== null ? (value as RecordValue) : null;
}

function stringAt(value: RecordValue | null, key: string): string | null {
  const item = value?.[key];
  return typeof item === "string" && item ? item : null;
}

function canonicalTimestamp(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}

function notConfigured(): HttpError {
  return new HttpError(503, "billing_not_configured", "Billing is not configured yet.");
}

function providerError(): HttpError {
  return new HttpError(
    502,
    "billing_provider_error",
    "The billing provider could not complete the request.",
  );
}

function apiBaseUrl(env: Bindings): string {
  if (env.DODO_PAYMENTS_ENVIRONMENT === "test_mode") return "https://test.dodopayments.com";
  if (env.DODO_PAYMENTS_ENVIRONMENT === "live_mode") return "https://live.dodopayments.com";
  throw notConfigured();
}

function apiKey(env: Bindings): string {
  const value = env.DODO_PAYMENTS_API_KEY?.trim();
  if (!value) throw notConfigured();
  return value;
}

/** Dodo hosts its checkout pages on dodopayments.com subdomains in both modes. */
export function isDodoCheckoutUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      url.hostname.endsWith(".dodopayments.com")
    );
  } catch {
    return false;
  }
}

function applicationUrls(env: Bindings): { returnUrl: string; cancelUrl: string } {
  let base: URL;
  try {
    base = new URL(env.WEB_APP_URL?.trim() ?? "");
  } catch {
    throw notConfigured();
  }
  if (
    base.protocol !== "https:" &&
    base.hostname !== "localhost" &&
    base.hostname !== "127.0.0.1"
  ) {
    throw notConfigured();
  }

  // No fragment: Dodo appends its own query parameters to the return URL.
  const returnUrl = new URL("/app/settings", base);
  returnUrl.searchParams.set("checkout", "completed");
  const cancelUrl = new URL("/app/settings", base);
  cancelUrl.searchParams.set("checkout", "cancelled");
  return { returnUrl: returnUrl.toString(), cancelUrl: cancelUrl.toString() };
}

async function dodoFetch(env: Bindings, path: string, init: RequestInit = {}): Promise<unknown> {
  const url = `${apiBaseUrl(env)}${path}`;
  const headers = { Authorization: `Bearer ${apiKey(env)}`, "Content-Type": "application/json" };
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers,
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });
  } catch {
    throw new HttpError(
      504,
      "billing_provider_timeout",
      "The billing provider did not respond in time.",
    );
  }
  if (!response.ok) throw providerError();
  return response.json().catch(() => null);
}

export async function createDodoCheckoutSession(
  env: Bindings,
  input: { productId: string; checkoutReference: string },
): Promise<DodoCheckoutSession> {
  const { returnUrl, cancelUrl } = applicationUrls(env);
  const payload = asRecord(
    await dodoFetch(env, "/checkouts", {
      method: "POST",
      body: JSON.stringify({
        product_cart: [{ product_id: input.productId, quantity: 1 }],
        return_url: returnUrl,
        cancel_url: cancelUrl,
        metadata: { checkout_reference: input.checkoutReference },
      }),
    }),
  );
  const sessionId = stringAt(payload, "session_id");
  const checkoutUrl = stringAt(payload, "checkout_url");
  if (!sessionId || !checkoutUrl || !isDodoCheckoutUrl(checkoutUrl)) throw providerError();
  return { sessionId, checkoutUrl };
}

/** The payment a checkout session produced, or null while the buyer has not paid yet. */
export async function getDodoCheckoutSessionPaymentId(
  env: Bindings,
  sessionId: string,
): Promise<string | null> {
  const payload = asRecord(await dodoFetch(env, `/checkouts/${encodeURIComponent(sessionId)}`));
  if (stringAt(payload, "id") !== sessionId) throw providerError();
  return stringAt(payload, "payment_id");
}

export async function getDodoPayment(env: Bindings, paymentId: string): Promise<DodoPayment> {
  const payload = asRecord(await dodoFetch(env, `/payments/${encodeURIComponent(paymentId)}`));
  if (stringAt(payload, "payment_id") !== paymentId) throw providerError();
  return {
    paymentId,
    status: stringAt(payload, "status"),
    subscriptionId: stringAt(payload, "subscription_id"),
    checkoutSessionId: stringAt(payload, "checkout_session_id"),
  };
}

export async function getDodoSubscription(
  env: Bindings,
  subscriptionId: string,
): Promise<DodoSubscription> {
  const payload = asRecord(
    await dodoFetch(env, `/subscriptions/${encodeURIComponent(subscriptionId)}`),
  );
  const id = stringAt(payload, "subscription_id");
  const status = stringAt(payload, "status");
  const productId = stringAt(payload, "product_id");
  if (!payload || id !== subscriptionId || !status || !productId) throw providerError();
  return {
    id,
    status,
    productId,
    customerId: stringAt(asRecord(payload.customer), "customer_id"),
    checkoutReference: stringAt(asRecord(payload.metadata), "checkout_reference"),
    nextBillingDate: canonicalTimestamp(stringAt(payload, "next_billing_date")),
    cancelAtNextBillingDate: payload.cancel_at_next_billing_date === true,
  };
}

/** Stops renewal; Dodo keeps the subscription active until the paid period ends. */
export async function cancelDodoSubscription(env: Bindings, subscriptionId: string): Promise<void> {
  await dodoFetch(env, `/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    method: "PATCH",
    body: JSON.stringify({
      cancel_at_next_billing_date: true,
      cancel_reason: "cancelled_by_customer",
    }),
  });
}

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> | null {
  try {
    return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

function webhookSigningKey(env: Bindings): Uint8Array<ArrayBuffer> {
  const secret = env.DODO_PAYMENTS_WEBHOOK_KEY?.trim();
  const key = secret ? base64ToBytes(secret.replace(/^whsec_/, "")) : null;
  if (!key?.length) throw notConfigured();
  return key;
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  left.forEach((byte, index) => {
    difference |= byte ^ right[index]!;
  });
  return difference === 0;
}

export function isValidDodoWebhookHeaders(
  headers: DodoWebhookHeaders,
): headers is Required<DodoWebhookHeaders> {
  return Boolean(
    headers.id &&
    WEBHOOK_ID_PATTERN.test(headers.id) &&
    headers.timestamp &&
    WEBHOOK_TIMESTAMP_PATTERN.test(headers.timestamp) &&
    headers.signature &&
    headers.signature.length <= WEBHOOK_SIGNATURE_LIMIT,
  );
}

/**
 * Standard Webhooks verification: HMAC-SHA256 over `id.timestamp.body` with the base64 key
 * after the `whsec_` prefix. The header lists space-separated `v1,<base64>` signatures, one
 * per active signing key, and any match is accepted.
 */
export async function verifyDodoWebhook(
  env: Bindings,
  rawBody: string,
  headers: DodoWebhookHeaders,
  now = Date.now(),
): Promise<boolean> {
  if (!isValidDodoWebhookHeaders(headers)) return false;
  const ageSeconds = Math.abs(now / 1_000 - Number(headers.timestamp));
  if (ageSeconds > WEBHOOK_TOLERANCE_SECONDS) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    webhookSigningKey(env),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const expected = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(`${headers.id}.${headers.timestamp}.${rawBody}`),
    ),
  );
  return headers.signature.split(" ").some((entry) => {
    const [version, signature] = entry.split(",", 2);
    const bytes = version === "v1" && signature ? base64ToBytes(signature) : null;
    return bytes !== null && constantTimeEqual(bytes, expected);
  });
}
