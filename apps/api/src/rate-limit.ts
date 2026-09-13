import type { Bindings } from "./types";

export interface RateLimitPolicy {
  scope: string;
  limit: number;
  windowSeconds: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
}

export interface RateLimiter {
  consume(
    env: Bindings,
    clientIdentifier: string,
    policy: RateLimitPolicy,
  ): Promise<RateLimitDecision>;
}

export function isRateLimitPolicy(value: unknown): value is RateLimitPolicy {
  if (typeof value !== "object" || value === null) return false;
  if (!("scope" in value) || typeof value.scope !== "string" || !value.scope) return false;
  if (
    !("limit" in value) ||
    typeof value.limit !== "number" ||
    !Number.isInteger(value.limit) ||
    value.limit < 1
  ) {
    return false;
  }
  if (
    !("windowSeconds" in value) ||
    typeof value.windowSeconds !== "number" ||
    !Number.isInteger(value.windowSeconds) ||
    value.windowSeconds < 1
  ) {
    return false;
  }
  return true;
}

function isRateLimitDecision(value: unknown): value is RateLimitDecision {
  if (typeof value !== "object" || value === null) return false;
  return (
    "allowed" in value &&
    typeof value.allowed === "boolean" &&
    "limit" in value &&
    typeof value.limit === "number" &&
    "remaining" in value &&
    typeof value.remaining === "number" &&
    "retryAfterSeconds" in value &&
    typeof value.retryAfterSeconds === "number"
  );
}

export interface RateLimitEntry {
  count: number;
  expiresAtSeconds: number;
}

async function hashClientIdentifier(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function rateLimitWindowStart(nowSeconds: number, windowSeconds: number): number {
  return Math.floor(nowSeconds / windowSeconds) * windowSeconds;
}

export function nextRateLimitState(
  current: RateLimitEntry | undefined,
  policy: RateLimitPolicy,
  nowSeconds: number,
): { key: string; entry: RateLimitEntry; decision: RateLimitDecision } {
  const windowStart = rateLimitWindowStart(nowSeconds, policy.windowSeconds);
  const retryAfterSeconds = Math.max(1, windowStart + policy.windowSeconds - nowSeconds);
  const count = current?.count ? current.count + 1 : 1;
  return {
    key: `${policy.scope}:${windowStart}`,
    entry: {
      count,
      expiresAtSeconds: windowStart + policy.windowSeconds * 2,
    },
    decision: {
      allowed: count <= policy.limit,
      limit: policy.limit,
      remaining: Math.max(0, policy.limit - count),
      retryAfterSeconds,
    },
  };
}

export const d1RateLimiter: RateLimiter = {
  async consume(env, clientIdentifier, policy) {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const windowStart = rateLimitWindowStart(nowSeconds, policy.windowSeconds);
    const retryAfterSeconds = Math.max(1, windowStart + policy.windowSeconds - nowSeconds);
    const clientHash = await hashClientIdentifier(clientIdentifier);
    const id = `${policy.scope}:${clientHash}:${windowStart}`;
    const expiresAt = new Date((windowStart + policy.windowSeconds * 2) * 1000).toISOString();

    // Expired rows are removed by the maintenance cron (deleteExpiredRateLimits),
    // never on the request path.
    const row = await env.DB.prepare(
      `INSERT INTO rate_limits (id, scope, client_hash, window_start, count, expires_at)
       VALUES (?, ?, ?, ?, 1, ?)
       ON CONFLICT(id) DO UPDATE SET count = count + 1
       RETURNING count`,
    )
      .bind(id, policy.scope, clientHash, windowStart, expiresAt)
      .first<{ count: number }>();

    if (!row) throw new Error("The rate limit counter could not be updated.");

    return {
      allowed: row.count <= policy.limit,
      limit: policy.limit,
      remaining: Math.max(0, policy.limit - row.count),
      retryAfterSeconds,
    };
  },
};

export const durableRateLimiter: RateLimiter = {
  async consume(env, clientIdentifier, policy) {
    const namespace = env.RATE_LIMIT;
    if (!namespace) return d1RateLimiter.consume(env, clientIdentifier, policy);
    const id = namespace.idFromName(await hashClientIdentifier(clientIdentifier));
    const stub = namespace.get(id);
    const response = await stub.fetch("https://rate-limit/consume", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(policy),
    });
    if (!response.ok) throw new Error("The rate limit counter could not be updated.");
    const decision: unknown = await response.json();
    if (!isRateLimitDecision(decision)) {
      throw new Error("The rate limit counter could not be updated.");
    }
    return decision;
  },
};

/** Uses a Durable Object when bound, otherwise the D1 fallback. */
export const boundRateLimiter: RateLimiter = {
  consume(env, clientIdentifier, policy) {
    return env.RATE_LIMIT
      ? durableRateLimiter.consume(env, clientIdentifier, policy)
      : d1RateLimiter.consume(env, clientIdentifier, policy);
  },
};

/** Maintenance entry point: delete counters whose window has fully expired. */
export async function deleteExpiredRateLimits(env: Bindings): Promise<number> {
  const result = await env.DB.prepare("DELETE FROM rate_limits WHERE expires_at < ?")
    .bind(new Date().toISOString())
    .run();
  return result.meta.changes ?? 0;
}
