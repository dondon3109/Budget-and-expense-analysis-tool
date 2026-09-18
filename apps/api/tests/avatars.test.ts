import { describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app";
import {
  avatarObjectKey,
  parseAvatarPath,
  purgeUserAvatars,
  servePublicAvatar,
} from "../src/avatars";
import type { AuthVerifier } from "../src/auth";
import type { TenantResolver } from "../src/db/tenants";
import type { RateLimiter } from "../src/rate-limit";
import type { Bindings } from "../src/types";

function createMemoryR2() {
  const objects = new Map<string, { body: ArrayBuffer; contentType: string }>();
  const bucket = {
    async put(
      key: string,
      value: ArrayBuffer,
      options?: { httpMetadata?: { contentType?: string } },
    ) {
      objects.set(key, {
        body: value,
        contentType: options?.httpMetadata?.contentType ?? "application/octet-stream",
      });
    },
    async get(key: string) {
      const stored = objects.get(key);
      if (!stored) return null;
      return {
        body: stored.body,
        httpMetadata: { contentType: stored.contentType },
      };
    },
    async delete(key: string) {
      objects.delete(key);
    },
    async list({ prefix }: { prefix: string }) {
      const keys = [...objects.keys()].filter((key) => key.startsWith(prefix));
      return { objects: keys.map((key) => ({ key })), truncated: false };
    },
  } as unknown as R2Bucket;
  return { objects, bucket };
}

function createAppWithAuth() {
  const authVerifier: AuthVerifier = {
    verify: vi.fn(async (_env, token) => {
      if (token !== "valid-token") throw new Error("invalid token");
      return { id: "user-1", email: "person@example.com", role: "authenticated" };
    }),
  };
  const tenantResolver: TenantResolver = {
    resolve: vi.fn(async () => ({
      tenantId: "user:user-1",
      defaultAccountId: "user:user-1:account:default",
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
  return createApp({
    readinessCheck: vi.fn().mockResolvedValue(undefined),
    authVerifier,
    tenantResolver,
    rateLimiter,
  });
}

describe("avatar path parsing", () => {
  it("accepts owner-scoped JPEG, PNG, and WebP object names", () => {
    expect(parseAvatarPath("user-1/11111111-1111-4111-8111-111111111111.png")).toBe(
      "user-1/11111111-1111-4111-8111-111111111111.png",
    );
    expect(parseAvatarPath("user-1/../secret.png")).toBeUndefined();
    expect(parseAvatarPath("user-1/photo.svg")).toBeUndefined();
  });
});

describe("R2 avatar storage", () => {
  it("stores, serves, and purges objects under the avatars prefix", async () => {
    const { objects, bucket } = createMemoryR2();
    const path = "user-1/11111111-1111-4111-8111-111111111111.png";
    const bytes = new TextEncoder().encode("png-bytes").buffer;
    await bucket.put(avatarObjectKey(path), bytes, { httpMetadata: { contentType: "image/png" } });

    const served = await servePublicAvatar({ AVATARS: bucket }, path);
    expect(served.status).toBe(200);
    expect(served.headers.get("Content-Type")).toBe("image/png");
    expect(served.headers.get("Cache-Control")).toBe("public, max-age=60, must-revalidate");

    await purgeUserAvatars(bucket, "user-1");
    expect(objects.size).toBe(0);
    const missing = await servePublicAvatar({ AVATARS: bucket }, path);
    expect(missing.status).toBe(404);
  });

  it("falls back to the private Supabase bucket when R2 has no copy", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("legacy", { headers: { "Content-Type": "image/jpeg" } }));
    const served = await servePublicAvatar(
      {
        SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
      },
      "user-1/11111111-1111-4111-8111-111111111111.jpg",
    );
    expect(served.status).toBe(200);
    expect(await served.text()).toBe("legacy");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.supabase.co/storage/v1/object/authenticated/avatars/user-1/11111111-1111-4111-8111-111111111111.jpg",
      { headers: { apikey: "service-role-key", Authorization: "Bearer service-role-key" } },
    );
    fetchMock.mockRestore();
  });
});

describe("authenticated avatar routes", () => {
  it("uploads an owned object and refuses to delete another user's file", async () => {
    const { objects, bucket } = createMemoryR2();
    const app = createAppWithAuth();
    const env = { AVATARS: bucket } as Bindings;
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
    const file = new File([pngBytes], "avatar.png", { type: "image/png" });
    const form = new FormData();
    form.set("file", file);

    const uploaded = await app.request(
      "/api/app/profile/avatar",
      { method: "POST", headers: { Authorization: "Bearer valid-token" }, body: form },
      env,
    );
    expect(uploaded.status).toBe(201);
    const payload = (await uploaded.json()) as { path: string };
    expect(payload.path).toMatch(/^user-1\/[a-zA-Z0-9-]+\.png$/);
    expect(objects.has(avatarObjectKey(payload.path))).toBe(true);

    const rejected = await app.request(
      "/api/app/profile/avatar",
      {
        method: "DELETE",
        headers: {
          Authorization: "Bearer valid-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ path: "someone-else/11111111-1111-4111-8111-111111111111.png" }),
      },
      env,
    );
    expect(rejected.status).toBe(400);

    const deleted = await app.request(
      "/api/app/profile/avatar",
      {
        method: "DELETE",
        headers: {
          Authorization: "Bearer valid-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ path: payload.path }),
      },
      env,
    );
    expect(deleted.status).toBe(204);
    expect(objects.has(avatarObjectKey(payload.path))).toBe(false);
  });
});
