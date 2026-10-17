import type { DatabaseSync } from "node:sqlite";

import { publicShareLinkSchema, shareLinkCreatedSchema } from "@zoption/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

import { accountRepository } from "../src/db/accounts";
import { createShareLinkRepository } from "../src/db/share-links";
import { HttpError } from "../src/errors";
import { createPublicShareLinkRoutes, createShareLinkRoutes } from "../src/routes/share-links";
import type { Bindings } from "../src/types";
import { createD1TestDatabase } from "./helpers/d1-test-harness";
import { createTestApp } from "./helpers/test-app";

const TENANT = "user:owner";
const OTHER_TENANT = "user:other";
const databases: DatabaseSync[] = [];

afterEach(() => {
  vi.useRealTimers();
  for (const database of databases.splice(0)) database.close();
});

function setup() {
  const { binding, database } = createD1TestDatabase();
  databases.push(database);
  for (const tenant of [TENANT, OTHER_TENANT]) {
    database.prepare("INSERT INTO tenants (id, kind, name) VALUES (?, 'user', 'One')").run(tenant);
  }
  database.exec(`
    INSERT INTO accounts (id, tenant_id, name, type, currency)
      VALUES ('account-bpi', '${TENANT}', 'BPI Savings 1234', 'bank', 'PHP');
    INSERT INTO categories (id, tenant_id, name, kind, color)
      VALUES ('category-food', '${TENANT}', 'Food', 'expense', '#123456'),
             ('category-other', '${OTHER_TENANT}', 'Food', 'expense', '#123456');
    INSERT INTO transactions (id, tenant_id, account_id, category_id, date, description, amount_minor, kind, notes)
      VALUES ('tx-lunch', '${TENANT}', 'account-bpi', 'category-food', '2026-10-15', 'Jollibee', -25000, 'expense', 'Team lunch'),
             ('tx-salary', '${TENANT}', 'account-bpi', 'category-food', '2026-10-01', 'Payroll', 4000000, 'income', NULL),
             ('tx-theirs', '${OTHER_TENANT}', NULL, 'category-other', '2026-10-15', 'Secret', -100, 'expense', NULL);
  `);
  const env = { DB: binding, PUBLIC_SITE_URL: "https://zoption.site" } as unknown as Bindings;
  return { env, database, shares: createShareLinkRepository(accountRepository) };
}

const showNothing = { description: false, category: false, date: false, note: false };

describe("share link repository", () => {
  it("freezes only the chosen fields and stores a hash, never the token", async () => {
    const { env, database, shares } = setup();

    const created = await shares.create(env, TENANT, "owner", {
      kind: "transaction",
      transactionId: "tx-lunch",
      show: { ...showNothing, category: true },
      expiry: "7d",
    });

    const row = database.prepare("SELECT token_hash, snapshot_json FROM share_links").get() as {
      token_hash: string;
      snapshot_json: string;
    };
    expect(row.token_hash).toMatch(/^[0-9a-f]{64}$/u);
    expect(row.token_hash).not.toContain(created.token);
    expect(await shares.readPublic(env, created.token)).toEqual({
      snapshot: {
        kind: "transaction",
        direction: "expense",
        amountMinor: 25000,
        currency: "PHP",
        description: null,
        categoryName: "Food",
        date: null,
        note: null,
      },
      sharerName: null,
      createdAt: expect.any(String),
      expiresAt: created.expiresAt,
    });
  });

  it("snapshots an account balance without the account's name", async () => {
    const { env, shares } = setup();

    const created = await shares.create(env, TENANT, "owner", {
      kind: "balance",
      accountId: "account-bpi",
      sharerName: "  Don ",
      expiry: "never",
    });

    const share = await shares.readPublic(env, created.token);
    expect(share?.snapshot).toEqual({
      kind: "balance",
      amountMinor: 3975000,
      currency: "PHP",
      asOf: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/u),
    });
    expect(share?.sharerName).toBe("Don");
    expect(created.expiresAt).toBeNull();
    expect(JSON.stringify(share)).not.toContain("BPI");
  });

  it("cannot share another workspace's rows or a transfer", async () => {
    const { env, database, shares } = setup();
    database.exec(`
      INSERT INTO transactions (id, tenant_id, category_id, date, description, amount_minor, kind)
        VALUES ('tx-transfer', '${TENANT}', 'category-food', '2026-10-15', 'Move', -100, 'transfer');
    `);
    const share = (transactionId: string) =>
      shares.create(env, TENANT, "owner", {
        kind: "transaction",
        transactionId,
        show: showNothing,
        expiry: "24h",
      });

    await expect(share("tx-theirs")).rejects.toMatchObject({ status: 404 });
    await expect(share("tx-transfer")).rejects.toMatchObject({ status: 400 });
    await expect(
      shares.create(env, OTHER_TENANT, "other", {
        kind: "balance",
        accountId: "account-bpi",
        expiry: "24h",
      }),
    ).rejects.toBeInstanceOf(HttpError);
  });

  it("stops serving a link once revoked or expired", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-17T00:00:00.000Z"), toFake: ["Date"] });
    const { env, shares } = setup();
    const input = {
      kind: "transaction" as const,
      transactionId: "tx-salary",
      show: showNothing,
      expiry: "24h" as const,
    };
    const revoked = await shares.create(env, TENANT, "owner", input);
    const expiring = await shares.create(env, TENANT, "owner", input);

    await expect(shares.revoke(env, OTHER_TENANT, revoked.id)).rejects.toMatchObject({
      status: 404,
    });
    await shares.revoke(env, TENANT, revoked.id);
    expect(await shares.readPublic(env, revoked.token)).toBeNull();
    expect((await shares.list(env, TENANT)).map((link) => link.id)).toEqual([expiring.id]);

    vi.setSystemTime(new Date("2026-10-18T00:00:01.000Z"));
    expect(await shares.readPublic(env, expiring.token)).toBeNull();
    expect(await shares.list(env, TENANT)).toEqual([]);
  });
});

describe("share link routes", () => {
  function apps() {
    const { env, shares } = setup();
    const owner = createTestApp({
      user: { id: "owner" },
      tenant: { tenantId: TENANT, defaultAccountId: "account-bpi", onboardingComplete: true },
      env,
    });
    owner.route("/api/app/shares", createShareLinkRoutes(shares));
    const visitor = createTestApp({ env });
    visitor.route("/api/public/shares", createPublicShareLinkRoutes(shares));
    for (const app of [owner, visitor]) {
      app.onError((error, context) =>
        error instanceof HttpError
          ? context.json({ error: error.code }, error.status)
          : context.json({ error: "internal_server_error" }, 500),
      );
    }
    return { owner, visitor };
  }

  it("returns a site link with the token in the fragment, readable without auth", async () => {
    const { owner, visitor } = apps();

    const response = await owner.request("/api/app/shares", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "transaction",
        transactionId: "tx-lunch",
        show: showNothing,
        expiry: "7d",
      }),
    });
    expect(response.status).toBe(201);
    const created = shareLinkCreatedSchema.parse(await response.json());
    expect(created.url).toMatch(/^https:\/\/zoption\.site\/s#[A-Za-z0-9_-]{22}$/u);

    const token = created.url.split("#")[1];
    const read = await visitor.request(`/api/public/shares/${token}`);
    expect(read.status).toBe(200);
    expect(read.headers.get("Cache-Control")).toBe("no-store");
    expect(publicShareLinkSchema.parse(await read.json()).snapshot).toMatchObject({
      amountMinor: 25000,
    });
  });

  it("answers an unknown or malformed token with the same 404", async () => {
    const { visitor } = apps();

    for (const token of ["AAAAAAAAAAAAAAAAAAAAAA", "not-a-token"]) {
      const response = await visitor.request(`/api/public/shares/${token}`);
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: "share_link_not_found" });
    }
  });
});
