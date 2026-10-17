import type { DatabaseSync } from "node:sqlite";

import { WORKSPACE_HEADER, workspaceListSchema } from "@zoption/shared";
import { Hono } from "hono";
import { afterEach, describe, expect, it } from "vitest";

import { createAuthMiddleware, type AuthVerifier } from "../src/auth";
import { membershipRepository } from "../src/db/memberships";
import {
  createTenantResolver,
  tenantBootstrapRepository,
  tenantIdForUser,
} from "../src/db/tenants";
import { HttpError } from "../src/errors";
import { createWorkspaceRoutes } from "../src/routes/workspaces";
import type { AppEnvironment, Bindings } from "../src/types";
import { createD1TestDatabase } from "./helpers/d1-test-harness";

const FAMILY = "family:dela-cruz";
const databases: DatabaseSync[] = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

/** Mama owns the family, Lola views it, and Tito has only his personal workspace. */
async function setup() {
  const { binding, database } = createD1TestDatabase();
  databases.push(database);
  const env = { DB: binding } as unknown as Bindings;
  for (const id of ["mama", "lola", "tito"]) await tenantBootstrapRepository.bootstrap(env, { id });
  database
    .prepare("INSERT INTO tenants (id, kind, name) VALUES (?, 'family', 'Dela Cruz family')")
    .run(FAMILY);
  const member = database.prepare(
    "INSERT INTO tenant_members (tenant_id, user_id, role) VALUES (?, ?, ?)",
  );
  member.run(FAMILY, "mama", "owner");
  member.run(FAMILY, "lola", "viewer");

  // The bearer token is the user id, so each request picks its caller.
  const verifier: AuthVerifier = { verify: async (_env, token) => ({ id: token }) };
  const app = new Hono<AppEnvironment>();
  app.use("/api/app/*", createAuthMiddleware(verifier, createTenantResolver()));
  app.on(["GET", "POST"], "/api/app/transactions", (context) =>
    context.json({ tenantId: context.get("tenant").tenantId }),
  );
  app.get("/api/app/billing", (context) => context.json({ ok: true }));
  app.route("/api/app/workspaces", createWorkspaceRoutes(membershipRepository));
  app.onError((error, context) =>
    error instanceof HttpError
      ? context.json({ error: error.code }, error.status)
      : context.json({ error: "internal_server_error" }, 500),
  );

  const call = (user: string, path: string, workspace?: string, method = "GET") =>
    app.request(
      path,
      {
        method,
        headers: {
          Authorization: `Bearer ${user}`,
          ...(workspace ? { [WORKSPACE_HEADER]: workspace } : {}),
        },
      },
      env,
    );
  return { call };
}

describe("active workspace", () => {
  it("acts in the personal workspace unless a family is named", async () => {
    const { call } = await setup();

    const personal = await call("mama", "/api/app/transactions");
    const family = await call("mama", "/api/app/transactions", FAMILY);

    await expect(personal.json()).resolves.toEqual({ tenantId: tenantIdForUser("mama") });
    await expect(family.json()).resolves.toEqual({ tenantId: FAMILY });
  });

  it("rejects a workspace the caller is not a member of, including someone's personal one", async () => {
    const { call } = await setup();

    for (const workspace of [FAMILY, tenantIdForUser("mama"), "family:missing"]) {
      const response = await call("tito", "/api/app/transactions", workspace);
      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toEqual({ error: "workspace_forbidden" });
    }
  });

  it("keeps personal-only surfaces out of a family workspace", async () => {
    const { call } = await setup();

    const response = await call("mama", "/api/app/billing", FAMILY);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "workspace_not_supported" });
  });

  it("lets a viewer read but not write", async () => {
    const { call } = await setup();

    expect((await call("lola", "/api/app/transactions", FAMILY)).status).toBe(200);
    const write = await call("lola", "/api/app/transactions", FAMILY, "POST");
    expect(write.status).toBe(403);
    await expect(write.json()).resolves.toEqual({ error: "workspace_read_only" });
    expect((await call("mama", "/api/app/transactions", FAMILY, "POST")).status).toBe(200);
  });
});

describe("workspace list", () => {
  it("lists the personal workspace first, then the families the caller belongs to", async () => {
    const { call } = await setup();

    const lola = workspaceListSchema.parse(
      await (await call("lola", "/api/app/workspaces")).json(),
    );
    const tito = workspaceListSchema.parse(
      await (await call("tito", "/api/app/workspaces")).json(),
    );

    expect(lola.workspaces).toEqual([
      { id: tenantIdForUser("lola"), kind: "user", name: "Personal budget", role: "owner" },
      { id: FAMILY, kind: "family", name: "Dela Cruz family", role: "viewer" },
    ]);
    expect(tito.workspaces.map((workspace) => workspace.id)).toEqual([tenantIdForUser("tito")]);
  });
});
