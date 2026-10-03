import { afterEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app";
import { petRepository } from "../src/db/pet";
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
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
// 2026-10-03 09:00 in Manila.
const T0 = Date.UTC(2026, 9, 3, 1);

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
  const database = created.database;
  return { call, env, database };
}

type Harness = ReturnType<typeof createHarness>;

/** Creates Alice's workspace through the API and returns its tenant id. */
async function aliceTenant({ call, database }: Harness) {
  await call("/api/app/pet", ALICE);
  return (database.prepare("SELECT id FROM tenants").get() as { id: string }).id;
}

/** Picks an egg at T0 and opens the app on seven consecutive days; the last one hatches it. */
async function hatch(harness: Harness, tenantId: string) {
  await petRepository.chooseEgg(harness.env, tenantId, "panda", new Date(T0));
  for (let day = 0; day < 7; day += 1) {
    await petRepository.checkIn(harness.env, tenantId, new Date(T0 + day * DAY));
  }
  return T0 + 6 * DAY;
}

const iso = (at: number) => new Date(at).toISOString();

function seedCategory(database: Harness["database"], tenantId: string, systemKey: string | null) {
  const existing = database
    .prepare("SELECT id FROM categories WHERE tenant_id = ? AND system_key IS ?")
    .get(tenantId, systemKey) as { id: string } | undefined;
  if (existing) return existing.id;
  const id = `${tenantId}:${systemKey ?? "plain"}`;
  database
    .prepare(
      "INSERT INTO categories (id, tenant_id, name, kind, color, system_key) VALUES (?, ?, ?, 'expense', '#000000', ?)",
    )
    .run(id, tenantId, id, systemKey);
  return id;
}

function seedTransaction(
  database: Harness["database"],
  tenantId: string,
  at: number,
  overrides: { amount?: number; source?: string; debtId?: string; category?: string } = {},
) {
  database
    .prepare(
      `INSERT INTO transactions (id, tenant_id, category_id, date, description, amount_minor, kind,
         source_kind, debt_id, created_at)
       VALUES (?, ?, ?, ?, 'Lunch', ?, 'expense', ?, ?, ?)`,
    )
    .run(
      crypto.randomUUID(),
      tenantId,
      overrides.category ?? seedCategory(database, tenantId, null),
      iso(at + 8 * HOUR).slice(0, 10),
      overrides.amount ?? -15_000,
      overrides.source ?? "manual",
      overrides.debtId ?? null,
      iso(at),
    );
}

describe("pet routes", () => {
  it("starts with no egg, enabled, and is scoped to each workspace", async () => {
    const { call } = createHarness();
    const response = await call("/api/app/pet", ALICE);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      enabled: true,
      species: null,
      stage: "egg",
      eggStreakDays: 0,
      eggHatchDays: 7,
      health: null,
    });

    expect((await call("/api/app/pet/egg", ALICE, "PUT", { species: "hippo" })).status).toBe(200);
    expect(await (await call("/api/app/pet", ALICE)).json()).toMatchObject({ species: "hippo" });
    expect(await (await call("/api/app/pet", BOB)).json()).toMatchObject({ species: null });
  });

  it("validates the egg and refuses a second one", async () => {
    const { call } = createHarness();
    expect((await call("/api/app/pet/egg", ALICE, "PUT", { species: "dragon" })).status).toBe(400);
    expect(
      (await call("/api/app/pet/egg", ALICE, "PUT", { species: "pig", tenantId: "bob" })).status,
    ).toBe(400);
    await call("/api/app/pet/egg", ALICE, "PUT", { species: "pig" });
    expect((await call("/api/app/pet/egg", ALICE, "PUT", { species: "panda" })).status).toBe(409);
  });

  it("counts a check-in toward the egg streak", async () => {
    const { call } = createHarness();
    await call("/api/app/pet/egg", ALICE, "PUT", { species: "pig" });
    const response = await call("/api/app/pet/check-in", ALICE, "POST");
    expect(await response.json()).toMatchObject({ stage: "egg", eggStreakDays: 1 });
  });
});

describe("pet activity", () => {
  it("hatches after seven consecutive check-ins and resets after a missed day", async () => {
    const harness = createHarness();
    const tenantId = await aliceTenant(harness);
    await petRepository.chooseEgg(harness.env, tenantId, "pig", new Date(T0));
    for (const day of [0, 1, 2, 4]) {
      await petRepository.checkIn(harness.env, tenantId, new Date(T0 + day * DAY));
    }
    const reset = await petRepository.get(harness.env, tenantId, new Date(T0 + 4 * DAY));
    expect(reset).toMatchObject({ stage: "egg", eggStreakDays: 1 });

    const second = await createHarness();
    const secondTenant = await aliceTenant(second);
    await hatch(second, secondTenant);
    const view = await petRepository.get(second.env, secondTenant, new Date(T0 + 6 * DAY + HOUR));
    expect(view).toMatchObject({ stage: "baby", points: 0, health: 100, healthState: "healthy" });
  });

  it("credits recorded activity with caps and skips what should not earn", async () => {
    const harness = createHarness();
    const { database, env } = harness;
    const tenantId = await aliceTenant(harness);
    const hatchedAt = await hatch(harness, tenantId);
    const at = hatchedAt + HOUR;

    // Five transactions eleven minutes apart: three count.
    for (let i = 0; i < 5; i += 1)
      seedTransaction(database, tenantId, at + i * 60_000 * 11, { amount: -100 - i });
    // A repeat of the first within ten minutes, an import, and an opening balance earn nothing.
    seedTransaction(database, tenantId, at + 60_000, { amount: -100 });
    seedTransaction(database, tenantId, at, { amount: -999, source: "import" });
    seedTransaction(database, tenantId, at, {
      amount: 500_000,
      category: seedCategory(database, tenantId, "opening:income"),
    });

    const view = await petRepository.get(env, tenantId, new Date(at + 2 * HOUR));
    expect(view).toMatchObject({ points: 30, pointsToday: 30 });

    // Reading again credits nothing twice.
    expect(await petRepository.get(env, tenantId, new Date(at + 3 * HOUR))).toMatchObject({
      points: 30,
    });
  });

  it("credits debt payments, subscriptions, and assistant replies", async () => {
    const harness = createHarness();
    const { database, env } = harness;
    const tenantId = await aliceTenant(harness);
    const hatchedAt = await hatch(harness, tenantId);
    const at = hatchedAt + HOUR;
    const category = seedCategory(database, tenantId, null);

    database
      .prepare(
        `INSERT INTO debts (id, tenant_id, name, type, balance_minor, apr_basis_points,
           minimum_payment_minor, balance_as_of) VALUES ('d', ?, 'Card', 'credit_card', 100, 0, 0, '2026-01-01')`,
      )
      .run(tenantId);
    seedTransaction(database, tenantId, at, { debtId: "d" });
    for (const name of ["Netflix", "netflix "]) {
      database
        .prepare(
          `INSERT INTO subscriptions (id, tenant_id, category_id, name, amount_minor, billing_cycle,
             next_billing_date, created_at) VALUES (?, ?, ?, ?, 54900, 'monthly', '2026-11-01', ?)`,
        )
        .run(crypto.randomUUID(), tenantId, category, name, iso(at + 60_000));
    }
    database
      .prepare(
        `INSERT INTO assistant_threads (id, tenant_id, title, last_message_at, retention_expires_at)
         VALUES ('th', ?, 'Chat', ?, '2027-01-01')`,
      )
      .run(tenantId, iso(at));
    const message = database.prepare(
      `INSERT INTO assistant_messages (id, tenant_id, thread_id, role, content, status,
         reply_to_message_id, created_at) VALUES (?, ?, 'th', ?, ?, ?, ?, ?)`,
    );
    message.run(
      "u1",
      tenantId,
      "user",
      "How much did I spend on food?",
      "completed",
      null,
      iso(at),
    );
    message.run("a1", tenantId, "assistant", "Reply", "completed", "u1", iso(at + 1000));
    message.run("u2", tenantId, "user", "hi", "completed", null, iso(at));
    message.run("a2", tenantId, "assistant", "Hello", "completed", "u2", iso(at + 2000));

    // 20 debt + 15 subscription + 5 assistant, plus the variety bonus for three action types.
    expect(await petRepository.get(env, tenantId, new Date(at + HOUR))).toMatchObject({
      points: 50,
    });
  });

  it("eats points to heal and dies after 72 hours, then waits for a new egg", async () => {
    const harness = createHarness();
    const { env } = harness;
    const tenantId = await aliceTenant(harness);
    const hatchedAt = await hatch(harness, tenantId);

    expect(await petRepository.get(env, tenantId, new Date(hatchedAt + 36 * HOUR))).toMatchObject({
      healthState: "sick",
      health: 75,
    });
    const dead = await petRepository.get(env, tenantId, new Date(hatchedAt + 72 * HOUR));
    expect(dead).toMatchObject({ species: null, stage: "egg", diedAt: iso(hatchedAt + 72 * HOUR) });

    const egg = await petRepository.chooseEgg(
      env,
      tenantId,
      "hippo",
      new Date(hatchedAt + 73 * HOUR),
    );
    expect(egg).toMatchObject({ species: "hippo", diedAt: null, eggStreakDays: 0 });
  });

  it("pauses the clock while turned off and restarts it when turned back on", async () => {
    const harness = createHarness();
    const { env } = harness;
    const tenantId = await aliceTenant(harness);
    const hatchedAt = await hatch(harness, tenantId);

    await petRepository.setEnabled(env, tenantId, false, new Date(hatchedAt + HOUR));
    const off = await petRepository.get(env, tenantId, new Date(hatchedAt + 10 * DAY));
    expect(off).toMatchObject({ enabled: false, species: "panda", healthState: "healthy" });

    const on = await petRepository.setEnabled(env, tenantId, true, new Date(hatchedAt + 10 * DAY));
    expect(on).toMatchObject({ enabled: true, species: "panda", health: 100 });
    expect(
      await petRepository.get(env, tenantId, new Date(hatchedAt + 10 * DAY + 30 * HOUR)),
    ).toMatchObject({ healthState: "sick" });
  });
});
