import { readFileSync } from "node:fs";

import { goalEventNames, primaryGoals } from "@zoption/shared";
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

const GOAL = "/api/app/profile/goal";

describe("goal profile", () => {
  it("starts empty, so new and existing workspaces work without a goal", async () => {
    const { call } = createHarness();
    const response = await call(GOAL, ALICE);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      goal: null,
      otherText: null,
      selectedAt: null,
      skipped: false,
    });
  });

  it("works before onboarding finishes and persists the selection immediately", async () => {
    const { call, rows } = createHarness();
    const response = await call(GOAL, ALICE, "PUT", { goal: "build_budget" });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ goal: "build_budget", skipped: false });
    expect(await (await call(GOAL, ALICE)).json()).toMatchObject({ goal: "build_budget" });
    expect(rows("SELECT name, goal, from_goal FROM goal_events")).toEqual([
      { name: "onboarding_goal_selected", goal: "build_budget", from_goal: null },
    ]);
  });

  it("records goal_changed with from and to, and nothing when the goal is unchanged", async () => {
    const { call, rows } = createHarness();
    await call(GOAL, ALICE, "PUT", { goal: "build_budget" });
    await call(GOAL, ALICE, "PUT", { goal: "build_budget" });
    await call(GOAL, ALICE, "PUT", { goal: "reduce_debt" });
    expect(rows("SELECT name, goal, from_goal FROM goal_events ORDER BY rowid")).toEqual([
      { name: "onboarding_goal_selected", goal: "build_budget", from_goal: null },
      { name: "goal_changed", goal: "reduce_debt", from_goal: "build_budget" },
    ]);
  });

  it("skips without blocking, once, and never clears a chosen goal", async () => {
    const { call, rows } = createHarness();
    const skipped = await call(`${GOAL}/skip`, ALICE, "POST");
    expect(await skipped.json()).toMatchObject({ goal: null, skipped: true });
    await call(`${GOAL}/skip`, ALICE, "POST");
    expect(
      rows("SELECT name FROM goal_events WHERE name = 'onboarding_goal_skipped'"),
    ).toHaveLength(1);

    await call(GOAL, ALICE, "PUT", { goal: "track_spending" });
    const after = await call(`${GOAL}/skip`, ALICE, "POST");
    expect(await after.json()).toMatchObject({ goal: "track_spending", skipped: false });
  });

  it("keeps 'other' text only for 'other', sanitized and capped at 140", async () => {
    const { call } = createHarness();
    const saved = await call(GOAL, ALICE, "PUT", {
      goal: "other",
      otherText: "  <b>Plan\u0000  a\nwedding</b> ",
    });
    expect(await saved.json()).toMatchObject({ goal: "other", otherText: "b Plan a wedding /b" });
    expect(
      (await call(GOAL, ALICE, "PUT", { goal: "other", otherText: "x".repeat(141) })).status,
    ).toBe(400);

    const notOther = await call(GOAL, ALICE, "PUT", { goal: "build_budget", otherText: "ignored" });
    expect(await notOther.json()).toMatchObject({ goal: "build_budget", otherText: null });
  });

  it("rejects unknown goals and unknown fields", async () => {
    const { call } = createHarness();
    expect((await call(GOAL, ALICE, "PUT", { goal: "get_rich" })).status).toBe(400);
    expect((await call(GOAL, ALICE, "PUT", { goal: "other", tenantId: "bob" })).status).toBe(400);
  });

  it("records the shown event once per workspace", async () => {
    const { call, rows } = createHarness();
    await call(`${GOAL}/shown`, ALICE, "POST");
    await call(`${GOAL}/shown`, ALICE, "POST");
    expect(rows("SELECT name FROM goal_events")).toEqual([{ name: "onboarding_goal_shown" }]);
  });

  it("is scoped to the authenticated tenant", async () => {
    const { call, rows } = createHarness();
    await call(GOAL, ALICE, "PUT", { goal: "reduce_debt" });
    expect(await (await call(GOAL, BOB)).json()).toMatchObject({ goal: null });
    await call(GOAL, BOB, "PUT", { goal: "save_for_goal" });
    expect(await (await call(GOAL, ALICE)).json()).toMatchObject({ goal: "reduce_debt" });
    expect(new Set(rows("SELECT tenant_id FROM goal_events").map((r) => r.tenant_id)).size).toBe(2);
  });
});

describe("migration 0070", () => {
  const migration = readFileSync(
    new URL("../../../db/migrations/0070_primary_goal.sql", import.meta.url),
    "utf8",
  );

  it("applies on a database with existing workspaces and leaves them goal-free", () => {
    const { database } = createHarness();
    const columns = database.prepare("PRAGMA table_info(tenants)").all() as Array<{
      name: string;
      notnull: number;
    }>;
    const byName = Object.fromEntries(columns.map((c) => [c.name, c.notnull]));
    expect(byName.primary_goal).toBe(0);
    expect(byName.goal_selected_at).toBe(0);
    expect(byName.goal_skipped).toBe(1);
  });

  it("rejects goals outside the enum at the database", () => {
    const { database } = createHarness();
    database.prepare("INSERT INTO tenants (id, kind, name) VALUES ('t', 'user', 'T')").run();
    expect(() =>
      database.prepare("UPDATE tenants SET primary_goal = 'nope' WHERE id = 't'").run(),
    ).toThrow();
    expect(() =>
      database
        .prepare("UPDATE tenants SET goal_other_text = ? WHERE id = 't'")
        .run("x".repeat(141)),
    ).toThrow();
  });

  it("keeps the SQL enums in step with the shared lists", () => {
    for (const value of [...primaryGoals, ...goalEventNames])
      expect(migration).toContain(`'${value}'`);
    const schema = ["schema.ts", "schema-goals.ts"]
      .map((file) => readFileSync(new URL(`../../../db/${file}`, import.meta.url), "utf8"))
      .join("\n");
    for (const value of [...primaryGoals, ...goalEventNames])
      expect(schema).toContain(`"${value}"`);
  });
});

const GOALS = "/api/app/profile/goals";

describe("several goals", () => {
  it("starts empty and keeps pick order, with the first pick as the lead goal", async () => {
    const { call, rows } = createHarness();
    expect(await (await call(GOALS, ALICE)).json()).toEqual({
      goals: [],
      otherText: null,
      selectedAt: null,
      skipped: false,
    });

    const saved = await call(GOALS, ALICE, "PUT", {
      goals: ["reduce_debt", "build_budget", "other"],
      otherText: " a wedding ",
    });
    expect(await saved.json()).toMatchObject({
      goals: ["reduce_debt", "build_budget", "other"],
      otherText: "a wedding",
      skipped: false,
    });
    expect(rows("SELECT primary_goal, secondary_goals FROM tenants")).toEqual([
      { primary_goal: "reduce_debt", secondary_goals: '["build_budget","other"]' },
    ]);
    expect(rows("SELECT name, goal, from_goal FROM goal_events")).toEqual([
      { name: "onboarding_goal_selected", goal: "reduce_debt", from_goal: null },
    ]);
  });

  it("records goal_changed only when the lead goal changes", async () => {
    const { call, rows } = createHarness();
    await call(GOALS, ALICE, "PUT", { goals: ["build_budget", "track_spending"] });
    await call(GOALS, ALICE, "PUT", { goals: ["build_budget", "save_for_goal"] });
    await call(GOALS, ALICE, "PUT", { goals: ["track_spending", "build_budget"] });
    expect(rows("SELECT name, goal, from_goal FROM goal_events ORDER BY rowid")).toEqual([
      { name: "onboarding_goal_selected", goal: "build_budget", from_goal: null },
      { name: "goal_changed", goal: "track_spending", from_goal: "build_budget" },
    ]);
  });

  it("serves the lead goal to the single-goal route and replaces the list when it saves one", async () => {
    const { call } = createHarness();
    await call(GOALS, ALICE, "PUT", { goals: ["save_for_goal", "reduce_debt"] });
    expect(await (await call(GOAL, ALICE)).json()).toMatchObject({ goal: "save_for_goal" });

    await call(GOAL, ALICE, "PUT", { goal: "track_spending" });
    expect(await (await call(GOALS, ALICE)).json()).toMatchObject({ goals: ["track_spending"] });
  });

  it("drops the text unless 'other' is chosen, and rejects bad lists", async () => {
    const { call } = createHarness();
    const saved = await call(GOALS, ALICE, "PUT", { goals: ["build_budget"], otherText: "x" });
    expect(await saved.json()).toMatchObject({ otherText: null });
    for (const goals of [[], ["build_budget", "build_budget"], ["get_rich"], "build_budget"]) {
      expect((await call(GOALS, ALICE, "PUT", { goals })).status).toBe(400);
    }
    expect((await call(GOALS, ALICE, "PUT", { goals: ["other"], tenantId: "bob" })).status).toBe(
      400,
    );
  });

  it("skips without clearing chosen goals and is scoped to the tenant", async () => {
    const { call } = createHarness();
    await call(GOALS, ALICE, "PUT", { goals: ["build_budget", "track_spending"] });
    await call(`${GOAL}/skip`, ALICE, "POST");
    expect(await (await call(GOALS, ALICE)).json()).toMatchObject({
      goals: ["build_budget", "track_spending"],
      skipped: false,
    });
    expect(await (await call(GOALS, BOB)).json()).toMatchObject({ goals: [] });
  });
});

type Database = ReturnType<typeof createHarness>["database"];

function tenantIdOf(database: Database, goal: string) {
  return (
    database.prepare("SELECT id FROM tenants WHERE primary_goal = ?").get(goal) as { id: string }
  ).id;
}

function seedCategory(database: Database, tenantId: string, systemKey: string | null) {
  const existing = database
    .prepare("SELECT id FROM categories WHERE tenant_id = ? AND system_key IS ?")
    .get(tenantId, systemKey) as { id: string } | undefined;
  if (existing) return existing.id;
  const id = `${tenantId}:cat:${systemKey ?? "plain"}`;
  database
    .prepare(
      "INSERT INTO categories (id, tenant_id, name, kind, color, system_key) VALUES (?, ?, ?, 'expense', '#000000', ?)",
    )
    .run(id, tenantId, id, systemKey);
  return id;
}

function seedTransaction(database: Database, tenantId: string, categoryId: string, at: string) {
  database
    .prepare(
      `INSERT INTO transactions (id, tenant_id, category_id, date, description, amount_minor, kind, created_at)
         VALUES (?, ?, ?, '2026-01-01', 'x', 100, 'expense', ${at})`,
    )
    .run(crypto.randomUUID(), tenantId, categoryId);
}

const firstActions = (rows: ReturnType<typeof createHarness>["rows"]) =>
  rows("SELECT goal, action FROM goal_events WHERE name = 'first_action_completed'");

describe("first_action_completed", () => {
  it("records once when the goal's action happens after the goal was chosen", async () => {
    const { call, rows, database } = createHarness();
    await call(GOAL, ALICE, "PUT", { goal: "track_spending" });
    const tenantId = tenantIdOf(database, "track_spending");
    const opening = seedCategory(database, tenantId, "opening:income");
    const plain = seedCategory(database, tenantId, null);

    // The opening balance is not the user's first action.
    seedTransaction(database, tenantId, opening, "datetime('now', '+1 hour')");
    await call(GOAL, ALICE);
    expect(firstActions(rows)).toEqual([]);

    // A transaction from before the goal was chosen does not count either.
    seedTransaction(database, tenantId, plain, "datetime('now', '-1 day')");
    await call(GOAL, ALICE);
    expect(firstActions(rows)).toEqual([]);

    seedTransaction(database, tenantId, plain, "datetime('now', '+2 hours')");
    await call(GOAL, ALICE);
    await call(GOAL, ALICE);
    seedTransaction(database, tenantId, plain, "datetime('now', '+3 hours')");
    await call(GOAL, ALICE);
    expect(firstActions(rows)).toEqual([{ goal: "track_spending", action: "log_transaction" }]);
    // Stamped with the activity time, not the time the profile was read.
    expect(
      rows(
        `SELECT created_at > datetime('now', '+90 minutes') AS late
           FROM goal_events WHERE name = 'first_action_completed'`,
      ),
    ).toEqual([{ late: 1 }]);
  });

  it("follows the action chosen for each goal", async () => {
    const { call, rows, database } = createHarness();
    await call(GOAL, ALICE, "PUT", { goal: "reduce_debt" });
    const tenantId = tenantIdOf(database, "reduce_debt");
    database
      .prepare(
        `INSERT INTO debts (id, tenant_id, name, type, balance_minor, apr_basis_points,
           minimum_payment_minor, balance_as_of, created_at)
           VALUES ('d', ?, 'Card', 'credit_card', 100, 0, 0, '2026-01-01', datetime('now', '+1 hour'))`,
      )
      .run(tenantId);
    // A budget is a different goal's action and does not activate a debt goal.
    await call(GOAL, ALICE);
    expect(firstActions(rows)).toEqual([{ goal: "reduce_debt", action: "add_debt" }]);
  });

  it("counts only the user's own assistant messages for ask_assistant", async () => {
    const { call, rows, database } = createHarness();
    await call(GOAL, ALICE, "PUT", { goal: "understand_habits" });
    const tenantId = tenantIdOf(database, "understand_habits");
    database
      .prepare(
        "INSERT INTO assistant_threads (id, tenant_id, title, retention_expires_at) VALUES ('th', ?, 'Chat', datetime('now', '+1 year'))",
      )
      .run(tenantId);
    const message = database.prepare(
      `INSERT INTO assistant_messages (id, tenant_id, thread_id, role, content, status, created_at)
         VALUES (?, ?, 'th', ?, 'hi', 'completed', datetime('now', '+1 hour'))`,
    );
    message.run("m1", tenantId, "assistant");
    await call(GOAL, ALICE);
    expect(firstActions(rows)).toEqual([]);
    message.run("m2", tenantId, "user");
    await call(GOAL, ALICE);
    expect(firstActions(rows)).toEqual([{ goal: "understand_habits", action: "ask_assistant" }]);
  });

  it("never records without a goal, and never from another workspace's data", async () => {
    const { call, rows, database } = createHarness();
    await call(`${GOAL}/skip`, BOB, "POST");
    await call(GOAL, ALICE, "PUT", { goal: "build_budget" });
    const alice = tenantIdOf(database, "build_budget");
    const bob = (
      database.prepare("SELECT id FROM tenants WHERE goal_skipped = 1").get() as { id: string }
    ).id;
    const category = seedCategory(database, bob, null);
    database
      .prepare(
        `INSERT INTO budgets (id, tenant_id, category_id, month, limit_minor, created_at)
           VALUES ('b', ?, ?, '2026-01', 100, datetime('now', '+1 hour'))`,
      )
      .run(bob, category);
    await call(GOAL, BOB);
    await call(GOAL, ALICE);
    expect(firstActions(rows)).toEqual([]);
    expect(alice).not.toBe(bob);
  });
});

describe("goal retention report", () => {
  const report = readFileSync(
    new URL("../../../docs/queries/goal-retention.sql", import.meta.url),
    "utf8",
  );

  it("reports activation and D1/D7/D30 return per cohort, counting only finished windows", () => {
    const { database } = createHarness();
    const goalTenant = database.prepare(
      `INSERT INTO tenants (id, kind, name, primary_goal, goal_selected_at)
         VALUES (?, 'user', ?, 'build_budget', datetime('now', ?))`,
    );
    const plainTenant = database.prepare(
      "INSERT INTO tenants (id, kind, name, goal_skipped) VALUES (?, 'user', ?, ?)",
    );
    const insertEvent = database.prepare(
      `INSERT INTO goal_events (id, tenant_id, name, goal, action, created_at)
         VALUES (?, ?, ?, ?, ?, datetime('now', ?, ?))`,
    );
    const budget = database.prepare(
      `INSERT INTO budgets (id, tenant_id, category_id, month, limit_minor, created_at)
         VALUES (?, ?, 'c', ?, 100, datetime('now', ?, ?))`,
    );
    const done = (id: string, tenant: string, anchor: string, after: string) =>
      insertEvent.run(
        id,
        tenant,
        "first_action_completed",
        "build_budget",
        "set_budget",
        anchor,
        after,
      );
    const returned = (tenant: string, anchor: string, after: string) =>
      budget.run(`${tenant}${after}`, tenant, `${tenant}${after}`, anchor, after);

    goalTenant.run("a", "A", "-40 days");
    goalTenant.run("b", "B", "-40 days");
    goalTenant.run("c", "C", "-3 days");
    goalTenant.run("d", "D", "-1 minutes");
    plainTenant.run("e", "E", 1);
    plainTenant.run("f", "F", 0);
    plainTenant.run("g", "G", 0);
    database
      .prepare(
        "INSERT INTO categories (id, tenant_id, name, kind, color) VALUES ('c', 'a', 'c', 'expense', '#000')",
      )
      .run();

    // a activated within 24 hours and came back on days 1 and 7.
    done("ea", "a", "-40 days", "+2 hours");
    returned("a", "-40 days", "+1 day");
    returned("a", "-40 days", "+7 days");
    // b activated only after three days and came back on day 30.
    done("eb", "b", "-40 days", "+3 days");
    returned("b", "-40 days", "+30 days");
    // c is three days old and came back on day 1; d is brand new.
    returned("c", "-3 days", "+1 day");
    // e skipped and came back on day 1; f saw the screen and left; g never reached it.
    insertEvent.run("es", "e", "onboarding_goal_skipped", null, null, "-10 days", "+0 days");
    returned("e", "-10 days", "+1 day");
    insertEvent.run("ef", "f", "onboarding_goal_shown", null, null, "-5 days", "+0 days");

    const result = database.prepare(report).all() as Array<Record<string, unknown>>;
    expect(result).toEqual([
      {
        cohort: "build_budget",
        signups: 4,
        activation_eligible: 3,
        activated_24h: 1,
        activation_rate_pct: 33.3,
        d1_eligible: 3,
        d1_returned: 2,
        d1_rate_pct: 66.7,
        d7_eligible: 2,
        d7_returned: 1,
        d7_rate_pct: 50,
        d30_eligible: 2,
        d30_returned: 1,
        d30_rate_pct: 50,
      },
      {
        cohort: "shown_no_answer",
        signups: 1,
        activation_eligible: 1,
        activated_24h: 0,
        activation_rate_pct: 0,
        d1_eligible: 1,
        d1_returned: 0,
        d1_rate_pct: 0,
        d7_eligible: 0,
        d7_returned: 0,
        d7_rate_pct: null,
        d30_eligible: 0,
        d30_returned: 0,
        d30_rate_pct: null,
      },
      {
        cohort: "skipped",
        signups: 1,
        activation_eligible: 1,
        activated_24h: 0,
        activation_rate_pct: 0,
        d1_eligible: 1,
        d1_returned: 1,
        d1_rate_pct: 100,
        d7_eligible: 1,
        d7_returned: 0,
        d7_rate_pct: 0,
        d30_eligible: 0,
        d30_returned: 0,
        d30_rate_pct: null,
      },
    ]);
  });
});
