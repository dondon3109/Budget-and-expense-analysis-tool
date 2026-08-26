import type { BillingSubscriptionStatus } from "@zoption/shared";

import { HttpError } from "../errors";
import type { Bindings } from "../types";

const PROVIDER_TIMEOUT_MS = 10_000;
const OAUTH_TOKEN_EXPIRY_SAFETY_MS = 60_000;
const WEBHOOK_HEADER_LIMITS = {
  authAlgo: 32,
  certUrl: 2_048,
  transmissionId: 128,
  transmissionSignature: 4_096,
  transmissionTime: 64,
} as const;

const TRANSMISSION_ID_PATTERN = /^[A-Za-z0-9._~-]+$/;
const TRANSMISSION_SIGNATURE_PATTERN = /^[A-Za-z0-9+/_=-]+$/;
const CERTIFICATE_PATH_PATTERN = /^\/v1\/notifications\/certs\/[A-Za-z0-9._~-]+$/;
const UTC_TIMESTAMP_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?Z$/;

type RecordValue = Record<string, unknown>;
type ProviderRequestInit = Omit<RequestInit, "headers"> & { headers?: Record<string, string> };

interface CachedAccessToken {
  token: string;
  expiresAt: number;
}

export interface PayPalWebhookHeaders {
  authAlgo?: string;
  certUrl?: string;
  transmissionId?: string;
  transmissionSignature?: string;
  transmissionTime?: string;
}

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

export interface PayPalBrowserConfiguration {
  clientId: string;
  environment: "sandbox" | "production";
}

const accessTokenCache = new Map<string, CachedAccessToken>();
const pendingAccessTokens = new Map<string, Promise<CachedAccessToken>>();

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

function numberAt(value: RecordValue | null, key: string): number | null {
  const item = value?.[key];
  return typeof item === "number" && Number.isFinite(item) ? item : null;
}

function apiBaseUrl(env: Bindings): string {
  if (env.PAYPAL_ENVIRONMENT === "sandbox") return "https://api-m.sandbox.paypal.com";
  if (env.PAYPAL_ENVIRONMENT === "production") return "https://api-m.paypal.com";
  throw new HttpError(503, "billing_not_configured", "Billing is not configured yet.");
}

function certificateHost(env: Bindings): string {
  if (env.PAYPAL_ENVIRONMENT === "sandbox") return "api.sandbox.paypal.com";
  if (env.PAYPAL_ENVIRONMENT === "production") return "api.paypal.com";
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

/** Public SDK configuration only. The client secret remains Worker-side. */
export function getPayPalBrowserConfiguration(env: Bindings): PayPalBrowserConfiguration {
  const { clientId } = credentials(env);
  const environment = env.PAYPAL_ENVIRONMENT;
  if (environment !== "sandbox" && environment !== "production") {
    throw new HttpError(503, "billing_not_configured", "Billing is not configured yet.");
  }
  return { clientId, environment };
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
  if (
    base.protocol !== "https:" &&
    base.hostname !== "localhost" &&
    base.hostname !== "127.0.0.1"
  ) {
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
  return new HttpError(
    502,
    "billing_provider_error",
    "The billing provider could not complete the request.",
  );
}

async function providerFetch(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS) });
  } catch {
    throw new HttpError(
      504,
      "billing_provider_timeout",
      "The billing provider did not respond in time.",
    );
  }
}

function accessTokenContext(env: Bindings): {
  cacheKey: string;
  apiBase: string;
  clientId: string;
  clientSecret: string;
} {
  const apiBase = apiBaseUrl(env);
  const { clientId, clientSecret } = credentials(env);
  return {
    cacheKey: `${new URL(apiBase).origin}\n${clientId}`,
    apiBase,
    clientId,
    clientSecret,
  };
}

async function requestAccessToken(
  context: ReturnType<typeof accessTokenContext>,
): Promise<CachedAccessToken> {
  const encoded = btoa(`${context.clientId}:${context.clientSecret}`);
  const response = await providerFetch(`${context.apiBase}/v1/oauth2/token`, {
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
  const expiresInSeconds = numberAt(payload, "expires_in");
  if (!token || !expiresInSeconds || expiresInSeconds <= 0) throw providerError();
  return {
    token,
    expiresAt: Date.now() + Math.max(0, expiresInSeconds * 1_000 - OAUTH_TOKEN_EXPIRY_SAFETY_MS),
  };
}

async function accessToken(env: Bindings): Promise<string> {
  const tokenContext = accessTokenContext(env);
  const cached = accessTokenCache.get(tokenContext.cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.token;
  accessTokenCache.delete(tokenContext.cacheKey);

  const pending = pendingAccessTokens.get(tokenContext.cacheKey);
  if (pending) return (await pending).token;

  const request = requestAccessToken(tokenContext)
    .then((entry) => {
      accessTokenCache.set(tokenContext.cacheKey, entry);
      return entry;
    })
    .catch((error: unknown) => {
      accessTokenCache.delete(tokenContext.cacheKey);
      throw error;
    });
  pendingAccessTokens.set(tokenContext.cacheKey, request);
  try {
    return (await request).token;
  } finally {
    if (pendingAccessTokens.get(tokenContext.cacheKey) === request) {
      pendingAccessTokens.delete(tokenContext.cacheKey);
    }
  }
}

function invalidateAccessToken(env: Bindings, rejectedToken: string): void {
  const { cacheKey } = accessTokenContext(env);
  if (accessTokenCache.get(cacheKey)?.token === rejectedToken) {
    accessTokenCache.delete(cacheKey);
  }
}

async function authenticatedProviderFetch(
  env: Bindings,
  url: string,
  init: ProviderRequestInit = {},
): Promise<Response> {
  const token = await accessToken(env);
  const request = (accessTokenValue: string) =>
    providerFetch(url, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${accessTokenValue}` },
    });

  const response = await request(token);
  if (response.status !== 401) return response;

  invalidateAccessToken(env, token);
  return request(await accessToken(env));
}

function containsControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 31 || code === 127) return true;
  }
  return false;
}

function boundedHeader(value: string | undefined, maxLength: number): value is string {
  return Boolean(
    value &&
    value.length <= maxLength &&
    value.trim() === value &&
    !containsControlCharacter(value),
  );
}

function parseUtcTimestamp(value: string): number | null {
  const match = UTC_TIMESTAMP_PATTERN.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const millisecond = Number((match[7] ?? "").padEnd(3, "0"));
  const timestamp = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);
  const date = new Date(timestamp);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day ||
    date.getUTCHours() !== hour ||
    date.getUTCMinutes() !== minute ||
    date.getUTCSeconds() !== second ||
    date.getUTCMilliseconds() !== millisecond
  ) {
    return null;
  }
  return timestamp;
}

export function isValidPayPalWebhookHeaders(
  env: Bindings,
  headers: PayPalWebhookHeaders,
): headers is Required<PayPalWebhookHeaders> {
  if (
    !boundedHeader(headers.authAlgo, WEBHOOK_HEADER_LIMITS.authAlgo) ||
    headers.authAlgo !== "SHA256withRSA" ||
    !boundedHeader(headers.certUrl, WEBHOOK_HEADER_LIMITS.certUrl) ||
    !boundedHeader(headers.transmissionId, WEBHOOK_HEADER_LIMITS.transmissionId) ||
    !TRANSMISSION_ID_PATTERN.test(headers.transmissionId) ||
    !boundedHeader(headers.transmissionSignature, WEBHOOK_HEADER_LIMITS.transmissionSignature) ||
    !TRANSMISSION_SIGNATURE_PATTERN.test(headers.transmissionSignature) ||
    !boundedHeader(headers.transmissionTime, WEBHOOK_HEADER_LIMITS.transmissionTime)
  ) {
    return false;
  }

  let certUrl: URL;
  try {
    certUrl = new URL(headers.certUrl);
  } catch {
    return false;
  }
  if (
    certUrl.protocol !== "https:" ||
    certUrl.hostname !== certificateHost(env) ||
    certUrl.username ||
    certUrl.password ||
    certUrl.port ||
    certUrl.search ||
    certUrl.hash ||
    !CERTIFICATE_PATH_PATTERN.test(certUrl.pathname)
  ) {
    return false;
  }

  return parseUtcTimestamp(headers.transmissionTime) !== null;
}

export function clearPayPalAccessTokenCacheForTesting(): void {
  accessTokenCache.clear();
  pendingAccessTokens.clear();
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
  const { returnUrl, cancelUrl } = applicationUrls(env);
  const response = await authenticatedProviderFetch(
    env,
    `${apiBaseUrl(env)}/v1/billing/subscriptions`,
    {
      method: "POST",
      headers: {
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
    },
  );
  if (!response.ok) throw providerError();
  const subscription = parseSubscription(env, await response.json().catch(() => null));
  if (!subscription.approvalUrl) throw providerError();
  return subscription;
}

export async function getPayPalSubscription(
  env: Bindings,
  subscriptionId: string,
): Promise<PayPalSubscription> {
  const response = await authenticatedProviderFetch(
    env,
    `${apiBaseUrl(env)}/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}`,
  );
  if (!response.ok) throw providerError();
  return parseSubscription(env, await response.json().catch(() => null));
}

export async function cancelPayPalSubscription(
  env: Bindings,
  subscriptionId: string,
): Promise<void> {
  const response = await authenticatedProviderFetch(
    env,
    `${apiBaseUrl(env)}/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "Canceled by the subscriber in Zoption." }),
    },
  );
  if (!response.ok && response.status !== 204) throw providerError();
}

export async function verifyPayPalWebhook(
  env: Bindings,
  event: unknown,
  headers: PayPalWebhookHeaders,
): Promise<boolean> {
  if (!isValidPayPalWebhookHeaders(env, headers)) return false;

  const response = await authenticatedProviderFetch(
    env,
    `${apiBaseUrl(env)}/v1/notifications/verify-webhook-signature`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        auth_algo: headers.authAlgo,
        cert_url: headers.certUrl,
        transmission_id: headers.transmissionId,
        transmission_sig: headers.transmissionSignature,
        transmission_time: headers.transmissionTime,
        webhook_id: webhookId(env),
        webhook_event: event,
      }),
    },
  );
  if (!response.ok) return false;
  const payload = asRecord(await response.json().catch(() => null));
  return stringAt(payload, "verification_status") === "SUCCESS";
}
