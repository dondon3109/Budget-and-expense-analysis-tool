import { describe, expect, it, vi } from "vitest";

import type { RateLimiter } from "../src/rate-limit";
import {
  AUTHORIZATION,
  TENANT_ID,
  dashboardFixture,
  createTransactionStore,
  createImportStore,
  createAuthVerifier,
  createTenantResolver,
  createAccountDeletionService,
  createAppWithFakes,
  privateHeaders,
} from "./helpers/app-fakes";
import { allowedRateLimiter } from "./helpers/rate-limiter";

describe("API platform routes", () => {
  it("reports readiness", async () => {
    const app = createAppWithFakes();
    const response = await app.request("/health");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: "ok" });
  });

  it("names the serving Worker version when the deployment binds its metadata", async () => {
    const app = createAppWithFakes();
    const response = await app.request("/health", undefined, {
      DB: {} as D1Database,
      CF_VERSION_METADATA: { id: "version-b", tag: "v3.5.0", timestamp: "" },
    });
    await expect(response.json()).resolves.toMatchObject({ status: "ok", version: "version-b" });
  });

  it("returns authenticated public PayPal SDK configuration without exposing its secret", async () => {
    const app = createAppWithFakes();
    const response = await app.request(
      "/api/app/billing/checkout/config",
      { headers: AUTHORIZATION },
      {
        DB: {} as D1Database,
        PAYPAL_ENVIRONMENT: "sandbox",
        PAYPAL_CLIENT_ID: "public-client-id",
        PAYPAL_CLIENT_SECRET: "private-client-secret",
      },
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload).toEqual({
      provider: "paypal",
      clientId: "public-client-id",
      environment: "sandbox",
    });
    expect(JSON.stringify(payload)).not.toContain("private-client-secret");
  });

  it("does not expose the retired public dashboard", async () => {
    const loader = vi.fn().mockResolvedValue(dashboardFixture);
    const app = createAppWithFakes({ dashboardLoader: loader });
    const response = await app.request("/api/demo/dashboard?from=2026-07-01&to=2026-07-31");
    expect(response.status).toBe(404);
    expect(loader).not.toHaveBeenCalled();
  });

  it("requires authentication for private routes", async () => {
    const app = createAppWithFakes();
    const response = await app.request("/api/app/me");
    expect(response.status).toBe(401);
    expect(response.headers.get("WWW-Authenticate")).toContain("Bearer");
    await expect(response.json()).resolves.toEqual({ error: "authentication_required" });
  });

  it("rejects invalid bearer tokens before resolving a tenant", async () => {
    const tenantResolver = createTenantResolver();
    const app = createAppWithFakes({ tenantResolver });
    const response = await app.request("/api/app/me", {
      headers: { Authorization: "Bearer invalid-token" },
    });
    expect(response.status).toBe(401);
    expect(tenantResolver.resolve).not.toHaveBeenCalled();
  });

  it("returns the authenticated user and resolved tenant", async () => {
    const app = createAppWithFakes();
    const response = await app.request("/api/app/me", { headers: AUTHORIZATION });
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(response.headers.get("X-Frame-Options")).toBe("DENY");
    expect(response.headers.get("Strict-Transport-Security")).toBeNull();
    await expect(response.json()).resolves.toEqual({
      user: {
        id: "user-1",
        email: "person@example.com",
        role: "authenticated",
      },
      tenantId: TENANT_ID,
    });
  });

  it("deletes only the authenticated account without resolving or bootstrapping a tenant", async () => {
    const tenantResolver = createTenantResolver();
    const accountDeletionService = createAccountDeletionService();
    const app = createAppWithFakes({ tenantResolver, accountDeletionService });

    const response = await app.request("/api/app/account", {
      method: "DELETE",
      headers: privateHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ confirmation: "DELETE", password: "current-password" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "deleted" });
    expect(tenantResolver.resolve).not.toHaveBeenCalled();
    expect(accountDeletionService.deleteAccount).toHaveBeenCalledWith({
      env: undefined,
      user: { id: "user-1", email: "person@example.com", role: "authenticated" },
      accessToken: "valid-token",
      password: "current-password",
    });
  });

  it("validates deletion confirmation before invoking the deletion service", async () => {
    const accountDeletionService = createAccountDeletionService();
    const app = createAppWithFakes({ accountDeletionService });
    const response = await app.request("/api/app/account", {
      method: "DELETE",
      headers: privateHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ confirmation: "delete", password: "current-password" }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "invalid_request" });
    expect(accountDeletionService.deleteAccount).not.toHaveBeenCalled();
  });

  it("requires a JSON media type before parsing write requests", async () => {
    const transactions = createTransactionStore();
    const app = createAppWithFakes({ transactions });
    const response = await app.request("/api/app/transactions", {
      method: "POST",
      headers: AUTHORIZATION,
      body: JSON.stringify({
        date: "2026-07-18",
        description: "Groceries",
        amountMinor: 2_455,
        currency: "PHP",
        kind: "expense",
        categoryId: "food",
        accountId: "account-everyday",
      }),
    });

    expect(response.status).toBe(415);
    await expect(response.json()).resolves.toMatchObject({ error: "unsupported_media_type" });
    expect(transactions.create).not.toHaveBeenCalled();
  });

  it("rejects oversized JSON before reaching the route repository", async () => {
    const transactions = createTransactionStore();
    const app = createAppWithFakes({ transactions });
    const response = await app.request("/api/app/transactions", {
      method: "POST",
      headers: privateHeaders({
        "Content-Type": "application/json",
        "Content-Length": String(65 * 1024),
      }),
      body: "{}",
    });

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({ error: "payload_too_large" });
    expect(transactions.create).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON with a stable client error", async () => {
    const transactions = createTransactionStore();
    const app = createAppWithFakes({ transactions });
    const response = await app.request("/api/app/transactions", {
      method: "POST",
      headers: privateHeaders({ "Content-Type": "application/json" }),
      body: "{",
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "invalid_json" });
    expect(transactions.create).not.toHaveBeenCalled();
  });

  it("adds HSTS to HTTPS API responses", async () => {
    const app = createAppWithFakes();
    const response = await app.request("https://api.zoption.site/api/app/me", {
      headers: AUTHORIZATION,
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Strict-Transport-Security")).toContain("max-age=31536000");
  });

  it("answers CORS preflight before authentication and allows Authorization", async () => {
    const authVerifier = createAuthVerifier();
    const app = createAppWithFakes({ authVerifier });
    const response = await app.request("/api/app/transactions", {
      method: "OPTIONS",
      headers: {
        Origin: "http://localhost:5173",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization,content-type",
      },
    });
    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Headers")).toBe(
      "Authorization, Content-Type",
    );
    expect(authVerifier.verify).not.toHaveBeenCalled();
  });

  it("rejects browser requests from an unapproved origin", async () => {
    const app = createAppWithFakes({
      dashboardLoader: vi.fn().mockResolvedValue(dashboardFixture),
    });
    const response = await app.request("/api/app/dashboard?from=2026-07-01&to=2026-07-31", {
      headers: { Origin: "https://untrusted.example" },
    });
    expect(response.status).toBe(403);
  });

  it("rate-limits authenticated writes by resolved tenant", async () => {
    const transactions = createTransactionStore();
    const rateLimiter: RateLimiter = {
      consume: vi.fn(async () => ({
        allowed: false,
        limit: 60,
        remaining: 0,
        retryAfterSeconds: 42,
      })),
    };
    const app = createAppWithFakes({ transactions, rateLimiter });
    const response = await app.request("/api/app/transactions", {
      method: "POST",
      headers: privateHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("42");
    expect(rateLimiter.consume).toHaveBeenCalledWith(undefined, TENANT_ID, {
      scope: "tenant-write",
      limit: 60,
      windowSeconds: 60,
    });
    expect(transactions.create).not.toHaveBeenCalled();
  });

  it("rate-limits authenticated tenant reads by default", async () => {
    const loader = vi.fn().mockResolvedValue(dashboardFixture);
    const rateLimiter: RateLimiter = {
      consume: vi.fn(async () => ({
        allowed: false,
        limit: 120,
        remaining: 0,
        retryAfterSeconds: 24,
      })),
    };
    const app = createAppWithFakes({ dashboardLoader: loader, rateLimiter });
    const response = await app.request("/api/app/dashboard?from=2026-07-01&to=2026-07-31", {
      headers: AUTHORIZATION,
    });

    expect(response.status).toBe(429);
    expect(rateLimiter.consume).toHaveBeenCalledWith(undefined, TENANT_ID, {
      scope: "tenant-read",
      limit: 120,
      windowSeconds: 60,
    });
    expect(loader).not.toHaveBeenCalled();
  });

  it("uses the import-specific tenant rate limit", async () => {
    const imports = createImportStore();
    const rateLimiter = allowedRateLimiter();
    const app = createAppWithFakes({ imports, rateLimiter });
    await app.request("/api/app/imports/preview", {
      method: "POST",
      headers: privateHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({}),
    });
    expect(rateLimiter.consume).toHaveBeenCalledWith(undefined, TENANT_ID, {
      scope: "tenant-import",
      limit: 20,
      windowSeconds: 900,
    });
  });

  it("rate-limits bulk export reads before querying transactions", async () => {
    const transactions = createTransactionStore();
    const rateLimiter: RateLimiter = {
      consume: vi.fn(async () => ({
        allowed: false,
        limit: 20,
        remaining: 0,
        retryAfterSeconds: 18,
      })),
    };
    const app = createAppWithFakes({ transactions, rateLimiter });
    const response = await app.request("/api/app/exports/transactions.csv", {
      headers: AUTHORIZATION,
    });

    expect(response.status).toBe(429);
    expect(rateLimiter.consume).toHaveBeenCalledTimes(1);
    expect(rateLimiter.consume).toHaveBeenCalledWith(undefined, TENANT_ID, {
      scope: "tenant-export-read",
      limit: 20,
      windowSeconds: 60,
    });
    expect(transactions.export).not.toHaveBeenCalled();
  });
});
