import { vi } from "vitest";

import type { RateLimiter } from "../../src/rate-limit";

/** A rate limiter that allows every request, with a spy to assert on the consumed policies. */
export function allowedRateLimiter(): RateLimiter {
  return {
    consume: vi.fn(async () => ({
      allowed: true,
      limit: 60,
      remaining: 59,
      retryAfterSeconds: 60,
    })),
  };
}
