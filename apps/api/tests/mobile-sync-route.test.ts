import { describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app";
import type { AuthVerifier } from "../src/auth";
import type { MobileSyncRepository } from "../src/db/mobile-sync";
import type { TenantResolver } from "../src/db/tenants";
import type { RateLimiter } from "../src/rate-limit";

describe("mobile sync route", () => {
  it("derives the tenant and rejects ownership fields", async () => {
    const pull = vi.fn(async () => ({
      protocolVersion: 1 as const,
      changes: [],
      nextCursor: "v1.0",
      hasMore: false,
    }));
    const push = vi.fn(async () => ({
      protocolVersion: 1 as const,
      results: [
        {
          operationId: "00000000-0000-4000-8000-000000000003",
          entityType: "transaction" as const,
          entityId: "00000000-0000-4000-8000-000000000002",
          status: "acknowledged" as const,
          revision: 1,
        },
      ],
    }));
    const acknowledge = vi.fn(async () => ({
      protocolVersion: 1 as const,
      acknowledgedCursor: "v1.3",
      retentionFloorCursor: "v1.0",
    }));
    const snapshot = vi.fn(async () => ({
      protocolVersion: 1 as const,
      snapshotCursor: "s1.3",
      changes: [],
      nextOffset: 0,
      hasMore: false,
      resumeCursor: "v1.3",
    }));
    const mobileSync: MobileSyncRepository = {
      acknowledge,
      pull,
      push,
      snapshot,
    };
    const authVerifier: AuthVerifier = {
      verify: vi.fn(async () => ({ id: "user-1", role: "authenticated" })),
    };
    const tenantResolver: TenantResolver = {
      resolve: vi.fn(async () => ({
        tenantId: "tenant-safe",
        defaultAccountId: "default",
        onboardingComplete: true,
      })),
    };
    const rateLimiter: RateLimiter = {
      consume: vi.fn(async () => ({
        allowed: true,
        limit: 60,
        remaining: 59,
        retryAfterSeconds: 60,
      })),
    };
    const app = createApp({
      mobileSync,
      authVerifier,
      tenantResolver,
      rateLimiter,
      readinessCheck: vi.fn(async () => undefined),
    });
    const headers = { Authorization: "Bearer valid", "Content-Type": "application/json" };

    const valid = await app.request("/api/app/sync/pull", {
      method: "POST",
      headers,
      body: JSON.stringify({ protocolVersion: 1, cursor: null, limit: 10 }),
    });
    expect(valid.status).toBe(200);
    expect(pull).toHaveBeenCalledWith(undefined, "tenant-safe", {
      protocolVersion: 1,
      cursor: null,
      limit: 10,
    });

    const forged = await app.request("/api/app/sync/pull", {
      method: "POST",
      headers,
      body: JSON.stringify({ protocolVersion: 1, tenantId: "tenant-other" }),
    });
    expect(forged.status).toBe(400);
    expect(pull).toHaveBeenCalledTimes(1);

    const acknowledged = await app.request("/api/app/sync/acknowledge", {
      method: "POST",
      headers,
      body: JSON.stringify({
        protocolVersion: 1,
        clientId: "00000000-0000-4000-8000-000000000001",
        cursor: "v1.3",
      }),
    });
    expect(acknowledged.status).toBe(200);
    expect(acknowledge).toHaveBeenCalledWith(undefined, "tenant-safe", {
      protocolVersion: 1,
      clientId: "00000000-0000-4000-8000-000000000001",
      cursor: "v1.3",
    });

    const forgedAcknowledgement = await app.request("/api/app/sync/acknowledge", {
      method: "POST",
      headers,
      body: JSON.stringify({
        protocolVersion: 1,
        clientId: "00000000-0000-4000-8000-000000000001",
        cursor: "v1.3",
        tenantId: "tenant-other",
      }),
    });
    expect(forgedAcknowledgement.status).toBe(400);
    expect(acknowledge).toHaveBeenCalledTimes(1);

    const snapshotted = await app.request("/api/app/sync/snapshot", {
      method: "POST",
      headers,
      body: JSON.stringify({
        protocolVersion: 1,
        clientId: "00000000-0000-4000-8000-000000000001",
        snapshotCursor: null,
        offset: 0,
        limit: 10,
      }),
    });
    expect(snapshotted.status).toBe(200);
    expect(snapshot).toHaveBeenCalledWith(undefined, "tenant-safe", {
      protocolVersion: 1,
      clientId: "00000000-0000-4000-8000-000000000001",
      snapshotCursor: null,
      offset: 0,
      limit: 10,
    });

    const pushed = await app.request("/api/app/sync/push", {
      method: "POST",
      headers,
      body: JSON.stringify({
        protocolVersion: 1,
        clientId: "00000000-0000-4000-8000-000000000001",
        operations: [
          {
            operationId: "00000000-0000-4000-8000-000000000003",
            idempotencyKey: "00000000-0000-4000-8000-000000000004",
            entityType: "transaction",
            entityId: "00000000-0000-4000-8000-000000000002",
            operationType: "delete",
            baseRevision: 1,
            dependencyIds: [],
            payload: {},
          },
        ],
      }),
    });
    expect(pushed.status).toBe(200);
    expect(push).toHaveBeenCalledWith(undefined, "tenant-safe", expect.any(Object));

    const forgedPush = await app.request("/api/app/sync/push", {
      method: "POST",
      headers,
      body: JSON.stringify({
        protocolVersion: 1,
        clientId: "00000000-0000-4000-8000-000000000001",
        tenantId: "tenant-other",
        operations: [],
      }),
    });
    expect(forgedPush.status).toBe(400);
    expect(push).toHaveBeenCalledTimes(1);
  });
});
