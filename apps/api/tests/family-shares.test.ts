import type { DatabaseSync } from "node:sqlite";

import {
  WORKSPACE_HEADER,
  familySharedBalanceListSchema,
  myBalanceShareListSchema,
  type TransactionListItem,
} from "@zoption/shared";
import { Hono } from "hono";
import { afterEach, describe, expect, it } from "vitest";

import { createAuthMiddleware, type AuthVerifier } from "../src/auth";
import { tenantDataStatements } from "../src/db/account-deletion";
import { familyShareRepository } from "../src/db/family-shares";
import {
  createTenantResolver,
  defaultAccountIdForTenant,
  starterStatements,
  tenantBootstrapRepository,
  tenantIdForUser,
} from "../src/db/tenants";
import { transactionRepository } from "../src/db/transactions";
import { HttpError } from "../src/errors";
import { createFamilyService } from "../src/families";
import { createFamilyRoutes } from "../src/routes/families";
import {
  createActiveFamilyShareRoutes,
  createMyBalanceShareRoutes,
} from "../src/routes/family-shares";
import { createTransactionRoutes } from "../src/routes/transactions";
import type { AppEnvironment, Bindings } from "../src/types";
import { createD1TestDatabase } from "./helpers/d1-test-harness";

const FAMILY = "family:dela-cruz";
const databases: DatabaseSync[] = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

/** Mama owns the family, Kuya is a member, and Lola views it. */
async function setup() {
  const { binding, database } = createD1TestDatabase();
  databases.push(database);
  const env = { DB: binding } as unknown as Bindings;
  for (const id of ["mama", "kuya", "lola"]) await tenantBootstrapRepository.bootstrap(env, { id });
  database
    .prepare("INSERT INTO tenants (id, kind, name) VALUES (?, 'family', 'Dela Cruz family')")
    .run(FAMILY);
  await env.DB.batch(starterStatements(env, FAMILY));
  const member = database.prepare(
    "INSERT INTO tenant_members (tenant_id, user_id, role) VALUES (?, ?, ?)",
  );
  member.run(FAMILY, "mama", "owner");
  member.run(FAMILY, "kuya", "member");
  member.run(FAMILY, "lola", "viewer");

  const verifier: AuthVerifier = { verify: async (_env, token) => ({ id: token }) };
  const app = new Hono<AppEnvironment>();
  app.use("/api/app/*", createAuthMiddleware(verifier, createTenantResolver()));
  app.route("/api/app/transactions", createTransactionRoutes(transactionRepository));
  app.route("/api/app/families/balance-shares", createMyBalanceShareRoutes(familyShareRepository));
  app.route("/api/app/family/shares", createActiveFamilyShareRoutes(familyShareRepository));
  app.route("/api/app/families", createFamilyRoutes(createFamilyService()));
  app.onError((error, context) =>
    error instanceof HttpError
      ? context.json({ error: error.code }, error.status)
      : context.json({ error: String(error) }, 500),
  );

  const call = (user: string, method: string, path: string, body?: unknown, family = false) =>
    app.request(
      path,
      {
        method,
        headers: {
          Authorization: `Bearer ${user}`,
          "Content-Type": "application/json",
          ...(family ? { [WORKSPACE_HEADER]: FAMILY } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      },
      env,
    );
  const expenseCategory = (tenantId: string) =>
    (
      database
        .prepare("SELECT id FROM categories WHERE tenant_id = ? AND kind = 'expense' LIMIT 1")
        .get(tenantId) as { id: string }
    ).id;
  /** Adds an expense to someone's personal workspace and returns its id. */
  const spend = async (user: string, amountMinor: number, notes?: string) => {
    const response = await call(user, "POST", "/api/app/transactions", {
      kind: "expense",
      date: "2026-10-17",
      description: "Groceries",
      amountMinor,
      currency: "PHP",
      accountId: defaultAccountIdForTenant(tenantIdForUser(user)),
      categoryId: expenseCategory(tenantIdForUser(user)),
      ...(notes ? { notes } : {}),
    });
    return ((await response.json()) as TransactionListItem).id;
  };
  const shareTransaction = (user: string, transactionId: string, includeNotes = false) =>
    call(
      user,
      "POST",
      "/api/app/family/shares/transactions",
      {
        transactionId,
        accountId: defaultAccountIdForTenant(FAMILY),
        categoryId: expenseCategory(FAMILY),
        includeNotes,
      },
      true,
    );
  const familyBalances = async () =>
    familySharedBalanceListSchema.parse(
      await (await call("mama", "GET", "/api/app/family/shares/balances", undefined, true)).json(),
    ).balances;
  return { env, call, spend, shareTransaction, familyBalances };
}

describe("sharing a transaction into a family", () => {
  it("copies it once, credits the sharer, and copies the note only when asked", async () => {
    const { call, spend, shareTransaction } = await setup();
    const id = await spend("kuya", 45_000, "for Lola's medicine");

    const shared = await shareTransaction("kuya", id);
    const copy = (await shared.json()) as TransactionListItem;
    const again = await shareTransaction("kuya", id);
    const personal = (await (await call("kuya", "GET", "/api/app/transactions")).json()) as {
      items: TransactionListItem[];
    };

    expect(shared.status).toBe(201);
    expect(copy).toMatchObject({
      amountMinor: -45_000,
      description: "Groceries",
      notes: null,
      authorUserId: "kuya",
      sharedCopy: true,
    });
    expect(again.status).toBe(409);
    expect(personal.items[0]).toMatchObject({ id, sharedToFamilyIds: [FAMILY], sharedCopy: false });
  });

  it("can be shared again once the family deletes the copy", async () => {
    const { call, spend, shareTransaction } = await setup();
    const id = await spend("kuya", 12_000, "jeepney");
    const copy = (await (await shareTransaction("kuya", id, true)).json()) as TransactionListItem;

    const removed = await call(
      "kuya",
      "DELETE",
      `/api/app/transactions/${copy.id}`,
      undefined,
      true,
    );
    const again = await shareTransaction("kuya", id, true);

    expect(copy.notes).toBe("jeepney");
    expect(removed.status).toBe(204);
    expect(again.status).toBe(201);
  });

  it("refuses viewers and someone else's transaction", async () => {
    const { spend, shareTransaction } = await setup();
    const lolas = await spend("lola", 5_000);
    const mamas = await spend("mama", 5_000);

    expect((await shareTransaction("lola", lolas)).status).toBe(403);
    expect((await shareTransaction("kuya", mamas)).status).toBe(404);
  });
});

describe("family entries", () => {
  it("lets members change only their own, and the owner change any", async () => {
    const { call, spend, shareTransaction } = await setup();
    const kuyas = (await (await shareTransaction("kuya", await spend("kuya", 1_000))).json()) as {
      id: string;
    };
    const mamas = (await (await shareTransaction("mama", await spend("mama", 2_000))).json()) as {
      id: string;
    };
    const edit = (user: string, id: string) =>
      call(user, "PATCH", `/api/app/transactions/${id}`, { description: "Rice" }, true);

    expect((await edit("kuya", mamas.id)).status).toBe(403);
    expect(
      (await call("kuya", "DELETE", `/api/app/transactions/${mamas.id}`, undefined, true)).status,
    ).toBe(403);
    expect((await edit("kuya", kuyas.id)).status).toBe(200);
    expect((await edit("mama", kuyas.id)).status).toBe(200);
  });
});

describe("sharing a balance into a family", () => {
  it("follows the account live until the sharer stops it, then holds the last value", async () => {
    const { call, spend, familyBalances } = await setup();
    const accountId = defaultAccountIdForTenant(tenantIdForUser("kuya"));
    await spend("kuya", 30_000);

    const shared = await call(
      "kuya",
      "POST",
      "/api/app/family/shares/balances",
      { accountId },
      true,
    );
    const twice = await call(
      "kuya",
      "POST",
      "/api/app/family/shares/balances",
      { accountId },
      true,
    );
    const live = await familyBalances();
    await spend("kuya", 5_000);
    const followed = await familyBalances();
    const mine = myBalanceShareListSchema.parse(
      await (await call("kuya", "GET", "/api/app/families/balance-shares")).json(),
    ).shares;
    await call("kuya", "POST", `/api/app/families/balance-shares/${mine[0]!.id}/stop`);
    await spend("kuya", 7_000);
    const stopped = await familyBalances();

    expect(shared.status).toBe(204);
    expect(twice.status).toBe(409);
    expect(live).toMatchObject([
      { balanceMinor: -30_000, sharedByUserId: "kuya", stoppedAt: null },
    ]);
    expect(followed[0]!.balanceMinor).toBe(-35_000);
    expect(mine).toEqual([{ id: live[0]!.id, familyId: FAMILY, accountId }]);
    expect(stopped[0]!.balanceMinor).toBe(-35_000);
    expect(stopped[0]!.stoppedAt).not.toBeNull();
  });

  it("stops when the sharer leaves or deletes their account, and only the owner removes it", async () => {
    const { env, call, spend, familyBalances } = await setup();
    for (const user of ["kuya", "mama"]) {
      await call(
        user,
        "POST",
        "/api/app/family/shares/balances",
        { accountId: defaultAccountIdForTenant(tenantIdForUser(user)) },
        true,
      );
    }
    await spend("mama", 8_000);

    await call("kuya", "POST", `/api/app/families/${FAMILY}/leave`);
    await env.DB.batch(tenantDataStatements(env, tenantIdForUser("mama")));
    const balances = await familyBalances();
    const byLola = await call(
      "lola",
      "DELETE",
      `/api/app/family/shares/balances/${balances[0]!.id}`,
      undefined,
      true,
    );
    const byMama = await call(
      "mama",
      "DELETE",
      `/api/app/family/shares/balances/${balances[0]!.id}`,
      undefined,
      true,
    );

    expect(
      Object.fromEntries(
        balances.map((balance) => [
          balance.sharedByUserId,
          [balance.balanceMinor, balance.stoppedAt !== null],
        ]),
      ),
    ).toEqual({ kuya: [0, true], mama: [-8_000, true] });
    expect(byLola.status).toBe(403);
    expect(byMama.status).toBe(204);
    expect(await familyBalances()).toHaveLength(1);
  });
});
