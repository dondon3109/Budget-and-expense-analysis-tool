import type { DatabaseSync } from "node:sqlite";

import { WORKSPACE_HEADER, type TransactionListItem } from "@zoption/shared";
import { Hono } from "hono";
import { afterEach, describe, expect, it } from "vitest";

import { createAuthMiddleware, type AuthVerifier } from "../src/auth";
import { familyRepository } from "../src/db/families";
import { familyJournal } from "../src/db/family-journal";
import { familyReceiptRepository } from "../src/db/family-receipts";
import {
  createTenantResolver,
  defaultAccountIdForTenant,
  defaultCategoryIdForTenant,
  starterStatements,
  tenantBootstrapRepository,
} from "../src/db/tenants";
import { transactionRepository } from "../src/db/transactions";
import { HttpError } from "../src/errors";
import { createFamilyAlerts } from "../src/family-alerts";
import { createFamilyEntryRoutes } from "../src/routes/family-entries";
import { createFamilyReceiptRoutes } from "../src/routes/family-receipts";
import { createTransactionRoutes } from "../src/routes/transactions";
import type { AppEnvironment, Bindings } from "../src/types";
import { createD1TestDatabase } from "./helpers/d1-test-harness";
import { createMemoryR2 } from "./helpers/memory-r2";

const FAMILY = "family:dela-cruz";
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const databases: DatabaseSync[] = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

/** Mama owns the family, Kuya is a member, and Lola views it. */
async function setup() {
  const { binding, database } = createD1TestDatabase();
  databases.push(database);
  const { objects, bucket } = createMemoryR2();
  const env = { DB: binding, RECEIPTS: bucket } as unknown as Bindings;
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
  app.route(
    "/api/app/transactions",
    createTransactionRoutes(transactionRepository, {
      journal: familyJournal,
      alerts: createFamilyAlerts({ notify: async () => undefined }),
    }),
  );
  app.route("/api/app/family/transactions", createFamilyEntryRoutes(familyJournal));
  app.route("/api/app/family/receipts", createFamilyReceiptRoutes(familyReceiptRepository));
  app.onError((error, context) =>
    error instanceof HttpError
      ? context.json({ error: error.code }, error.status)
      : context.json({ error: String(error) }, 500),
  );

  const call = (user: string, method: string, path: string, body?: BodyInit) =>
    app.request(
      path,
      {
        method,
        headers: { Authorization: `Bearer ${user}`, [WORKSPACE_HEADER]: FAMILY },
        ...(body === undefined ? {} : { body }),
      },
      env,
    );
  const addRice = async (user: string) =>
    (await (
      await app.request(
        "/api/app/transactions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${user}`,
            "Content-Type": "application/json",
            [WORKSPACE_HEADER]: FAMILY,
          },
          body: JSON.stringify({
            kind: "expense",
            date: "2026-10-17",
            description: "Rice",
            amountMinor: 50_000,
            currency: "PHP",
            accountId: defaultAccountIdForTenant(FAMILY),
            categoryId: defaultCategoryIdForTenant(FAMILY, "food"),
          }),
        },
        env,
      )
    ).json()) as TransactionListItem;
  const upload = (
    user: string,
    transactionId: string | string[],
    bytes: Uint8Array<ArrayBuffer> = PNG,
  ) => {
    const form = new FormData();
    for (const id of [transactionId].flat()) form.append("transactionId", id);
    form.set("file", new File([bytes], "receipt.png", { type: "image/png" }));
    return call(user, "POST", "/api/app/family/receipts", form);
  };
  return { env, database, objects, call, addRice, upload };
}

describe("family receipt photos", () => {
  it("lets whoever may edit the entry attach one photo, and every member see it", async () => {
    const { objects, call, addRice, upload } = await setup();
    const kuyas = await addRice("kuya");
    const mamas = await addRice("mama");

    const first = await upload("kuya", kuyas.id);
    const replaced = await upload("mama", kuyas.id);
    const seen = await call("lola", "GET", `/api/app/family/receipts/${kuyas.id}`);

    expect([first.status, replaced.status]).toEqual([204, 204]);
    expect((await upload("kuya", mamas.id)).status).toBe(403);
    expect((await upload("lola", kuyas.id)).status).toBe(403);
    expect((await upload("kuya", kuyas.id, new Uint8Array([1, 2, 3, 4]))).status).toBe(415);
    expect(seen.status).toBe(200);
    expect(seen.headers.get("Content-Type")).toBe("image/png");
    expect(new Uint8Array(await seen.arrayBuffer())).toEqual(PNG);
    // Replacing the photo removed the first object.
    expect(objects.size).toBe(1);
  });

  it("comes back with a restored entry and is purged once the entry can't be restored", async () => {
    const { env, database, objects, call, addRice, upload } = await setup();
    const rice = await addRice("kuya");
    await upload("kuya", rice.id);

    await call("kuya", "DELETE", `/api/app/transactions/${rice.id}`);
    const whileDeleted = await call("mama", "GET", `/api/app/family/receipts/${rice.id}`);
    const keptForRestore = await familyReceiptRepository.purgeExpired(env, 10);
    await call("kuya", "POST", `/api/app/family/transactions/${rice.id}/restore`);
    const restored = await call("mama", "GET", `/api/app/family/receipts/${rice.id}`);

    await call("kuya", "DELETE", `/api/app/transactions/${rice.id}`);
    database
      .prepare("UPDATE family_transaction_events SET created_at = '2000-01-01T00:00:00.000Z'")
      .run();
    const purged = await familyReceiptRepository.purgeExpired(env, 10);

    expect(whileDeleted.status).toBe(404);
    expect(keptForRestore).toBe(0);
    expect(restored.status).toBe(200);
    expect(purged).toBe(1);
    expect(objects.size).toBe(0);
    expect(database.prepare("SELECT COUNT(*) AS count FROM family_receipts").get()).toEqual({
      count: 0,
    });
  });

  it("is deleted with a closed family", async () => {
    const { env, database, objects, addRice, upload } = await setup();
    await upload("mama", (await addRice("mama")).id);
    database
      .prepare(
        "INSERT INTO family_closures (tenant_id, closed_by, purge_after) VALUES (?, 'mama', '2000-01-01T00:00:00.000Z')",
      )
      .run(FAMILY);

    await familyRepository.purgeClosed(env, 5);

    expect(objects.size).toBe(0);
  });

  it("stores one photo for the entries of one scan and keeps it until the last one lets go", async () => {
    const { objects, call, addRice, upload } = await setup();
    const rice = await addRice("kuya");
    const eggs = await addRice("kuya");

    const shared = await upload("kuya", [rice.id, eggs.id]);
    const storedOnce = objects.size;
    await call("kuya", "DELETE", `/api/app/family/receipts/${rice.id}`);
    const stillOnEggs = await call("lola", "GET", `/api/app/family/receipts/${eggs.id}`);
    await call("kuya", "DELETE", `/api/app/family/receipts/${eggs.id}`);

    expect(shared.status).toBe(204);
    expect(storedOnce).toBe(1);
    expect(stillOnEggs.status).toBe(200);
    expect(objects.size).toBe(0);
  });
});
