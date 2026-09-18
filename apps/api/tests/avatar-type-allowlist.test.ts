import { describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app";
import type { AuthVerifier } from "../src/auth";
import {
  createAvatarPath,
  hasAvatarImageSignature,
  isAllowedAvatarType,
  servePublicAvatar,
} from "../src/avatars";
import type { TenantResolver } from "../src/db/tenants";
import type { RateLimiter } from "../src/rate-limit";
import type { Bindings } from "../src/types";

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);
const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const WEBP_BYTES = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
]);

function createMemoryR2() {
  const objects = new Map<string, ArrayBuffer>();
  const bucket = {
    async put(key: string, value: ArrayBuffer) {
      objects.set(key, value);
    },
    async get(key: string) {
      return objects.has(key)
        ? { body: new Response("stored").body, httpMetadata: { contentType: "image/png" } }
        : null;
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

describe("avatar MIME allowlist", () => {
  it("accepts only the declared image types", () => {
    expect(isAllowedAvatarType("image/jpeg")).toBe(true);
    expect(isAllowedAvatarType("image/png")).toBe(true);
    expect(isAllowedAvatarType("image/webp")).toBe(true);
    expect(isAllowedAvatarType("image/gif")).toBe(false);
    expect(isAllowedAvatarType("image/svg+xml")).toBe(false);
  });

  it("rejects Object prototype property names", () => {
    for (const value of ["constructor", "toString", "__proto__", "hasOwnProperty", "valueOf"]) {
      expect(isAllowedAvatarType(value)).toBe(false);
      expect(() => createAvatarPath("user-1", value)).toThrow("Choose a JPEG, PNG, or WebP image.");
    }
  });
});

describe("avatar file signatures", () => {
  it("accepts declared types that match the stored bytes", () => {
    expect(hasAvatarImageSignature("image/jpeg", JPEG_BYTES)).toBe(true);
    expect(hasAvatarImageSignature("image/png", PNG_BYTES)).toBe(true);
    expect(hasAvatarImageSignature("image/webp", WEBP_BYTES)).toBe(true);
  });

  it("rejects mislabelled, truncated, or unknown uploads", () => {
    expect(hasAvatarImageSignature("image/png", JPEG_BYTES)).toBe(false);
    expect(hasAvatarImageSignature("image/jpeg", PNG_BYTES)).toBe(false);
    expect(hasAvatarImageSignature("image/webp", PNG_BYTES)).toBe(false);
    expect(hasAvatarImageSignature("image/png", new TextEncoder().encode("png-bytes"))).toBe(false);
    expect(hasAvatarImageSignature("image/png", new Uint8Array([0x89, 0x50]))).toBe(false);
    expect(hasAvatarImageSignature("image/gif", PNG_BYTES)).toBe(false);
  });

  it("refuses to store a file whose bytes do not match its declared type", async () => {
    const app = createAppWithAuth();
    const { objects, bucket } = createMemoryR2();
    const form = new FormData();
    form.set("file", new File(["not an image"], "avatar.png", { type: "image/png" }));

    const rejected = await app.request(
      "/api/app/profile/avatar",
      { method: "POST", headers: { Authorization: "Bearer valid-token" }, body: form },
      { AVATARS: bucket } as Bindings,
    );
    expect(rejected.status).toBe(400);
    expect(objects.size).toBe(0);

    const acceptedForm = new FormData();
    acceptedForm.set("file", new File([PNG_BYTES], "avatar.png", { type: "image/png" }));
    const accepted = await app.request(
      "/api/app/profile/avatar",
      { method: "POST", headers: { Authorization: "Bearer valid-token" }, body: acceptedForm },
      { AVATARS: bucket } as Bindings,
    );
    expect(accepted.status).toBe(201);
    expect(objects.size).toBe(1);
  });
});

describe("avatar cache lifetime", () => {
  it("serves stored pictures with revalidation instead of a year-long immutable cache", async () => {
    const { bucket } = createMemoryR2();
    const path = "user-1/11111111-1111-4111-8111-111111111111.png";
    await bucket.put(`avatars/${path}`, PNG_BYTES);

    const served = await servePublicAvatar({ AVATARS: bucket }, path);
    expect(served.status).toBe(200);
    expect(served.headers.get("Cache-Control")).toBe("public, max-age=60, must-revalidate");
  });

  it("reads the private Supabase bucket with the service role", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("legacy", { headers: { "Content-Type": "image/jpeg" } }));

    const served = await servePublicAvatar(
      {
        SUPABASE_URL: "https://example.supabase.co/",
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

  it("does not fall back to a public object URL without the service role", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const served = await servePublicAvatar(
      { SUPABASE_URL: "https://example.supabase.co" },
      "user-1/11111111-1111-4111-8111-111111111111.jpg",
    );
    expect(served.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockRestore();
  });
});
