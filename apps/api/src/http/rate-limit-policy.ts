import type { Context, MiddlewareHandler } from "hono";

import type { RateLimitPolicy, RateLimiter } from "../rate-limit";
import type { AppEnvironment } from "../types";

const MINUTE = 60;
const QUARTER_HOUR = 15 * 60;
const DAY = 24 * 60 * 60;
const WRITE_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);
const ASSISTANT_THREAD_MESSAGES = /^\/api\/app\/assistant\/threads\/[^/]+\/messages$/;
// Public callers are keyed by client IP. Without the header they all share one bucket.
const MISSING_CLIENT_IP = "missing-cf-connecting-ip";

export const SUPPORT_CHAT_RATE_LIMITS = [
  { scope: "public-support-minute", limit: 8, windowSeconds: MINUTE },
  { scope: "public-support-day", limit: 40, windowSeconds: DAY },
] as const;

/**
 * Consume every rate limit policy in parallel and apply the standard headers.
 * Returns a 429 response when any policy rejects, otherwise null. On success the
 * headers reflect the last policy; on rejection they reflect the rejecting policy.
 */
async function enforceRateLimits(
  context: Context<AppEnvironment>,
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

function byTenant(...policies: RateLimitPolicy[]): AppRateLimit {
  return { identity: "tenant", policies };
}

function byUser(...policies: RateLimitPolicy[]): AppRateLimit {
  return { identity: "user", policies };
}

/**
 * The policies for an authenticated `/api/app/*` request; the first matching branch wins. Account
 * deletion and platform admin routes skip tenant resolution, so they are keyed by the signed-in
 * user instead of the tenant.
 */
export function appRateLimitFor(method: string, path: string): AppRateLimit {
  // Every pooled AI path keeps only its per-minute burst cap: a per-day cap would sit below
  // the monthly pool and reject a Pro tenant that has units left. The monthly pool is the cap.
  if (method === "POST") {
    switch (path) {
      case "/api/app/assistant/voice/transcriptions":
        return byTenant({
          scope: "tenant-assistant-voice-transcription-minute",
          limit: 6,
          windowSeconds: MINUTE,
        });
      case "/api/app/assistant/voice/speech":
      case "/api/app/assistant/voice/preview":
        return byTenant({
          scope: "tenant-assistant-voice-speech-minute",
          limit: 12,
          windowSeconds: MINUTE,
        });
      case "/api/app/receipts/extract":
        return byTenant({
          scope: "tenant-receipt-extraction-minute",
          limit: 6,
          windowSeconds: MINUTE,
        });
      case "/api/app/entry/voice":
        return byTenant({ scope: "tenant-entry-voice-minute", limit: 6, windowSeconds: MINUTE });
      case "/api/app/entry/pdf-preview":
        return byTenant({ scope: "tenant-entry-pdf-minute", limit: 3, windowSeconds: MINUTE });
    }
  }

  if (method === "DELETE" && path === "/api/app/account") {
    return byUser({ scope: "user-account-deletion", limit: 5, windowSeconds: QUARTER_HOUR });
  }
  if (path.startsWith("/api/app/admin/")) {
    if (WRITE_METHODS.has(method)) {
      return byUser({ scope: "platform-admin-seat-write", limit: 20, windowSeconds: QUARTER_HOUR });
    }
    return byUser({ scope: "platform-admin-seat-read", limit: 60, windowSeconds: MINUTE });
  }

  if (method === "POST" && path === "/api/app/support/chat") {
    return byTenant(
      { scope: "tenant-support-minute", limit: 10, windowSeconds: MINUTE },
      { scope: "tenant-support-day", limit: 100, windowSeconds: DAY },
    );
  }
  if (
    method === "POST" &&
    (path === "/api/app/assistant/threads" || ASSISTANT_THREAD_MESSAGES.test(path))
  ) {
    return byTenant({ scope: "tenant-assistant-minute", limit: 10, windowSeconds: MINUTE });
  }

  if (method === "GET" && path.startsWith("/api/app/exports")) {
    return byTenant({ scope: "tenant-export-read", limit: 20, windowSeconds: MINUTE });
  }
  if (method === "GET" && path.startsWith("/api/app/assistant/threads")) {
    return byTenant({ scope: "tenant-assistant-read", limit: 60, windowSeconds: MINUTE });
  }

  if (WRITE_METHODS.has(method)) {
    if (path.startsWith("/api/app/imports")) {
      return byTenant({ scope: "tenant-import", limit: 20, windowSeconds: QUARTER_HOUR });
    }
    return byTenant({ scope: "tenant-write", limit: 60, windowSeconds: MINUTE });
  }
  if (method === "GET") {
    return byTenant({ scope: "tenant-read", limit: 120, windowSeconds: MINUTE });
  }
  return byTenant();
}

export function billingWebhookRateLimits(provider: string): RateLimitPolicy[] {
  return [{ scope: `${provider}-webhook`, limit: 60, windowSeconds: MINUTE }];
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
    const clientIdentifier = context.req.header("CF-Connecting-IP")?.trim() || MISSING_CLIENT_IP;
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

    const clientIdentifier = context.req.header("CF-Connecting-IP")?.trim() || MISSING_CLIENT_IP;
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
