import type { BillingSubscriptionStatus } from "@zoption/shared";

import { HttpError } from "../errors";
import type { Bindings } from "../types";

const PROVIDER_TIMEOUT_MS = 10_000;

type RecordValue = Record<string, unknown>;

export interface PayPalSubscription {
  id: string;
  status: string;
  planId: string;
  customId: string | null;
  payerId: string | null;
  currentPeriodEndsAt: string | null;
  statusUpdatedAt: string | null;
  approvalUrl: string | null;
}

export function normalizePayPalSubscriptionStatus(
  providerStatus: string,
): BillingSubscriptionStatus | null {
  switch (providerStatus) {
    case "ACTIVE":
      return "active";
    case "SUSPENDED":
      return "paused";
    case "CANCELLED":
    case "EXPIRED":
      return "canceled";
    default:
      return null;
  }
}

export function isPayPalCheckoutPending(providerStatus: string): boolean {
  return providerStatus === "APPROVAL_PENDING" || providerStatus === "APPROVED";
}

function asRecord(value: unknown): RecordValue | null {
  return typeof value === "object" && value !== null ? (value as RecordValue) : null;
}

function stringAt(value: RecordValue | null, key: string): string | null {
  const item = value?.[key];
  return typeof item === "string" && item ? item : null;
}

function apiBaseUrl(env: Bindings): string {
  if (env.PAYPAL_ENVIRONMENT === "sandbox") return "https://api-m.sandbox.paypal.com";
  if (env.PAYPAL_ENVIRONMENT === "production") return "https://api-m.paypal.com";
  throw new HttpError(503, "billing_not_configured", "Billing is not configured yet.");
}

function approvalHost(env: Bindings): string {
  if (env.PAYPAL_ENVIRONMENT === "sandbox") return "www.sandbox.paypal.com";
  if (env.PAYPAL_ENVIRONMENT === "production") return "www.paypal.com";
  throw new HttpError(503, "billing_not_configured", "Billing is not configured yet.");
}

function credentials(env: Bindings): { clientId: string; clientSecret: string } {
  const clientId = env.PAYPAL_CLIENT_ID?.trim();
  const clientSecret = env.PAYPAL_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new HttpError(503, "billing_not_configured", "Billing is not configured yet.");
  }
  return { clientId, clientSecret };
}

function webhookId(env: Bindings): string {
  const value = env.PAYPAL_WEBHOOK_ID?.trim();
  if (!value) throw new HttpError(503, "billing_not_configured", "Billing is not configured yet.");
  return value;
}

function applicationUrls(env: Bindings): { returnUrl: string; cancelUrl: string } {
  const value = env.WEB_APP_URL?.trim();
  if (!value) throw new HttpError(503, "billing_not_configured", "Billing is not configured yet.");

  let base: URL;
  try {
    base = new URL(value);
  } catch {
    throw new HttpError(503, "billing_not_configured", "Billing is not configured yet.");
  }
  if (base.protocol !== "https:" && base.hostname !== "localhost" && base.hostname !== "127.0.0.1") {
    throw new HttpError(503, "billing_not_configured", "Billing is not configured yet.");
  }

  const returnUrl = new URL("/app/settings", base);
  returnUrl.searchParams.set("checkout", "completed");
  returnUrl.hash = "plan-and-billing";
  const cancelUrl = new URL("/app/settings", base);
  cancelUrl.searchParams.set("checkout", "cancelled");
  cancelUrl.hash = "plan-and-billing";
  return { returnUrl: returnUrl.toString(), cancelUrl: cancelUrl.toString() };
}

function providerError(): HttpError {
  return new HttpError(502, "billing_provider_error", "The billing provider could not complete the request.");
}

async function providerFetch(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS) });
  } catch {
    throw new HttpError(504, "billing_provider_timeout", "The billing provider did not respond in time.");
  }
}

async function accessToken(env: Bindings): Promise<string> {
  const { clientId, clientSecret } = credentials(env);
  const encoded = btoa(`${clientId}:${clientSecret}`);
  const response = await providerFetch(`${apiBaseUrl(env)}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${encoded}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!response.ok) throw providerError();
  const payload = asRecord(await response.json().catch(() => null));
  const token = stringAt(payload, "access_token");
  if (!token) throw providerError();
  return token;
}

function canonicalTimestamp(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}

function approvalUrl(env: Bindings, payload: RecordValue): string | null {
  const links = Array.isArray(payload.links) ? payload.links : [];
  const approve = links
    .map((value) => asRecord(value))
    .find((link) => stringAt(link, "rel") === "approve");
  const value = stringAt(approve ?? null, "href");
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === approvalHost(env) ? url.toString() : null;
  } catch {
    return null;
  }
}

function parseSubscription(env: Bindings, payload: unknown): PayPalSubscription {
  const value = asRecord(payload);
  const subscriber = asRecord(value?.subscriber);
  const billingInfo = asRecord(value?.billing_info);
  const id = stringAt(value, "id");
  const status = stringAt(value, "status");
  const planId = stringAt(value, "plan_id");
  if (!value || !id || !status || !planId) throw providerError();
  return {
    id,
    status,
    planId,
    customId: stringAt(value, "custom_id"),
    payerId: stringAt(subscriber, "payer_id"),
    currentPeriodEndsAt: canonicalTimestamp(stringAt(billingInfo, "next_billing_time")),
    statusUpdatedAt:
      canonicalTimestamp(stringAt(value, "status_update_time")) ??
      canonicalTimestamp(stringAt(value, "create_time")),
    approvalUrl: approvalUrl(env, value),
  };
}

export async function createPayPalSubscription(
  env: Bindings,
  input: { planId: string; checkoutReference: string },
): Promise<PayPalSubscription> {
  const token = await accessToken(env);
  const { returnUrl, cancelUrl } = applicationUrls(env);
  const response = await providerFetch(`${apiBaseUrl(env)}/v1/billing/subscriptions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "PayPal-Request-Id": `zoption-checkout-${input.checkoutReference}`,
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      plan_id: input.planId,
      custom_id: input.checkoutReference,
      application_context: {
        return_url: returnUrl,
        cancel_url: cancelUrl,
        user_action: "SUBSCRIBE_NOW",
      },
    }),
  });
  if (!response.ok) throw providerError();
  const subscription = parseSubscription(env, await response.json().catch(() => null));
  if (!subscription.approvalUrl) throw providerError();
  return subscription;
}

export async function getPayPalSubscription(
  env: Bindings,
  subscriptionId: string,
): Promise<PayPalSubscription> {
  const token = await accessToken(env);
  const response = await providerFetch(
    `${apiBaseUrl(env)}/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok) throw providerError();
  return parseSubscription(env, await response.json().catch(() => null));
}

export async function cancelPayPalSubscription(env: Bindings, subscriptionId: string): Promise<void> {
  const token = await accessToken(env);
  const response = await providerFetch(
    `${apiBaseUrl(env)}/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "Canceled by the subscriber in Zoption." }),
    },
  );
  if (!response.ok && response.status !== 204) throw providerError();
}

export async function verifyPayPalWebhook(
  env: Bindings,
  event: unknown,
  headers: {
    authAlgo?: string;
    certUrl?: string;
    transmissionId?: string;
    transmissionSignature?: string;
    transmissionTime?: string;
  },
): Promise<boolean> {
  if (
    !headers.authAlgo ||
    !headers.certUrl ||
    !headers.transmissionId ||
    !headers.transmissionSignature ||
    !headers.transmissionTime
  ) {
    return false;
  }
  const token = await accessToken(env);
  const response = await providerFetch(`${apiBaseUrl(env)}/v1/notifications/verify-webhook-signature`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      auth_algo: headers.authAlgo,
      cert_url: headers.certUrl,
      transmission_id: headers.transmissionId,
      transmission_sig: headers.transmissionSignature,
      transmission_time: headers.transmissionTime,
      webhook_id: webhookId(env),
      webhook_event: event,
    }),
  });
  if (!response.ok) return false;
  const payload = asRecord(await response.json().catch(() => null));
  return stringAt(payload, "verification_status") === "SUCCESS";
}
