import { DurableObject } from "cloudflare:workers";

import { isRateLimitPolicy, nextRateLimitState, type RateLimitEntry } from "./rate-limit";

export class RateLimitDurableObject extends DurableObject {
  override async fetch(request: Request): Promise<Response> {
    if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });

    const policy: unknown = await request.json();
    if (!isRateLimitPolicy(policy)) {
      return new Response("Invalid rate limit policy", { status: 400 });
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    const preview = nextRateLimitState(undefined, policy, nowSeconds);
    const current = await this.ctx.storage.get<RateLimitEntry>(preview.key);
    const next = nextRateLimitState(current, policy, nowSeconds);
    await this.ctx.storage.put(next.key, next.entry);
    await this.ctx.storage.setAlarm(next.entry.expiresAtSeconds * 1000);
    return Response.json(next.decision);
  }

  override async alarm(): Promise<void> {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const entries = await this.ctx.storage.list<RateLimitEntry>();
    const expired: string[] = [];
    for (const [key, value] of entries) {
      if (value.expiresAtSeconds <= nowSeconds) expired.push(key);
    }
    if (expired.length > 0) await this.ctx.storage.delete(expired);
  }
}
