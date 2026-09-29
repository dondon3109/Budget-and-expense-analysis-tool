import { afterEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app";
import type { Bindings } from "../src/types";
import { createAllowedBillingRepository } from "./helpers/app-fakes";
import { createD1TestDatabase } from "./helpers/d1-test-harness";
import { allowedRateLimiter } from "./helpers/rate-limiter";

const databases: Array<{ close(): void }> = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

const ALICE = { Authorization: "Bearer alice", "Content-Type": "application/json" };
const BOB = { Authorization: "Bearer bob", "Content-Type": "application/json" };
const TODAY = new Date().toISOString().slice(0, 10);

// The real app over a real (SQLite) D1: real tenant bootstrap, gate, repositories, and SQL.
function createHarness() {
  const created = createD1TestDatabase();
  databases.push(created.database);
  const env = { DB: created.binding } as unknown as Bindings;
  const app = createApp({
    readinessCheck: vi.fn().mockResolvedValue(undefined),
    authVerifier: {
      verify: vi.fn(async (_env, token) => ({ id: token, email: `${token}@example.com` })),
    },
    rateLimiter: allowedRateLimiter(),
    billing: createAllowedBillingRepository(),
  });
  const call = (path: string, headers: Record<string, string>, method = "GET", body?: unknown) =>
    app.request(
      path,
      { method, headers, body: body === undefined ? undefined : JSON.stringify(body) },
      env,
    );
  const rows = (sql: string, ...values: Array<string | number>) =>
    created.database.prepare(sql).all(...values) as Array<Record<string, unknown>>;
  return { call, rows, database: created.database };
}

async function json(response: Response) {
  return (await response.json()) as Record<string, unknown>;
}

async function finishOnboarding(
  call: ReturnType<typeof createHarness>["call"],
  headers: Record<string, string>,
  currency: string,
  amountMinor: number,
) {
  await call("/api/app/onboarding/currency", headers, "POST", { currency });
  return call("/api/app/onboarding/cash-balance", headers, "POST", { amountMinor, date: TODAY });
}

describe("onboarding gate", () => {
  it("blocks data routes until onboarding completes and then opens them", async () => {
    const { call } = createHarness();

    const blocked = await call("/api/app/accounts", ALICE);
    expect(blocked.status).toBe(403);
    expect((await json(blocked)).error).toBe("onboarding_required");
    expect((await call("/api/app/dashboard?from=2026-09-01&to=2026-09-30", ALICE)).status).toBe(
      403,
    );

    // The routes the onboarding screens and the web shell need stay open.
    expect((await call("/api/app/me", ALICE)).status).toBe(200);
    expect((await call("/api/app/settings", ALICE)).status).toBe(200);
    expect(await json(await call("/api/app/onboarding", ALICE))).toEqual({
      step: "currency",
      currency: "PHP",
    });

    expect((await finishOnboarding(call, ALICE, "PHP", 0)).status).toBe(200);
    expect((await call("/api/app/accounts", ALICE)).status).toBe(200);
  });

  it("leaves the routes the native apps use open before onboarding", async () => {
    const { call } = createHarness();
    for (const path of [
      "/api/app/billing",
      "/api/app/sync/status",
      "/api/app/assistant/threads",
      "/api/app/imports",
    ]) {
      const response = await call(path, ALICE);
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      expect(body.error, path).not.toBe("onboarding_required");
    }
  });

  it("gates each user on their own onboarding state", async () => {
    const { call } = createHarness();
    await finishOnboarding(call, ALICE, "PHP", 0);

    expect((await call("/api/app/accounts", ALICE)).status).toBe(200);
    expect((await call("/api/app/accounts", BOB)).status).toBe(403);
  });
});

describe("onboarding validation", () => {
  it("rejects an unsupported currency and never stores it", async () => {
    const { call } = createHarness();
    for (const currency of ["EUR", "php", "", 5, null]) {
      const response = await call("/api/app/onboarding/currency", ALICE, "POST", { currency });
      expect(response.status).toBe(400);
    }
    expect(await json(await call("/api/app/onboarding", ALICE))).toEqual({
      step: "currency",
      currency: "PHP",
    });
  });

  it("rejects an invalid amount or date before any account or entry is written", async () => {
    const { call, rows } = createHarness();
    await call("/api/app/onboarding/currency", ALICE, "POST", { currency: "PHP" });

    // A syntactically valid date years away is refused too: it would move historical balances.
    const invalid = [
      { amountMinor: -1, date: TODAY },
      { amountMinor: 1.5, date: TODAY },
      { amountMinor: "100", date: TODAY },
      { amountMinor: null, date: TODAY },
      { amountMinor: 1_000_000_000_01, date: TODAY },
      { amountMinor: 100, date: "29/09/2026" },
      { amountMinor: 100, date: "2026-02-30" },
      { amountMinor: 100, date: "2020-01-01" },
      { amountMinor: 100 },
      { amountMinor: 100, date: TODAY, tenantId: "user:bob" },
    ];
    for (const body of invalid) {
      const response = await call("/api/app/onboarding/cash-balance", ALICE, "POST", body);
      expect(response.status, JSON.stringify(body)).toBe(400);
    }
    expect(rows("SELECT id FROM transactions")).toHaveLength(0);
    expect((await json(await call("/api/app/onboarding", ALICE))).step).toBe("cash");
  });

  it("accepts a date a day either side of today and refuses three days out", async () => {
    const { call } = createHarness();
    await call("/api/app/onboarding/currency", ALICE, "POST", { currency: "PHP" });
    const offset = (days: number) =>
      new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
    const submit = (date: string) =>
      call("/api/app/onboarding/cash-balance", ALICE, "POST", { amountMinor: 0, date });

    expect((await submit(offset(3))).status).toBe(400);
    expect((await submit(offset(-3))).status).toBe(400);
    expect((await submit(offset(-1))).status).toBe(200);
  });

  it("requires the currency step before the cash step", async () => {
    const { call } = createHarness();
    const response = await call("/api/app/onboarding/cash-balance", ALICE, "POST", {
      amountMinor: 100,
      date: TODAY,
    });
    expect(response.status).toBe(409);
    expect((await json(response)).error).toBe("onboarding_step_out_of_order");
  });
});

describe("cash step", () => {
  it("books the opening balance on the Cash account in the chosen currency", async () => {
    const { call, rows } = createHarness();
    expect((await finishOnboarding(call, ALICE, "USD", 12_345)).status).toBe(200);

    expect(rows("SELECT name, currency FROM accounts ORDER BY name")).toEqual([
      { name: "Bank", currency: "USD" },
      { name: "Cash", currency: "USD" },
      { name: "GCash", currency: "USD" },
    ]);
    expect(rows("SELECT account_id, amount_minor, currency, kind, date FROM transactions")).toEqual(
      [
        {
          account_id: "user:alice:account:default",
          amount_minor: 12_345,
          currency: "USD",
          kind: "income",
          date: TODAY,
        },
      ],
    );
    const accounts = (await json(await call("/api/app/accounts", ALICE))).items as Array<{
      name: string;
      balanceMinor: number;
    }>;
    expect(accounts.find((account) => account.name === "Cash")?.balanceMinor).toBe(12_345);
  });

  it("books no opening entry on a workspace that already has entries", async () => {
    const { call, rows, database } = createHarness();
    await call("/api/app/onboarding/currency", ALICE, "POST", { currency: "PHP" });
    database.exec(`INSERT INTO transactions (id, tenant_id, account_id, category_id, date,
      description, amount_minor, currency, kind, source_kind) VALUES ('synced', 'user:alice',
      'user:alice:account:default', 'user:alice:category:uncategorized-income', '2026-09-01',
      'Synced', 9000, 'PHP', 'income', 'manual')`);

    expect(
      (
        await call("/api/app/onboarding/cash-balance", ALICE, "POST", {
          amountMinor: 5_000,
          date: TODAY,
        })
      ).status,
    ).toBe(200);
    expect(rows("SELECT id FROM transactions")).toEqual([{ id: "synced" }]);
    expect((await json(await call("/api/app/onboarding", ALICE))).step).toBe("complete");
  });

  it("ignores deleted entries when deciding whether the workspace has data", async () => {
    const { call, rows, database } = createHarness();
    await call("/api/app/onboarding/currency", ALICE, "POST", { currency: "PHP" });
    database.exec(`INSERT INTO transactions (id, tenant_id, account_id, category_id, date,
      description, amount_minor, currency, kind, source_kind, deleted_at) VALUES ('gone',
      'user:alice', 'user:alice:account:default', 'user:alice:category:uncategorized-income',
      '2026-09-01', 'Deleted', 9000, 'PHP', 'income', 'manual', datetime('now'))`);

    await call("/api/app/onboarding/cash-balance", ALICE, "POST", {
      amountMinor: 5_000,
      date: TODAY,
    });
    expect(rows("SELECT id FROM transactions WHERE deleted_at IS NULL")).toHaveLength(1);
  });

  it("creates the opening-balance category for a workspace that lacks it", async () => {
    const { call, rows, database } = createHarness();
    await call("/api/app/onboarding/currency", ALICE, "POST", { currency: "PHP" });
    // A workspace the previous Worker bootstrapped after migration 0069 has no such row.
    database.exec("DELETE FROM categories WHERE system_key = 'opening:income'");

    const response = await call("/api/app/onboarding/cash-balance", ALICE, "POST", {
      amountMinor: 5_000,
      date: TODAY,
    });
    expect(response.status).toBe(200);
    expect(rows("SELECT id, archived FROM categories WHERE system_key = 'opening:income'")).toEqual(
      [{ id: "user:alice:category:opening-balance", archived: 1 }],
    );
    expect(rows("SELECT amount_minor FROM transactions")).toEqual([{ amount_minor: 5_000 }]);
  });

  it("creates no entry for a zero balance but still completes", async () => {
    const { call, rows } = createHarness();
    expect((await finishOnboarding(call, ALICE, "PHP", 0)).status).toBe(200);
    expect(rows("SELECT id FROM transactions")).toHaveLength(0);
    expect((await json(await call("/api/app/onboarding", ALICE))).step).toBe("complete");
  });

  it("is idempotent under a double submit, a retry, and a refresh", async () => {
    const { call, rows } = createHarness();
    await call("/api/app/onboarding/currency", ALICE, "POST", { currency: "PHP" });
    const submit = () =>
      call("/api/app/onboarding/cash-balance", ALICE, "POST", { amountMinor: 5_000, date: TODAY });

    const [first, second] = await Promise.all([submit(), submit()]);
    expect([first.status, second.status]).toEqual([200, 200]);
    const retry = await submit();
    expect(retry.status).toBe(409);
    expect((await json(retry)).error).toBe("onboarding_complete");

    expect(rows("SELECT id FROM transactions")).toHaveLength(1);
    expect(rows("SELECT id FROM accounts WHERE name = 'Cash'")).toHaveLength(1);
    expect((await json(await call("/api/app/onboarding", ALICE))).step).toBe("complete");
  });

  it("lets the user go back and change the currency before finishing", async () => {
    const { call } = createHarness();
    await call("/api/app/onboarding/currency", ALICE, "POST", { currency: "USD" });
    const back = await call("/api/app/onboarding/currency", ALICE, "POST", { currency: "PHP" });
    expect(await json(back)).toEqual({ step: "cash", currency: "PHP" });
  });

  it("rejects both onboarding writes once onboarding is complete", async () => {
    const { call, rows } = createHarness();
    await finishOnboarding(call, ALICE, "PHP", 100);

    const currency = await call("/api/app/onboarding/currency", ALICE, "POST", {
      currency: "USD",
    });
    expect(currency.status).toBe(409);
    expect((await json(await call("/api/app/settings", ALICE))).currency).toBe("PHP");

    const cash = await call("/api/app/onboarding/cash-balance", ALICE, "POST", {
      amountMinor: 900,
      date: TODAY,
    });
    expect(cash.status).toBe(409);
    expect((await json(cash)).error).toBe("onboarding_complete");
    expect(rows("SELECT amount_minor FROM transactions")).toEqual([{ amount_minor: 100 }]);
  });
});

describe("user scoping", () => {
  it("keeps each user's state, accounts, and entries separate", async () => {
    const { call, rows } = createHarness();
    await finishOnboarding(call, ALICE, "USD", 10_000);

    // Bob is untouched by Alice's progress, and a tenant id in the body is refused.
    expect(await json(await call("/api/app/onboarding", BOB))).toEqual({
      step: "currency",
      currency: "PHP",
    });
    const forged = await call("/api/app/onboarding/currency", BOB, "POST", {
      currency: "USD",
      tenantId: "user:alice",
    });
    expect(forged.status).toBe(400);

    await finishOnboarding(call, BOB, "PHP", 777);
    expect(
      rows("SELECT tenant_id, amount_minor, currency FROM transactions ORDER BY tenant_id"),
    ).toEqual([
      { tenant_id: "user:alice", amount_minor: 10_000, currency: "USD" },
      { tenant_id: "user:bob", amount_minor: 777, currency: "PHP" },
    ]);
    expect(await json(await call("/api/app/settings", ALICE))).toEqual({ currency: "USD" });
    expect(await json(await call("/api/app/settings", BOB))).toEqual({ currency: "PHP" });
  });
});

describe("opening balance in income figures", () => {
  it("adds to the balance but is not counted as income on the dashboard or trend", async () => {
    const { call, rows } = createHarness();
    await finishOnboarding(call, ALICE, "PHP", 5_000_000);
    const month = TODAY.slice(0, 7);

    const dashboard = await json(
      await call(`/api/app/dashboard?from=${month}-01&to=${month}-28`, ALICE),
    );
    const metrics = dashboard.metrics as { moneyInMinor: number };
    expect(metrics.moneyInMinor).toBe(0);
    const balances = dashboard.accountBalances as { balancesByCurrency: { PHP: number } };
    expect(balances.balancesByCurrency.PHP).toBe(5_000_000);

    const trend = await json(
      await call(`/api/app/dashboard/cashflow-trend?view=weekly&anchorDate=${TODAY}`, ALICE),
    );
    const points = trend.points as Array<{ incomeMinor: number }>;
    expect(points.reduce((sum, point) => sum + point.incomeMinor, 0)).toBe(0);

    // The entry sits in the archived system category, so no picker offers it.
    expect(
      rows(
        `SELECT c.system_key AS key, c.archived FROM transactions t
         JOIN categories c ON c.id = t.category_id`,
      ),
    ).toEqual([{ key: "opening:income", archived: 1 }]);
  });
});

describe("editing the opening balance", () => {
  it("lets the user correct the amount even though its category is archived", async () => {
    const { call } = createHarness();
    await finishOnboarding(call, ALICE, "PHP", 5_000);
    const listed = await json(await call("/api/app/transactions", ALICE));
    const entry = (
      listed.items as Array<{ id: string; categoryId: string; accountId: string }>
    )[0]!;

    const edited = await call(`/api/app/transactions/${entry.id}`, ALICE, "PATCH", {
      kind: "income",
      accountId: entry.accountId,
      categoryId: entry.categoryId,
      date: TODAY,
      description: "Opening cash balance",
      amountMinor: 7_500,
      currency: "PHP",
    });
    expect(edited.status).toBe(200);
    expect((await json(edited)).amountMinor).toBe(7_500);
  });

  it("gives the category a distinct name when the user already has one called Opening balance", async () => {
    const { call, rows, database } = createHarness();
    await call("/api/app/onboarding/currency", ALICE, "POST", { currency: "PHP" });
    database.exec("DELETE FROM categories WHERE system_key = 'opening:income'");
    database.exec(`INSERT INTO categories (id, tenant_id, name, kind, color, required_plan)
      VALUES ('mine', 'user:alice', 'Opening balance', 'income', '#123456', 'free')`);

    const response = await call("/api/app/onboarding/cash-balance", ALICE, "POST", {
      amountMinor: 5_000,
      date: TODAY,
    });
    expect(response.status).toBe(200);
    expect(rows("SELECT name FROM categories WHERE system_key = 'opening:income'")).toEqual([
      { name: "Opening balance (Zoption)" },
    ]);
    expect(rows("SELECT amount_minor FROM transactions")).toEqual([{ amount_minor: 5_000 }]);
  });
});

describe("base currency source", () => {
  it("is the same value onboarding and Account Settings write and read", async () => {
    const { call, rows } = createHarness();

    await call("/api/app/onboarding/currency", ALICE, "POST", { currency: "USD" });
    expect(await json(await call("/api/app/settings", ALICE))).toEqual({ currency: "USD" });
    expect(rows("SELECT currency FROM tenants WHERE id = 'user:alice'")).toEqual([
      { currency: "USD" },
    ]);

    // Account Settings stays open during onboarding and is read back by the onboarding state.
    await call("/api/app/settings", ALICE, "PUT", { currency: "PHP" });
    expect(await json(await call("/api/app/onboarding", ALICE))).toEqual({
      step: "cash",
      currency: "PHP",
    });
  });
});

describe("changing currency in Account Settings after onboarding", () => {
  it("treats the onboarding Cash account like any other account", async () => {
    const { call } = createHarness();
    await finishOnboarding(call, ALICE, "PHP", 10_000);

    // A normally created account with an entry of its own.
    const created = await json(
      await call("/api/app/accounts", ALICE, "POST", { name: "Wallet", type: "cash" }),
    );
    await call("/api/app/transactions", ALICE, "POST", {
      kind: "income",
      accountId: created.id,
      categoryId: "user:alice:category:uncategorized-income",
      date: TODAY,
      description: "Seed",
      amountMinor: 10_000,
      currency: "PHP",
    });

    const snapshot = async () => {
      const items = (await json(await call("/api/app/accounts", ALICE))).items as Array<{
        name: string;
        currency: string;
        balanceMinor: number;
        balancesByCurrency: unknown;
      }>;
      const pick = (name: string) => {
        const { currency, balanceMinor, balancesByCurrency } = items.find(
          (item) => item.name === name,
        )!;
        return { currency, balanceMinor, balancesByCurrency };
      };
      return { cash: pick("Cash"), wallet: pick("Wallet") };
    };

    const before = await snapshot();
    expect(before.cash).toEqual(before.wallet);
    expect((await call("/api/app/settings", ALICE, "PUT", { currency: "USD" })).status).toBe(200);
    const after = await snapshot();

    // Settings relabels only: neither account's currency or amount moved, and they still match.
    expect(after).toEqual(before);
    const next = await json(
      await call("/api/app/accounts", ALICE, "POST", { name: "New", type: "cash" }),
    );
    expect(next.currency).toBe("USD");
  });
});

describe("0069_opening_balance_category backfill", () => {
  it("gives every existing workspace the archived opening-balance category once", () => {
    const { database } = createD1TestDatabase({
      beforeMigration({ database: migrating, name }) {
        if (name !== "0069_opening_balance_category.sql") return;
        migrating.exec(
          "INSERT INTO tenants (id, kind, name) VALUES ('old-a', 'user', 'A'), ('old-b', 'user', 'B')",
        );
        // old-b already has its own income category with that name; names are unique per kind.
        migrating.exec(`INSERT INTO categories (id, tenant_id, name, kind, color, required_plan)
          VALUES ('mine', 'old-b', 'Opening balance', 'income', '#123456', 'free')`);
      },
    });
    databases.push(database);

    expect(
      database
        .prepare(
          "SELECT id, tenant_id, archived FROM categories WHERE system_key = 'opening:income' ORDER BY id",
        )
        .all(),
    ).toEqual([
      { id: "old-a:category:opening-balance", tenant_id: "old-a", archived: 1 },
      { id: "old-b:category:opening-balance", tenant_id: "old-b", archived: 1 },
    ]);
    expect(
      database
        .prepare("SELECT name FROM categories WHERE id = 'old-b:category:opening-balance'")
        .get(),
    ).toEqual({ name: "Opening balance (Zoption)" });
  });
});

describe("0068_onboarding_step backfill", () => {
  it("marks every existing workspace complete, keeps its currency, and leaves new ones to onboard", () => {
    const { database } = createD1TestDatabase({
      beforeMigration({ database: migrating, name }) {
        if (name !== "0068_onboarding_step.sql") return;
        migrating.exec(`
          INSERT INTO tenants (id, kind, name, currency) VALUES ('existing-php', 'user', 'A', 'PHP');
          INSERT INTO tenants (id, kind, name, currency) VALUES ('existing-usd', 'user', 'B', 'USD');
        `);
      },
    });
    databases.push(database);
    database.exec("INSERT INTO tenants (id, kind, name) VALUES ('brand-new', 'user', 'C')");

    expect(
      database
        .prepare("SELECT id, currency, onboarding_step AS step FROM tenants ORDER BY id")
        .all(),
    ).toEqual([
      { id: "brand-new", currency: "PHP", step: "currency" },
      { id: "existing-php", currency: "PHP", step: "complete" },
      { id: "existing-usd", currency: "USD", step: "complete" },
    ]);
  });
});
