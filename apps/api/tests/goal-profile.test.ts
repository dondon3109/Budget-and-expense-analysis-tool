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
    const schema = readFileSync(new URL("../../../db/schema.ts", import.meta.url), "utf8");
    for (const value of [...primaryGoals, ...goalEventNames])
      expect(schema).toContain(`"${value}"`);
  });
});
