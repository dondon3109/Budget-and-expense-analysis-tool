import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createAuthMiddleware, type AuthVerifier } from "../src/auth";
import type { TenantResolver } from "../src/db/tenants";
import type { VoiceTicketRepository } from "../src/db/voice-tickets";
import { HttpError } from "../src/errors";
import type { AppEnvironment, Bindings } from "../src/types";
import { createD1TestDatabase } from "./helpers/d1-test-harness";

const DEV_USER_ID = "00000000-0000-4000-8000-0000000000aa";
const DUMMY_TOKEN = "dummy-dev-access-token";
const AUTHORIZATION = { Authorization: "Bearer valid-token" };

const databases: ReturnType<typeof createD1TestDatabase>["database"][] = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

/** A D1 environment carrying a deletion tombstone for `deletedUserId` when one is given. */
function databaseEnvironment(deletedUserId?: string): Bindings {
  const d1 = createD1TestDatabase();
  databases.push(d1.database);
  if (deletedUserId) {
    d1.database.prepare("INSERT INTO account_deletions (user_id) VALUES (?)").run(deletedUserId);
  }
  return { DB: d1.binding } as Bindings;
}

function buildApp(options: { tickets?: Record<string, string> } = {}) {
  const verify = vi.fn(async (_env: Bindings, token: string) => {
    if (token !== "valid-token") throw new Error("The access token is not valid.");
    return { id: "user-1" };
  });
  const resolve = vi.fn(async (_env: Bindings, user: { id: string }) => ({
    tenantId: `tenant:${user.id}`,
    defaultAccountId: `account:${user.id}`,
  }));
  const consume = vi.fn(
    async (_env: Bindings, ticket: string) => options.tickets?.[ticket] ?? null,
  );
  const verifier: AuthVerifier = { verify };
  const tenantResolver: TenantResolver = { resolve };
  const voiceTickets: VoiceTicketRepository = { mint: vi.fn(), consume };

  const app = new Hono<AppEnvironment>();
  app.use(
    "/api/app/*",
    createAuthMiddleware(
      verifier,
      tenantResolver,
      (path) => path.startsWith("/api/app/admin/"),
      voiceTickets,
    ),
  );
  app.get("/api/app/me", (context) =>
    context.json({ user: context.get("authUser"), tenantId: context.get("tenant").tenantId }),
  );
  app.get("/api/app/admin/whoami", (context) => context.json({ user: context.get("authUser") }));
  app.onError((error, context) =>
    error instanceof HttpError
      ? context.json({ error: error.code, message: error.message }, error.status)
      : context.json({ error: "internal_server_error" }, 500),
  );
  return { app, verify, resolve, consume };
}

describe("dummy dev access token", () => {
  it("accepts it with the explicit opt-in on a loopback host", async () => {
    const { app } = buildApp();
    const response = await app.request(
      "/api/app/me",
      { headers: { Authorization: `Bearer ${DUMMY_TOKEN}` } },
      { DEV_ACCESS_TOKEN_ENABLED: "true", DEV_USER_ID } as Bindings,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      user: { id: DEV_USER_ID },
      tenantId: `tenant:${DEV_USER_ID}`,
    });
  });

  it("is off by default even when the configured origins mention localhost", async () => {
    const { app, verify } = buildApp();
    const response = await app.request(
      "/api/app/me",
      { headers: { Authorization: `Bearer ${DUMMY_TOKEN}` } },
      {
        ALLOWED_ORIGINS: "http://localhost:5173,https://localhost-cdn.example.com",
        WEB_APP_URL: "http://localhost:5173",
      } as Bindings,
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: "invalid_access_token" });
    expect(verify).toHaveBeenCalledTimes(1);
  });

  it("rejects it when the request host is not loopback", async () => {
    const { app, verify } = buildApp();
    const env = { DEV_ACCESS_TOKEN_ENABLED: "true" } as Bindings;
    const headers = { Authorization: `Bearer ${DUMMY_TOKEN}` };

    for (const url of [
      "https://api.zoption.site/api/app/me",
      "http://localhost-cdn.example.com/api/app/me",
      "http://192.168.example.com/api/app/me",
    ]) {
      const response = await app.request(url, { headers }, env);
      expect(response.status, url).toBe(401);
      await expect(response.json()).resolves.toMatchObject({ error: "invalid_access_token" });
    }
    expect(verify).toHaveBeenCalledTimes(3);
  });

  it("rejects it in production even on a loopback host", async () => {
    const { app } = buildApp();
    const response = await app.request(
      "/api/app/me",
      { headers: { Authorization: `Bearer ${DUMMY_TOKEN}` } },
      { DEV_ACCESS_TOKEN_ENABLED: "true", POSTHOG_AI_ENVIRONMENT: "production" } as Bindings,
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: "invalid_access_token" });
  });
});

describe("WebSocket credentials", () => {
  const upgrade = { Upgrade: "websocket", Connection: "Upgrade" };

  it("keeps accepting the Supabase JWT from the Authorization header", async () => {
    const { app, verify } = buildApp();
    const response = await app.request("/api/app/me", { headers: AUTHORIZATION });

    expect(response.status).toBe(200);
    expect(verify).toHaveBeenCalledWith(undefined, "valid-token");
  });

  it("ignores an access token in the query string", async () => {
    const { app, verify } = buildApp();
    const response = await app.request("/api/app/me?token=valid-token", { headers: upgrade });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: "authentication_required" });
    expect(verify).not.toHaveBeenCalled();
  });

  it("ignores an access token in Sec-WebSocket-Protocol", async () => {
    const { app, verify } = buildApp();
    const response = await app.request("/api/app/me", {
      headers: { ...upgrade, "Sec-WebSocket-Protocol": "valid-token" },
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: "authentication_required" });
    expect(verify).not.toHaveBeenCalled();
  });

  it("redeems a ticket only for a websocket upgrade", async () => {
    const { app, consume } = buildApp({ tickets: { "ticket-1": "user-9" } });
    const opened = await app.request("/api/app/me?ticket=ticket-1", { headers: upgrade });

    expect(opened.status).toBe(200);
    await expect(opened.json()).resolves.toMatchObject({
      user: { id: "user-9" },
      tenantId: "tenant:user-9",
    });
    expect(consume).toHaveBeenCalledWith(undefined, "ticket-1");

    const plain = await app.request("/api/app/me?ticket=ticket-2");
    expect(plain.status).toBe(401);
    await expect(plain.json()).resolves.toMatchObject({ error: "authentication_required" });
    expect(consume).toHaveBeenCalledTimes(1);
  });

  it("rejects an unknown, expired or already redeemed ticket", async () => {
    const { app } = buildApp({ tickets: {} });
    const response = await app.request("/api/app/me?ticket=spent", { headers: upgrade });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: "invalid_voice_ticket" });
  });

  it("prefers the Authorization header and leaves the ticket unspent", async () => {
    const { app, consume } = buildApp({ tickets: { "ticket-1": "user-9" } });
    const response = await app.request("/api/app/me?ticket=ticket-1", {
      headers: { ...AUTHORIZATION, ...upgrade },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ user: { id: "user-1" } });
    expect(consume).not.toHaveBeenCalled();
  });
});

describe("account deletion tombstone", () => {
  it("returns 410 on an admin path that skips tenant resolution", async () => {
    const { app, resolve } = buildApp();
    const response = await app.request(
      "/api/app/admin/whoami",
      { headers: AUTHORIZATION },
      databaseEnvironment("user-1"),
    );

    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toMatchObject({ error: "account_deleted" });
    expect(resolve).not.toHaveBeenCalled();
  });

  it("returns 410 on a path that resolves a tenant", async () => {
    const { app } = buildApp();
    const response = await app.request(
      "/api/app/me",
      { headers: AUTHORIZATION },
      databaseEnvironment("user-1"),
    );

    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toMatchObject({ error: "account_deleted" });
  });

  it("lets an identity with no tombstone through", async () => {
    const { app } = buildApp();
    const response = await app.request(
      "/api/app/admin/whoami",
      { headers: AUTHORIZATION },
      databaseEnvironment(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ user: { id: "user-1" } });
  });
});
