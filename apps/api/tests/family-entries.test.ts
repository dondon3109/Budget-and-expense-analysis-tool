import type { DatabaseSync } from "node:sqlite";

import {
  WORKSPACE_HEADER,
  familyDeletedEntryListSchema,
  familyEntryHistorySchema,
  type TransactionListItem,
} from "@zoption/shared";
import { Hono } from "hono";
import { afterEach, describe, expect, it } from "vitest";

import { createAuthMiddleware, type AuthVerifier } from "../src/auth";
import { familyJournal } from "../src/db/family-journal";
import {
  createTenantResolver,
  defaultAccountIdForTenant,
  defaultCategoryIdForTenant,
  starterStatements,
  tenantBootstrapRepository,
} from "../src/db/tenants";
import { transactionRepository } from "../src/db/transactions";
import { HttpError } from "../src/errors";
import { createFamilyEntryRoutes } from "../src/routes/family-entries";
import { createTransactionRoutes } from "../src/routes/transactions";
import type { AppEnvironment, Bindings } from "../src/types";
import { createD1TestDatabase } from "./helpers/d1-test-harness";

const FAMILY = "family:dela-cruz";
const SAVINGS = "family-savings";
const databases: DatabaseSync[] = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

/** Mama owns the family and Kuya is a member. */
async function setup() {
  const { binding, database } = createD1TestDatabase();
  databases.push(database);
  const env = { DB: binding } as unknown as Bindings;
  for (const id of ["mama", "kuya"]) await tenantBootstrapRepository.bootstrap(env, { id });
  database
    .prepare("INSERT INTO tenants (id, kind, name) VALUES (?, 'family', 'Dela Cruz family')")
    .run(FAMILY);
  await env.DB.batch(starterStatements(env, FAMILY));
  database
    .prepare(
      "INSERT INTO accounts (id, tenant_id, name, type, currency) VALUES (?, ?, 'Savings', 'bank', 'PHP')",
    )
    .run(SAVINGS, FAMILY);
  const member = database.prepare(
    "INSERT INTO tenant_members (tenant_id, user_id, role) VALUES (?, ?, ?)",
  );
  member.run(FAMILY, "mama", "owner");
  member.run(FAMILY, "kuya", "member");

  const verifier: AuthVerifier = { verify: async (_env, token) => ({ id: token }) };
  const app = new Hono<AppEnvironment>();
  app.use("/api/app/*", createAuthMiddleware(verifier, createTenantResolver()));
  app.route("/api/app/transactions", createTransactionRoutes(transactionRepository, familyJournal));
  app.route("/api/app/family/transactions", createFamilyEntryRoutes(familyJournal));
  app.onError((error, context) =>
    error instanceof HttpError
      ? context.json({ error: error.code }, error.status)
      : context.json({ error: String(error) }, 500),
  );

  const call = (user: string, method: string, path: string, body?: unknown) =>
    app.request(
      path,
      {
        method,
        headers: {
          Authorization: `Bearer ${user}`,
          "Content-Type": "application/json",
          [WORKSPACE_HEADER]: FAMILY,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      },
      env,
    );
  const add = async (user: string, body: Record<string, unknown>) =>
    (await (
      await call(user, "POST", "/api/app/transactions", {
        date: "2026-10-17",
        description: "Rice",
        amountMinor: 120_000,
        currency: "PHP",
        ...body,
      })
    ).json()) as TransactionListItem;
  const listed = async () =>
    (
      (await (await call("mama", "GET", "/api/app/transactions")).json()) as {
        items: TransactionListItem[];
      }
    ).items.map((item) => item.id);
  const deleted = async () =>
    familyDeletedEntryListSchema.parse(
      await (await call("kuya", "GET", "/api/app/family/transactions/deleted")).json(),
    ).entries;
  const history = async (id: string) =>
    familyEntryHistorySchema.parse(
      await (await call("kuya", "GET", `/api/app/family/transactions/${id}/history`)).json(),
    ).events;
  const rowCount = () =>
    (
      database
        .prepare("SELECT COUNT(*) AS total FROM transactions WHERE tenant_id = ?")
        .get(FAMILY) as { total: number }
    ).total;
  return { call, add, listed, deleted, history, rowCount };
}

describe("family entry history", () => {
  it("records who changed and deleted an entry, and who may restore it", async () => {
    const { call, add, listed, deleted, history } = await setup();
    const rice = await add("kuya", {
      kind: "expense",
      accountId: defaultAccountIdForTenant(FAMILY),
      categoryId: defaultCategoryIdForTenant(FAMILY, "food"),
    });

    await call("kuya", "PATCH", `/api/app/transactions/${rice.id}`, { amountMinor: 150_000 });
    await call("mama", "DELETE", `/api/app/transactions/${rice.id}`);
    const gone = await deleted();
    const byKuya = await call("kuya", "POST", `/api/app/family/transactions/${rice.id}/restore`);
    const byMama = await call("mama", "POST", `/api/app/family/transactions/${rice.id}/restore`);
    const again = await call("mama", "POST", `/api/app/family/transactions/${rice.id}/restore`);

    expect(gone).toMatchObject([
      { transactionId: rice.id, deletedByUserId: "mama", entry: { amountMinor: -150_000 } },
    ]);
    expect(byKuya.status).toBe(404);
    expect(byMama.status).toBe(204);
    expect(again.status).toBe(404);
    expect(await listed()).toEqual([rice.id]);
    expect(await deleted()).toEqual([]);
    expect((await history(rice.id)).map((event) => [event.action, event.userId])).toEqual([
      ["restored", "mama"],
      ["deleted", "mama"],
      ["updated", "kuya"],
    ]);
    expect((await history(rice.id))[2]).toMatchObject({
      before: { amountMinor: -120_000, description: "Rice", categoryName: "Food & dining" },
      after: { amountMinor: -150_000 },
    });
  });

  it("restores both legs of a transfer, and keeps no history when a delete is refused", async () => {
    const { call, add, listed, deleted, history, rowCount } = await setup();
    const transfer = await add("mama", {
      kind: "transfer",
      description: "To savings",
      fromAccountId: defaultAccountIdForTenant(FAMILY),
      toAccountId: SAVINGS,
      categoryId: defaultCategoryIdForTenant(FAMILY, "savings-transfer"),
    });

    const refused = await call("kuya", "DELETE", `/api/app/transactions/${transfer.id}`);
    const refusedHistory = await history(transfer.id);
    await call("mama", "DELETE", `/api/app/transactions/${transfer.id}`);
    const afterDelete = rowCount();
    await call("mama", "POST", `/api/app/family/transactions/${transfer.id}/restore`);

    expect(refused.status).toBe(403);
    expect(refusedHistory).toEqual([]);
    expect(afterDelete).toBe(0);
    expect(rowCount()).toBe(2);
    expect(await listed()).toEqual([transfer.id]);
    expect(await deleted()).toEqual([]);
  });
});

describe("undoing a family delete", () => {
  it("lets a member restore an entry they deleted themselves", async () => {
    const { call, add, listed } = await setup();
    const rice = await add("kuya", {
      kind: "expense",
      accountId: defaultAccountIdForTenant(FAMILY),
      categoryId: defaultCategoryIdForTenant(FAMILY, "food"),
    });
    await call("kuya", "DELETE", `/api/app/transactions/${rice.id}`);

    const undone = await call("kuya", "POST", `/api/app/family/transactions/${rice.id}/restore`);

    expect(undone.status).toBe(204);
    expect(await listed()).toEqual([rice.id]);
  });
});
