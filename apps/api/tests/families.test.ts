import type { DatabaseSync } from "node:sqlite";

import { WORKSPACE_HEADER, familyDetailSchema, familyInvitationListSchema } from "@zoption/shared";
import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createAccountDeletionService } from "../src/account-deletion";
import { createAuthMiddleware, type AuthVerifier } from "../src/auth";
import type { AccountDeletionRepository } from "../src/db/account-deletion";
import { familyRepository } from "../src/db/families";
import { createTenantResolver, tenantBootstrapRepository } from "../src/db/tenants";
import { HttpError } from "../src/errors";
import { createFamilyService } from "../src/families";
import { createActiveFamilyRoutes, createFamilyRoutes } from "../src/routes/families";
import type { AppEnvironment, Bindings, EmailSender } from "../src/types";
import { createD1TestDatabase } from "./helpers/d1-test-harness";

const PEOPLE = ["mama", "papa", "lola", "kuya", "ate", "bunso", "tito"] as const;
const RULES = { seatRulesAccepted: true };
const databases: DatabaseSync[] = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

/** Everyone has a personal workspace and a verified `<name>@example.com`. */
async function setup() {
  const { binding, database } = createD1TestDatabase();
  databases.push(database);
  const env = {
    DB: binding,
    FAMILY_WORKSPACES_ENABLED: "true",
    WEB_APP_URL: "https://app.zoption.site",
    EMAIL_FROM: "hello@zoption.site",
  } as unknown as Bindings;
  for (const id of PEOPLE) {
    await tenantBootstrapRepository.bootstrap(env, { id });
    database
      .prepare("INSERT INTO app_user_identities (user_id, verified_email) VALUES (?, ?)")
      .run(id, `${id}@example.com`);
  }
  const send = vi.fn<EmailSender["send"]>(async () => undefined);
  const families = createFamilyService(undefined, { send });

  // The bearer token is the user id, so each request picks its caller.
  const verifier: AuthVerifier = { verify: async (_env, token) => ({ id: token }) };
  const app = new Hono<AppEnvironment>();
  app.use("/api/app/*", createAuthMiddleware(verifier, createTenantResolver()));
  app.route("/api/app/families", createFamilyRoutes(families));
  app.route("/api/app/family", createActiveFamilyRoutes(families));
  app.onError((error, context) =>
    error instanceof HttpError
      ? context.json({ error: error.code }, error.status)
      : context.json({ error: String(error) }, 500),
  );

  const call = (
    user: string,
    method: string,
    path: string,
    options: { body?: unknown; family?: string } = {},
  ) =>
    app.request(
      `/api/app${path}`,
      {
        method,
        headers: {
          Authorization: `Bearer ${user}`,
          "Content-Type": "application/json",
          ...(options.family ? { [WORKSPACE_HEADER]: options.family } : {}),
        },
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      },
      env,
    );

  async function createFamily(owner = "mama") {
    const response = await call(owner, "POST", "/families", {
      body: { name: "Dela Cruz", ...RULES },
    });
    expect(response.status).toBe(201);
    return ((await response.json()) as { id: string }).id;
  }

  async function invite(family: string, person: string, role = "member", owner = "mama") {
    return call(owner, "POST", "/family/invitations", {
      family,
      body: { email: `${person}@example.com`, role },
    });
  }

  async function join(family: string, person: string, role = "member") {
    expect((await invite(family, person, role)).status).toBe(204);
    const { invitations } = familyInvitationListSchema.parse(
      await (await call(person, "GET", "/families/invitations")).json(),
    );
    const invitation = invitations.find((item) => item.familyId === family)!;
    return call(person, "POST", `/families/invitations/${invitation.id}/accept`, { body: RULES });
  }

  async function detail(family: string, user = "mama") {
    return familyDetailSchema.parse(await (await call(user, "GET", "/family", { family })).json());
  }

  return { env, database, send, call, createFamily, invite, join, detail };
}

describe("families", () => {
  it("invites by email and lets that verified person join", async () => {
    const { send, call, createFamily, join, detail } = await setup();
    const family = await createFamily();

    expect((await join(family, "lola", "viewer")).status).toBe(204);

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "lola@example.com",
        subject: expect.stringContaining("Dela Cruz"),
      }),
    );
    const members = (await detail(family)).members;
    expect(members.map(({ userId, role }) => ({ userId, role }))).toEqual([
      { userId: "mama", role: "owner" },
      { userId: "lola", role: "viewer" },
    ]);
    // Lola now acts in the family as a viewer.
    expect((await call("lola", "GET", "/family", { family })).status).toBe(200);
    expect((await call("lola", "POST", "/family/invitations", { family, body: {} })).status).toBe(
      403,
    );
  });

  it("lets only the invited email accept, and only after the seat rules", async () => {
    const { call, createFamily, invite } = await setup();
    const family = await createFamily();
    await invite(family, "papa");
    const { invitations } = familyInvitationListSchema.parse(
      await (await call("papa", "GET", "/families/invitations")).json(),
    );
    const path = `/families/invitations/${invitations[0]!.id}/accept`;

    expect((await call("papa", "POST", path, { body: {} })).status).toBe(400);
    expect((await call("tito", "POST", path, { body: RULES })).status).toBe(404);
    expect((await call("papa", "POST", path, { body: RULES })).status).toBe(204);
  });

  it("stays closed until the flag is on, and allows one owned family per person", async () => {
    const { env, call, createFamily } = await setup();
    await createFamily();

    const second = await call("mama", "POST", "/families", { body: { name: "Again", ...RULES } });
    env.FAMILY_WORKSPACES_ENABLED = undefined;
    const flagged = await call("papa", "POST", "/families", { body: { name: "Papa", ...RULES } });

    await expect(second.json()).resolves.toEqual({ error: "family_already_owned" });
    await expect(flagged.json()).resolves.toEqual({ error: "family_unavailable" });
  });

  it("counts invitations and cooling seats against the six seats", async () => {
    const { call, createFamily, invite, join, detail } = await setup();
    const family = await createFamily();
    expect((await join(family, "papa")).status).toBe(204);
    for (const person of ["lola", "kuya", "ate", "bunso"]) {
      expect((await invite(family, person)).status).toBe(204);
    }
    await expect((await invite(family, "tito")).json()).resolves.toEqual({
      error: "family_seats_full",
    });

    const removed = await call("mama", "POST", "/family/members/papa/remove", {
      family,
      body: RULES,
    });

    expect(removed.status).toBe(204);
    expect((await detail(family)).seats).toEqual({ limit: 6, used: 5, cooling: 1 });
    await expect((await invite(family, "tito")).json()).resolves.toEqual({
      error: "family_seats_full",
    });
  });

  it("stops new invitations after five seats were freed in a year", async () => {
    const { database, createFamily, invite } = await setup();
    const family = await createFamily();
    const freed = database.prepare(
      `INSERT INTO family_seat_events (tenant_id, user_id, kind, created_at)
       VALUES (?, ?, 'freed', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-60 days'))`,
    );
    for (const person of ["a", "b", "c", "d", "e"]) freed.run(family, person);

    await expect((await invite(family, "papa")).json()).resolves.toEqual({
      error: "family_swap_limit",
    });
  });

  it("keeps someone from joining a different family within 90 days", async () => {
    const { database, createFamily, join } = await setup();
    const family = await createFamily();
    database
      .prepare(
        `INSERT INTO family_seat_events (tenant_id, user_id, kind, created_at)
         VALUES ('family:other', 'kuya', 'joined', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-10 days'))`,
      )
      .run();

    await expect((await join(family, "kuya")).json()).resolves.toEqual({
      error: "family_join_cooldown",
    });
  });

  it("lets a member leave but not the owner", async () => {
    const { call, createFamily, join, detail } = await setup();
    const family = await createFamily();
    await join(family, "lola", "viewer");

    expect((await call("lola", "POST", `/families/${family}/leave`)).status).toBe(204);
    await expect((await call("mama", "POST", `/families/${family}/leave`)).json()).resolves.toEqual(
      {
        error: "owner_cannot_leave",
      },
    );
    expect((await detail(family)).members.map((member) => member.userId)).toEqual(["mama"]);
    expect((await call("lola", "GET", "/family", { family })).status).toBe(403);
  });

  it("transfers ownership only to a current member", async () => {
    const { call, createFamily, join, detail } = await setup();
    const family = await createFamily();
    await join(family, "papa");

    const outsider = await call("mama", "POST", "/family/transfer", {
      family,
      body: { userId: "tito" },
    });
    const moved = await call("mama", "POST", "/family/transfer", {
      family,
      body: { userId: "papa" },
    });

    expect(outsider.status).toBe(404);
    expect(moved.status).toBe(204);
    expect(
      (await detail(family, "papa")).members.map(({ userId, role }) => [userId, role]),
    ).toEqual([
      ["papa", "owner"],
      ["mama", "member"],
    ]);
  });

  it("refuses a transfer to someone who already owns a family", async () => {
    const { call, createFamily, join, detail } = await setup();
    const family = await createFamily();
    await join(family, "papa");
    await createFamily("papa");

    const response = await call("mama", "POST", "/family/transfer", {
      family,
      body: { userId: "papa" },
    });

    await expect(response.json()).resolves.toEqual({ error: "new_owner_owns_family" });
    expect((await detail(family)).role).toBe("owner");
  });

  it("closes into a read-only family, then deletes it once the closing period ends", async () => {
    const { env, database, call, createFamily, invite, join, detail } = await setup();
    const family = await createFamily();
    await join(family, "lola");
    await invite(family, "papa");

    const closed = await call("lola", "POST", "/family/close", { family });
    const response = await call("mama", "POST", "/family/close", { family });

    expect(closed.status).toBe(403);
    const { closesAt } = (await response.json()) as { closesAt: string };
    expect(Date.parse(closesAt) - Date.now()).toBeGreaterThan(29 * 86_400_000);
    expect(await detail(family, "lola")).toMatchObject({ closesAt, invitations: [] });
    for (const user of ["mama", "lola"]) {
      await expect(
        (
          await call(user, "PATCH", "/family/members/lola", { family, body: { role: "viewer" } })
        ).json(),
      ).resolves.toEqual({ error: "workspace_closing" });
    }

    expect(await familyRepository.purgeClosed(env, 25)).toBe(0);
    database.prepare("UPDATE family_closures SET purge_after = '2000-01-01T00:00:00.000Z'").run();
    expect(await familyRepository.purgeClosed(env, 25)).toBe(1);

    expect((await call("lola", "GET", "/family", { family })).status).toBe(403);
    const left = (table: string) =>
      database.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE tenant_id = ?`).get(family);
    expect(left("tenant_members")).toEqual({ count: 0 });
    expect(left("accounts")).toEqual({ count: 0 });
    // The join cooldown outlives the family.
    expect(left("family_seat_events")).toEqual({ count: 1 });
  });
});

describe("account deletion for a family owner", () => {
  it("is refused until the family is closed", async () => {
    const { env, call, createFamily } = await setup();
    const family = await createFamily();
    const purgeTenant = vi.fn(async () => ({
      userId: "mama",
      storagePurgedAt: "done",
      authDeletedAt: "done",
      cleanupAttempts: 0,
      cleanupLeaseUntil: null,
      lastErrorCode: null,
    }));
    const service = createAccountDeletionService(
      { find: vi.fn(async () => null), purgeTenant } as unknown as AccountDeletionRepository,
      () => ({
        getCurrentUser: vi.fn(async () => ({ id: "mama", email: "mama@example.com" })),
        verifyPassword: vi.fn(async () => true),
        purgeAvatars: vi.fn(),
        hardDeleteUser: vi.fn(),
      }),
      undefined,
      undefined,
      familyRepository,
    );

    await expect(
      service.deleteAccount({ env, user: { id: "mama" }, accessToken: "token", password: "pw" }),
    ).rejects.toMatchObject({ status: 409, code: "family_owner_blocks_account_deletion" });
    expect(purgeTenant).not.toHaveBeenCalled();

    expect((await call("mama", "POST", "/family/close", { family })).status).toBe(200);
    await expect(
      service.deleteAccount({ env, user: { id: "mama" }, accessToken: "token", password: "pw" }),
    ).resolves.toBe("deleted");
  });
});
