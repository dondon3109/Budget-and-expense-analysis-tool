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

async function hashClientIdentifier(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export const d1RateLimiter: RateLimiter = {
  async consume(env, clientIdentifier, policy) {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const windowStart = Math.floor(nowSeconds / policy.windowSeconds) * policy.windowSeconds;
    const retryAfterSeconds = Math.max(1, windowStart + policy.windowSeconds - nowSeconds);
    const clientHash = await hashClientIdentifier(clientIdentifier);
    const id = `${policy.scope}:${clientHash}:${windowStart}`;
    const expiresAt = new Date((windowStart + policy.windowSeconds * 2) * 1000).toISOString();

    const row = await env.DB.prepare(
      `INSERT INTO rate_limits (id, scope, client_hash, window_start, count, expires_at)
       VALUES (?, ?, ?, ?, 1, ?)
       ON CONFLICT(id) DO UPDATE SET count = count + 1
       RETURNING count`,
    )
      .bind(id, policy.scope, clientHash, windowStart, expiresAt)
      .first<{ count: number }>();

    if (!row) throw new Error("The rate limit counter could not be updated.");
    if (row.count === 1) {
      await env.DB.prepare("DELETE FROM rate_limits WHERE expires_at < ?")
        .bind(new Date(nowSeconds * 1000).toISOString())
        .run();
    }

    return {
      allowed: row.count <= policy.limit,
      limit: policy.limit,
      remaining: Math.max(0, policy.limit - row.count),
      retryAfterSeconds,
    };
  },
};
