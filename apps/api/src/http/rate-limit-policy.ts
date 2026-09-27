import type { Context, MiddlewareHandler } from "hono";

import type { RateLimitPolicy, RateLimiter } from "../rate-limit";
import type { AppEnvironment } from "../types";

const WRITE_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);
export const SUPPORT_CHAT_RATE_LIMITS = [
  { scope: "public-support-minute", limit: 8, windowSeconds: 60 },
  { scope: "public-support-day", limit: 40, windowSeconds: 24 * 60 * 60 },
] as const;
const MISSING_BILLING_WEBHOOK_CLIENT = "missing-cf-connecting-ip";
const MISSING_SUPPORT_CLIENT = "missing-cf-connecting-ip";

/**
 * Consume every rate limit policy in parallel and apply the standard headers.
 * Returns a 429 response when any policy rejects, otherwise null. On success the
 * headers reflect the last policy; on rejection they reflect the rejecting policy.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Hono's middleware narrows the context input type beyond what a shared helper can express.
async function enforceRateLimits<Path extends string, Input extends Record<string, unknown> = any>(
  context: Context<AppEnvironment, Path, Input>,
  rateLimiter: RateLimiter,
  identity: string,
  policies: RateLimitPolicy[],
  tooManyMessage: (retryAfterSeconds: number) => string,
): Promise<Response | null> {
  const decisions = await Promise.all(
    policies.map((policy) => rateLimiter.consume(context.env, identity, policy)),
  );
  const rejected = decisions.find((decision) => !decision.allowed);
  const applied = rejected ?? decisions[decisions.length - 1]!;
  const isWebSocket = context.req.header("Upgrade")?.toLowerCase() === "websocket";
  if (!isWebSocket) {
    context.header("RateLimit-Limit", String(applied.limit));
    context.header("RateLimit-Remaining", String(applied.remaining));
    context.header("RateLimit-Reset", String(applied.retryAfterSeconds));
  }
  if (rejected) {
    if (!isWebSocket) context.header("Retry-After", String(rejected.retryAfterSeconds));
    return context.json(
      { error: "rate_limit_exceeded", message: tooManyMessage(rejected.retryAfterSeconds) },
      429,
    );
  }
  return null;
}

/** Whose budget a limited `/api/app/*` request draws from. */
export type RateLimitIdentity = "user" | "tenant";

export interface AppRateLimit {
  identity: RateLimitIdentity;
  policies: RateLimitPolicy[];
}

/**
 * The policies for an authenticated `/api/app/*` request. Account deletion and platform admin
 * routes skip tenant resolution, so they are keyed by the signed-in user instead of the tenant.
 */
export function appRateLimitFor(method: string, path: string): AppRateLimit {
  const isAccountDeletion = method === "DELETE" && path === "/api/app/account";
  const isPlatformAdminRoute = path.startsWith("/api/app/admin/");
  const isAssistantGeneration =
    method === "POST" &&
    (path === "/api/app/assistant/threads" ||
      /^\/api\/app\/assistant\/threads\/[^/]+\/messages$/.test(path));
  const isSupportGeneration = method === "POST" && path === "/api/app/support/chat";
  const isVoiceTranscription =
    method === "POST" && path === "/api/app/assistant/voice/transcriptions";
  const isVoiceSpeech =
    method === "POST" &&
    (path === "/api/app/assistant/voice/speech" || path === "/api/app/assistant/voice/preview");
  const isReceiptExtraction = method === "POST" && path === "/api/app/receipts/extract";
  const isAiEntryVoice = method === "POST" && path === "/api/app/entry/voice";
  const isAiEntryPdf = method === "POST" && path === "/api/app/entry/pdf-preview";
  const isExportRead = method === "GET" && path.startsWith("/api/app/exports");
  const isAssistantHistoryRead = method === "GET" && path.startsWith("/api/app/assistant/threads");
  // Every pooled AI path keeps only its per-minute burst cap: a per-day cap would sit below
  // the monthly pool and reject a Pro tenant that has units left. The monthly pool is the cap.
  const policies = isVoiceTranscription
    ? [{ scope: "tenant-assistant-voice-transcription-minute", limit: 6, windowSeconds: 60 }]
    : isVoiceSpeech
      ? [{ scope: "tenant-assistant-voice-speech-minute", limit: 12, windowSeconds: 60 }]
      : isReceiptExtraction
        ? [{ scope: "tenant-receipt-extraction-minute", limit: 6, windowSeconds: 60 }]
        : isAiEntryVoice
          ? [{ scope: "tenant-entry-voice-minute", limit: 6, windowSeconds: 60 }]
          : isAiEntryPdf
            ? [{ scope: "tenant-entry-pdf-minute", limit: 3, windowSeconds: 60 }]
            : isAccountDeletion
              ? [{ scope: "user-account-deletion", limit: 5, windowSeconds: 15 * 60 }]
              : isPlatformAdminRoute && WRITE_METHODS.has(method)
                ? [{ scope: "platform-admin-seat-write", limit: 20, windowSeconds: 15 * 60 }]
                : isPlatformAdminRoute
                  ? [{ scope: "platform-admin-seat-read", limit: 60, windowSeconds: 60 }]
                  : isSupportGeneration
                    ? [
                        { scope: "tenant-support-minute", limit: 10, windowSeconds: 60 },
                        { scope: "tenant-support-day", limit: 100, windowSeconds: 24 * 60 * 60 },
                      ]
                    : isAssistantGeneration
                      ? [{ scope: "tenant-assistant-minute", limit: 10, windowSeconds: 60 }]
                      : isExportRead
                        ? [{ scope: "tenant-export-read", limit: 20, windowSeconds: 60 }]
                        : isAssistantHistoryRead
                          ? [{ scope: "tenant-assistant-read", limit: 60, windowSeconds: 60 }]
                          : WRITE_METHODS.has(method)
                            ? [
                                path.startsWith("/api/app/imports")
                                  ? { scope: "tenant-import", limit: 20, windowSeconds: 15 * 60 }
                                  : { scope: "tenant-write", limit: 60, windowSeconds: 60 },
                              ]
                            : method === "GET"
                              ? [{ scope: "tenant-read", limit: 120, windowSeconds: 60 }]
                              : [];

  const identity = isAccountDeletion || isPlatformAdminRoute ? "user" : "tenant";
  return { identity, policies };
}

export function billingWebhookRateLimits(provider: string): RateLimitPolicy[] {
  return [{ scope: `${provider}-webhook`, limit: 60, windowSeconds: 60 }];
}

/** Public support chat, keyed by client IP because the caller is not signed in. */
export function createSupportRateLimit(
  rateLimiter: RateLimiter,
): MiddlewareHandler<AppEnvironment> {
  return async (context, next) => {
    if (context.req.method !== "POST") {
      await next();
      return;
    }
    const clientIdentifier =
      context.req.header("CF-Connecting-IP")?.trim() || MISSING_SUPPORT_CLIENT;
    const limited = await enforceRateLimits(
      context,
      rateLimiter,
      clientIdentifier,
      [...SUPPORT_CHAT_RATE_LIMITS],
      (seconds) => `Too many support messages. Try again in ${seconds} seconds.`,
    );
    if (limited) return limited;
    await next();
  };
}

/** Authenticated `/api/app/*` limits; runs after the auth middleware has set the identity. */
export function createAppRateLimit(rateLimiter: RateLimiter): MiddlewareHandler<AppEnvironment> {
  return async (context, next) => {
    const { identity, policies } = appRateLimitFor(context.req.method, context.req.path);

    if (policies.length === 0) {
      await next();
      return;
    }

    const rateLimitIdentity =
      identity === "user" ? context.get("authUser").id : context.get("tenant").tenantId;

    const limited = await enforceRateLimits(
      context,
      rateLimiter,
      rateLimitIdentity,
      policies,
      (seconds) => `Too many requests. Try again in ${seconds} seconds.`,
    );
    if (limited) return limited;

    await next();
  };
}

/** Billing provider webhooks, keyed by client IP; the route verifies the provider signature. */
export function createBillingWebhookRateLimit(
  rateLimiter: RateLimiter,
  provider: string,
): MiddlewareHandler<AppEnvironment> {
  return async (context, next) => {
    if (context.req.method !== "POST") {
      await next();
      return;
    }

    const clientIdentifier =
      context.req.header("CF-Connecting-IP")?.trim() || MISSING_BILLING_WEBHOOK_CLIENT;
    const limited = await enforceRateLimits(
      context,
      rateLimiter,
      clientIdentifier,
      billingWebhookRateLimits(provider),
      (seconds) => `Too many webhook deliveries. Try again in ${seconds} seconds.`,
    );
    if (limited) return limited;

    await next();
  };
}
