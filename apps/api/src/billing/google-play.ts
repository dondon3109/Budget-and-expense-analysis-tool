import type { BillingInterval, BillingSubscriptionStatus } from "@zoption/shared";
import { z } from "zod";

import type { BillingSubscriptionSnapshot } from "../db/billing";
import { HttpError } from "../errors";
import type { Bindings } from "../types";
import { configuredPlan } from "./plan-ids";

// The Google Play Android Developer API, called as the `zoption-play-billing` service account.
// Purchases are read with `purchases.subscriptionsv2.get`; acknowledging and cancelling still go
// through the v1 `purchases.subscriptions` methods, which name the product.

const API_ORIGIN = "https://androidpublisher.googleapis.com/androidpublisher/v3/applications";
// Fixed rather than read from the key's `token_uri`, so a key cannot redirect the signed grant.
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/androidpublisher";
const PROVIDER_TIMEOUT_MS = 10_000;
const PACKAGE_NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/;

const serviceAccountSchema = z.object({
  client_email: z.email(),
  private_key: z.string().includes("PRIVATE KEY"),
});

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().int().positive(),
});

// Google adds fields over time, so unknown keys are allowed; only what is read is checked.
const subscriptionPurchaseSchema = z.object({
  subscriptionState: z.string().min(1),
  acknowledgementState: z.string().optional(),
  latestOrderId: z.string().optional(),
  linkedPurchaseToken: z.string().min(1).optional(),
  testPurchase: z.object({}).optional(),
  externalAccountIdentifiers: z
    .object({ obfuscatedExternalAccountId: z.string().optional() })
    .optional(),
  lineItems: z
    .array(
      z.object({
        productId: z.string().min(1),
        expiryTime: z.string().optional(),
        offerDetails: z.object({ basePlanId: z.string().min(1) }).optional(),
      }),
    )
    .min(1),
});

export interface GooglePlayPurchase {
  purchaseToken: string;
  /** `SUBSCRIPTION_STATE_*` as Google reports it. */
  state: string;
  productId: string;
  basePlanId: string;
  expiresAt: string | null;
  acknowledged: boolean;
  obfuscatedAccountId: string | null;
  linkedPurchaseToken: string | null;
  latestOrderId: string | null;
  testPurchase: boolean;
}

interface GooglePlayConfig {
  packageName: string;
  clientEmail: string;
  privateKey: string;
}

let cachedToken: { clientEmail: string; accessToken: string; expiresAt: number } | null = null;

function notConfigured(): HttpError {
  return new HttpError(503, "billing_not_configured", "Google Play billing is not configured yet.");
}

function providerError(): HttpError {
  return new HttpError(
    502,
    "billing_provider_error",
    "Google Play could not complete the request.",
  );
}

export function isGooglePlayConfigured(env: Bindings): boolean {
  return Boolean(env.GOOGLE_PLAY_PACKAGE_NAME?.trim() && env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON);
}

function googlePlayConfig(env: Bindings): GooglePlayConfig {
  const packageName = env.GOOGLE_PLAY_PACKAGE_NAME?.trim() ?? "";
  if (!PACKAGE_NAME_PATTERN.test(packageName)) throw notConfigured();
  let key: unknown;
  try {
    key = JSON.parse(env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON ?? "");
  } catch {
    throw notConfigured();
  }
  const parsed = serviceAccountSchema.safeParse(key);
  if (!parsed.success) throw notConfigured();
  return {
    packageName,
    clientEmail: parsed.data.client_email,
    privateKey: parsed.data.private_key,
  };
}

function base64Url(bytes: Uint8Array | string): string {
  const binary =
    typeof bytes === "string"
      ? bytes
      : Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToPkcs8(pem: string): ArrayBuffer {
  const body = pem
    .replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "")
    .replace(/\\n/g, "")
    .replace(/\s+/g, "");
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

/** The service account's OAuth grant: an RS256 JWT exchanged for an hour-long access token. */
async function accessToken(config: GooglePlayConfig, now = Date.now()): Promise<string> {
  if (cachedToken?.clientEmail === config.clientEmail && cachedToken.expiresAt > now + 60_000) {
    return cachedToken.accessToken;
  }
  let key: CryptoKey;
  try {
    key = await crypto.subtle.importKey(
      "pkcs8",
      pemToPkcs8(config.privateKey),
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"],
    );
  } catch {
    throw notConfigured();
  }
  const issuedAt = Math.floor(now / 1_000);
  const encoder = new TextEncoder();
  const unsigned = `${base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${base64Url(
    JSON.stringify({
      iss: config.clientEmail,
      scope: SCOPE,
      aud: TOKEN_URL,
      iat: issuedAt,
      exp: issuedAt + 3_600,
    }),
  )}`;
  const signature = new Uint8Array(
    await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, encoder.encode(unsigned)),
  );
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${base64Url(signature)}`,
    }),
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
  });
  if (!response.ok) throw providerError();
  const parsed = tokenResponseSchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) throw providerError();
  cachedToken = {
    clientEmail: config.clientEmail,
    accessToken: parsed.data.access_token,
    expiresAt: now + parsed.data.expires_in * 1_000,
  };
  return parsed.data.access_token;
}

async function callGooglePlay(
  env: Bindings,
  path: string,
  method: "GET" | "POST",
): Promise<Response> {
  const config = googlePlayConfig(env);
  const token = await accessToken(config);
  return fetch(`${API_ORIGIN}/${encodeURIComponent(config.packageName)}/purchases/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
    },
    body: method === "POST" ? "{}" : undefined,
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
  });
}

function isoTime(value: string | undefined): string | null {
  if (!value) return null;
  const time = new Date(value);
  return Number.isNaN(time.getTime()) ? null : time.toISOString();
}

/**
 * Reads a subscription purchase. Null when Google no longer knows the token: 404 for one it never
 * issued, 410 for one that expired long ago. A purchase of several products is not one of ours.
 */
export async function getGooglePlaySubscription(
  env: Bindings,
  purchaseToken: string,
): Promise<GooglePlayPurchase | null> {
  const response = await callGooglePlay(
    env,
    `subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`,
    "GET",
  );
  if (response.status === 404 || response.status === 410) return null;
  if (!response.ok) throw providerError();
  const parsed = subscriptionPurchaseSchema.safeParse(await response.json().catch(() => null));
  const lineItem = parsed.success ? parsed.data.lineItems[0] : undefined;
  if (!parsed.success || parsed.data.lineItems.length !== 1 || !lineItem?.offerDetails) {
    throw providerError();
  }
  const purchase = parsed.data;
  return {
    purchaseToken,
    state: purchase.subscriptionState,
    productId: lineItem.productId,
    basePlanId: lineItem.offerDetails.basePlanId,
    expiresAt: isoTime(lineItem.expiryTime),
    acknowledged: purchase.acknowledgementState === "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED",
    obfuscatedAccountId: purchase.externalAccountIdentifiers?.obfuscatedExternalAccountId ?? null,
    linkedPurchaseToken: purchase.linkedPurchaseToken ?? null,
    latestOrderId: purchase.latestOrderId ?? null,
    testPurchase: purchase.testPurchase !== undefined,
  };
}

/** Google refunds a purchase left unacknowledged for three days. */
export async function acknowledgeGooglePlaySubscription(
  env: Bindings,
  purchase: Pick<GooglePlayPurchase, "productId" | "purchaseToken">,
): Promise<void> {
  const response = await callGooglePlay(
    env,
    `subscriptions/${encodeURIComponent(purchase.productId)}/tokens/${encodeURIComponent(
      purchase.purchaseToken,
    )}:acknowledge`,
    "POST",
  );
  if (!response.ok) throw providerError();
}

/** Stops renewal; the buyer keeps the plan to the end of the paid period. */
export async function cancelGooglePlaySubscription(
  env: Bindings,
  productId: string,
  purchaseToken: string,
): Promise<void> {
  const response = await callGooglePlay(
    env,
    `subscriptions/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(
      purchaseToken,
    )}:cancel`,
    "POST",
  );
  if (!response.ok) throw providerError();
}

/**
 * The value the app sets as Play Billing's `obfuscatedAccountId` when it launches a purchase,
 * and that every verified purchase must carry: hex SHA-256 of `zoption:google-play:<user id>`,
 * the Supabase user id of the person paying. It names the payer without exposing their id.
 */
export async function googlePlayAccountId(userId: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`zoption:google-play:${userId}`),
  );
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Play states to Zoption's; `pending` is a first payment Play has not taken yet. */
export function normalizeGooglePlayState(
  state: string,
): { status: BillingSubscriptionStatus; cancelAtPeriodEnd: boolean } | "pending" | null {
  switch (state) {
    // Google asks apps to keep access through the grace period; its expiry already covers it.
    case "SUBSCRIPTION_STATE_ACTIVE":
    case "SUBSCRIPTION_STATE_IN_GRACE_PERIOD":
      return { status: "active", cancelAtPeriodEnd: false };
    case "SUBSCRIPTION_STATE_ON_HOLD":
      return { status: "past_due", cancelAtPeriodEnd: false };
    case "SUBSCRIPTION_STATE_PAUSED":
      return { status: "paused", cancelAtPeriodEnd: false };
    case "SUBSCRIPTION_STATE_CANCELED":
      return { status: "canceled", cancelAtPeriodEnd: true };
    case "SUBSCRIPTION_STATE_EXPIRED":
      return { status: "canceled", cancelAtPeriodEnd: false };
    case "SUBSCRIPTION_STATE_PENDING":
      return "pending";
    default:
      return null;
  }
}

/** A purchase as the row `applySubscriptionUpdate` stores, read now from Google. */
export function googlePlaySnapshot(
  env: Bindings,
  purchase: GooglePlayPurchase,
  now = new Date(),
): BillingSubscriptionSnapshot {
  const state = normalizeGooglePlayState(purchase.state);
  const providerPlanId = `${purchase.productId}:${purchase.basePlanId}`;
  const interval: BillingInterval | null =
    configuredPlan(env, "google_play", providerPlanId)?.interval ?? null;
  if (state === null || state === "pending" || !interval) throw providerError();
  return {
    provider: "google_play",
    // Reads are ordered by when they were made; the id only breaks a tie.
    providerUpdateId: `play:${purchase.latestOrderId ?? ""}:${purchase.state}:${purchase.expiresAt ?? ""}`,
    occurredAt: now.toISOString(),
    providerSubscriptionId: purchase.purchaseToken,
    providerCustomerId: null,
    providerProductId: purchase.productId,
    providerPlanId,
    providerStatus: purchase.state,
    status: state.status,
    interval,
    currentPeriodEndsAt: purchase.expiresAt,
    scheduledChangeAt: null,
    cancelAtPeriodEnd: state.cancelAtPeriodEnd,
    checkoutReference: null,
  };
}
