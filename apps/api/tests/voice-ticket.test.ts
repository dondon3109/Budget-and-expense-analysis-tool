import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AssistantVoiceService } from "../src/assistant/voice-service";
import { createAuthMiddleware, type AuthVerifier } from "../src/auth";
import type { TenantResolver } from "../src/db/tenants";
import { VOICE_TICKET_TTL_SECONDS, voiceTicketRepository } from "../src/db/voice-tickets";
import { HttpError } from "../src/errors";
import { createVoiceStreamRoutes } from "../src/routes/voice-stream";
import { providerRegistry } from "../src/provider-registry";
import type { AppEnvironment, Bindings } from "../src/types";
import { createD1TestDatabase } from "./helpers/d1-test-harness";
import { grantMobileSyncTestPro } from "./helpers/mobile-sync-test-environment";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const TENANT_ID = "user:tenant-1";
const AUTHORIZATION = { Authorization: "Bearer valid-token" };
const UPGRADE = { Upgrade: "websocket", Connection: "Upgrade" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

type TestDatabase = ReturnType<typeof createD1TestDatabase>["database"];

const databases: TestDatabase[] = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

function environment(): { env: Bindings; database: TestDatabase } {
  const d1 = createD1TestDatabase();
  databases.push(d1.database);
  return { env: { DB: d1.binding } as Bindings, database: d1.database };
}

/** Seeds the entitlement row the Pro gate reads, through the same view the Worker uses. */
function grantPro(database: TestDatabase, tenantId = TENANT_ID): void {
  database
    .prepare("INSERT INTO tenants (id, kind, name) VALUES (?, 'user', 'Tenant')")
    .run(tenantId);
  grantMobileSyncTestPro(database, tenantId);
}

function ticketCount(database: TestDatabase, ticket?: string): number {
  const row = (
    ticket
      ? database
          .prepare("SELECT COUNT(*) AS count FROM assistant_voice_tickets WHERE ticket = ?")
          .get(ticket)
      : database.prepare("SELECT COUNT(*) AS count FROM assistant_voice_tickets").get()
  ) as { count: number };
  return Number(row.count);
}

function buildApi(options: { env: Bindings; consent?: () => Promise<void> }) {
  const requireConsent = vi.fn(options.consent ?? (async () => undefined));
  const voiceService = { requireConsent } as unknown as AssistantVoiceService;
  const verifier: AuthVerifier = { verify: vi.fn(async () => ({ id: USER_ID })) };
  const tenantResolver: TenantResolver = {
    resolve: vi.fn(async () => ({ tenantId: TENANT_ID, defaultAccountId: "account-1" })),
  };

  const app = new Hono<AppEnvironment>();
  app.use(
    "/api/app/*",
    createAuthMiddleware(verifier, tenantResolver, undefined, voiceTicketRepository),
  );
  app.route("/api/app/assistant/voice", createVoiceStreamRoutes(voiceService));
  app.onError((error, context) =>
    error instanceof HttpError
      ? context.json({ error: error.code, message: error.message }, error.status)
      : context.json({ error: "internal_server_error" }, 500),
  );
  return { app, requireConsent };
}

describe("voice ticket repository", () => {
  it("mints a random ticket that expires in about a minute and is redeemed once", async () => {
    const { env } = environment();
    const before = Date.now();
    const { ticket, expiresAt } = await voiceTicketRepository.mint(
      env,
      USER_ID,
      VOICE_TICKET_TTL_SECONDS,
    );

    expect(ticket).toMatch(UUID);
    // A second of slack on both ends absorbs a clock tick between here and the mint.
    const lifetimeMs = new Date(expiresAt).getTime() - before;
    expect(lifetimeMs).toBeGreaterThan(55_000);
    expect(lifetimeMs).toBeLessThan(61_000);

    await expect(voiceTicketRepository.consume(env, ticket)).resolves.toBe(USER_ID);
    await expect(voiceTicketRepository.consume(env, ticket)).resolves.toBeNull();
  });

  it("mints a different ticket every time", async () => {
    const { env } = environment();
    const minted = await Promise.all(
      Array.from({ length: 5 }, () => voiceTicketRepository.mint(env, USER_ID, 60)),
    );

    expect(new Set(minted.map((item) => item.ticket)).size).toBe(5);
  });

  it("returns null for an unknown or expired ticket", async () => {
    const { env, database } = environment();
    const past = new Date(Date.now() - 1_000).toISOString();
    database
      .prepare(
        "INSERT INTO assistant_voice_tickets (ticket, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
      )
      .run("expired-ticket", USER_ID, past, past);

    await expect(voiceTicketRepository.consume(env, "unknown-ticket")).resolves.toBeNull();
    await expect(voiceTicketRepository.consume(env, "expired-ticket")).resolves.toBeNull();
    expect(ticketCount(database, "expired-ticket")).toBe(1);
  });

  it("sweeps expired rows when it mints the next ticket", async () => {
    const { env, database } = environment();
    const past = new Date(Date.now() - 1_000).toISOString();
    database
      .prepare(
        "INSERT INTO assistant_voice_tickets (ticket, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
      )
      .run("stale-ticket", USER_ID, past, past);

    await voiceTicketRepository.mint(env, USER_ID, VOICE_TICKET_TTL_SECONDS);

    expect(ticketCount(database, "stale-ticket")).toBe(0);
    expect(ticketCount(database)).toBe(1);
  });

  it("lets exactly one of two concurrent redemptions through", async () => {
    const { env } = environment();
    const { ticket } = await voiceTicketRepository.mint(env, USER_ID, VOICE_TICKET_TTL_SECONDS);

    const [first, second] = await Promise.all([
      voiceTicketRepository.consume(env, ticket),
      voiceTicketRepository.consume(env, ticket),
    ]);

    expect([first, second].filter((userId) => userId !== null)).toEqual([USER_ID]);
  });
});

describe("voice ticket routes", () => {
  it("mints a ticket for a consented tenant with Pro", async () => {
    const { env, database } = environment();
    grantPro(database);
    const { app, requireConsent } = buildApi({ env });

    const response = await app.request(
      "/api/app/assistant/voice/ticket",
      { method: "POST", headers: AUTHORIZATION },
      env,
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { ticket: string; expiresAt: string };
    expect(body.ticket).toMatch(UUID);
    expect(new Date(body.expiresAt).getTime()).toBeGreaterThan(Date.now());
    expect(requireConsent).toHaveBeenCalledWith(env, TENANT_ID);
    expect(
      database
        .prepare("SELECT user_id FROM assistant_voice_tickets WHERE ticket = ?")
        .get(body.ticket),
    ).toEqual({ user_id: USER_ID });
  });

  it("refuses to mint before consent", async () => {
    const { env, database } = environment();
    const { app, requireConsent } = buildApi({
      env,
      consent: async () => {
        throw new HttpError(
          409,
          "assistant_voice_consent_required",
          "Accept the voice preview notice first.",
        );
      },
    });

    const response = await app.request(
      "/api/app/assistant/voice/ticket",
      { method: "POST", headers: AUTHORIZATION },
      env,
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: "assistant_voice_consent_required",
    });
    expect(requireConsent).toHaveBeenCalledWith(env, TENANT_ID);
    expect(ticketCount(database)).toBe(0);
  });

  it("refuses the ticket and the stream for a tenant without Pro before any provider call", async () => {
    const { env, database } = environment();
    const { app } = buildApi({ env });
    const getActive = vi.spyOn(providerRegistry, "getActive");

    const minted = await app.request(
      "/api/app/assistant/voice/ticket",
      { method: "POST", headers: AUTHORIZATION },
      env,
    );
    expect(minted.status).toBe(403);
    await expect(minted.json()).resolves.toMatchObject({ error: "upgrade_required" });
    // A free tenant cannot mint a ticket for a socket it may not open.
    expect(ticketCount(database)).toBe(0);

    const { ticket } = await voiceTicketRepository.mint(env, USER_ID, VOICE_TICKET_TTL_SECONDS);
    const streamed = await app.request(
      `/api/app/assistant/voice/stream?ticket=${ticket}`,
      { headers: UPGRADE },
      env,
    );
    expect(streamed.status).toBe(403);
    await expect(streamed.json()).resolves.toMatchObject({ error: "upgrade_required" });
    expect(getActive).not.toHaveBeenCalled();
    getActive.mockRestore();
  });

  it("authenticates the stream with a ticket and refuses a replay", async () => {
    const { env, database } = environment();
    grantPro(database);
    const { app } = buildApi({ env });
    const minted = await app.request(
      "/api/app/assistant/voice/ticket",
      { method: "POST", headers: AUTHORIZATION },
      env,
    );
    const { ticket } = (await minted.json()) as { ticket: string };

    const opened = await app.request(
      `/api/app/assistant/voice/stream?ticket=${ticket}`,
      { headers: UPGRADE },
      env,
    );
    // No STT provider is configured in the test database, so the registry falls back to the
    // non-streaming Cloudflare model. Reaching that check at all proves the ticket authenticated
    // the upgrade and the consent and Pro gates passed.
    expect(opened.status).toBe(400);
    await expect(opened.json()).resolves.toMatchObject({ error: "stt_not_streaming" });

    const replayed = await app.request(
      `/api/app/assistant/voice/stream?ticket=${ticket}`,
      { headers: UPGRADE },
      env,
    );
    expect(replayed.status).toBe(401);
    await expect(replayed.json()).resolves.toMatchObject({ error: "invalid_voice_ticket" });
  });

  it("rejects an unknown ticket with invalid_voice_ticket", async () => {
    const { env } = environment();
    const { app, requireConsent } = buildApi({ env });

    const response = await app.request(
      "/api/app/assistant/voice/stream?ticket=never-minted",
      { headers: UPGRADE },
      env,
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: "invalid_voice_ticket" });
    expect(requireConsent).not.toHaveBeenCalled();
  });

  it("runs the consent gate on the stream before the upgrade", async () => {
    const { env } = environment();
    const { app } = buildApi({
      env,
      consent: async () => {
        throw new HttpError(
          409,
          "assistant_consent_required",
          "Accept the AI data-sharing notice first.",
        );
      },
    });
    const { ticket } = await voiceTicketRepository.mint(env, USER_ID, VOICE_TICKET_TTL_SECONDS);

    const response = await app.request(
      `/api/app/assistant/voice/stream?ticket=${ticket}`,
      { headers: UPGRADE },
      env,
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: "assistant_consent_required" });
  });
});
