import { readFileSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";

import { afterEach, describe, expect, it } from "vitest";

import {
  ASSISTANT_CYCLE_SECONDS,
  assistantCycleIndex,
  assistantCyclePeriod,
  assistantUsageRepository,
  getAssistantCycleUsage,
} from "../src/db/assistant-usage";
import type { Bindings } from "../src/types";

const TENANT_ID = "user:user-1";
const databases: DatabaseSync[] = [];

function environment(): { env: Bindings; database: DatabaseSync } {
  const database = new DatabaseSync(":memory:");
  databases.push(database);
  database.exec("PRAGMA foreign_keys = ON; CREATE TABLE tenants (id text PRIMARY KEY NOT NULL);");
  database.prepare("INSERT INTO tenants (id) VALUES (?)").run(TENANT_ID);
  database.exec(
    "CREATE TABLE effective_pro_entitlements (tenant_id text PRIMARY KEY NOT NULL);",
  );
  const migration = readFileSync(
    new URL("../../../db/migrations/0023_assistant_cycle_usage.sql", import.meta.url),
    "utf8",
  ).replaceAll("--> statement-breakpoint", "");
  database.exec(migration);

  const d1 = {
    prepare(sql: string) {
      let bindings: SQLInputValue[] = [];
      const statement = {
        bind(...values: unknown[]) {
          bindings = values as SQLInputValue[];
          return statement;
        },
        async first<T>() {
          return (database.prepare(sql).get(...bindings) as T | undefined) ?? null;
        },
        async run() {
          const result = database.prepare(sql).run(...bindings);
          return {
            success: true,
            meta: { changes: Number(result.changes) },
            results: [],
          };
        },
      };
      return statement;
    },
  } as unknown as D1Database;

  return { env: { DB: d1 }, database };
}

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

describe("assistant cycle calculations", () => {
  it("uses exact 14-day intervals without moving the anchor", () => {
    expect(assistantCycleIndex(1_000, 1_000 + ASSISTANT_CYCLE_SECONDS - 1)).toBe(0);
    expect(assistantCycleIndex(1_000, 1_000 + ASSISTANT_CYCLE_SECONDS)).toBe(1);
    expect(assistantCycleIndex(1_000, 1_000 + ASSISTANT_CYCLE_SECONDS * 4 + 7)).toBe(4);
    expect(assistantCyclePeriod(1_000, 2)).toEqual({
      periodStartedAt: new Date((1_000 + ASSISTANT_CYCLE_SECONDS * 2) * 1_000).toISOString(),
      resetsAt: new Date((1_000 + ASSISTANT_CYCLE_SECONDS * 3) * 1_000).toISOString(),
    });
  });
});

describe("assistant cycle repository", () => {
  it("does not create an anchor while reading unused allowance", async () => {
    const { env, database } = environment();

    await expect(getAssistantCycleUsage(env, TENANT_ID, 4)).resolves.toEqual({
      feature: "assistant_question",
      used: 0,
      limit: 4,
      periodKind: "anchored_14_day",
      periodStartedAt: null,
      resetsAt: null,
    });
    expect(
      database.prepare("SELECT COUNT(*) AS count FROM billing_assistant_cycle_usage").get(),
    ).toEqual({ count: 0 });
  });

  it("allows four Free uses and rejects the fifth atomically", async () => {
    const { env, database } = environment();

    await Promise.all(Array.from({ length: 4 }, () => assistantUsageRepository.consumeUsage(env, TENANT_ID)));
    await expect(assistantUsageRepository.consumeUsage(env, TENANT_ID)).rejects.toMatchObject({
      status: 409,
      code: "assistant_cycle_limit_reached",
      details: {
        feature: "assistant_question",
        used: 4,
        limit: 4,
        periodKind: "anchored_14_day",
      },
    });
    expect(
      database
        .prepare("SELECT count, allowance FROM billing_assistant_cycle_usage WHERE tenant_id = ?")
        .get(TENANT_ID),
    ).toEqual({ count: 4, allowance: 4 });
  });

  it("allows one hundred Pro uses and rejects the 101st", async () => {
    const { env, database } = environment();
    database
      .prepare("INSERT INTO effective_pro_entitlements (tenant_id) VALUES (?)")
      .run(TENANT_ID);

    for (let index = 0; index < 100; index += 1) {
      await assistantUsageRepository.consumeUsage(env, TENANT_ID);
    }
    await expect(assistantUsageRepository.consumeUsage(env, TENANT_ID)).rejects.toMatchObject({
      code: "assistant_cycle_limit_reached",
      details: { used: 100, limit: 100 },
    });
  });

  it("jumps across inactive periods, resets once, and preserves the anchor", async () => {
    const { env, database } = environment();
    const anchor = Math.floor(Date.now() / 1_000) - ASSISTANT_CYCLE_SECONDS * 3;
    database
      .prepare(
        "INSERT INTO billing_assistant_cycle_usage (tenant_id, anchor_at_epoch, period_index, count, allowance) VALUES (?, ?, 0, 4, 4)",
      )
      .run(TENANT_ID, anchor);

    await assistantUsageRepository.consumeUsage(env, TENANT_ID);

    expect(
      database
        .prepare(
          "SELECT anchor_at_epoch AS anchorAtEpoch, period_index AS periodIndex, count FROM billing_assistant_cycle_usage WHERE tenant_id = ?",
        )
        .get(TENANT_ID),
    ).toEqual({ anchorAtEpoch: anchor, periodIndex: 3, count: 1 });
    expect(() =>
      database
        .prepare("UPDATE billing_assistant_cycle_usage SET anchor_at_epoch = ? WHERE tenant_id = ?")
        .run(anchor + 1, TENANT_ID),
    ).toThrow(/billing_assistant_cycle_anchor_immutable/i);
    expect(() =>
      database
        .prepare("UPDATE billing_assistant_cycle_usage SET period_index = 2 WHERE tenant_id = ?")
        .run(TENANT_ID),
    ).toThrow(/billing_assistant_cycle_period_regression/i);
  });

  it("advances an elapsed cycle on read without consuming usage", async () => {
    const { env, database } = environment();
    const anchor = 1_000;
    database
      .prepare(
        "INSERT INTO billing_assistant_cycle_usage (tenant_id, anchor_at_epoch, period_index, count, allowance) VALUES (?, ?, 0, 4, 4)",
      )
      .run(TENANT_ID, anchor);

    await expect(
      getAssistantCycleUsage(
        env,
        TENANT_ID,
        4,
        new Date((anchor + ASSISTANT_CYCLE_SECONDS * 2) * 1_000),
      ),
    ).resolves.toMatchObject({ used: 0, limit: 4, periodKind: "anchored_14_day" });
    expect(
      database
        .prepare("SELECT period_index AS periodIndex, count FROM billing_assistant_cycle_usage")
        .get(),
    ).toEqual({ periodIndex: 2, count: 0 });
  });

  it("applies entitlement changes without restarting the cycle", async () => {
    const { env, database } = environment();
    for (let index = 0; index < 4; index += 1) {
      await assistantUsageRepository.consumeUsage(env, TENANT_ID);
    }
    const anchor = database
      .prepare("SELECT anchor_at_epoch AS anchorAtEpoch FROM billing_assistant_cycle_usage")
      .get() as { anchorAtEpoch: number };

    database
      .prepare("INSERT INTO effective_pro_entitlements (tenant_id) VALUES (?)")
      .run(TENANT_ID);
    await assistantUsageRepository.consumeUsage(env, TENANT_ID);
    database.prepare("DELETE FROM effective_pro_entitlements WHERE tenant_id = ?").run(TENANT_ID);

    await expect(assistantUsageRepository.consumeUsage(env, TENANT_ID)).rejects.toMatchObject({
      details: { used: 5, limit: 4 },
    });
    expect(
      database
        .prepare("SELECT anchor_at_epoch AS anchorAtEpoch, count FROM billing_assistant_cycle_usage")
        .get(),
    ).toEqual({ anchorAtEpoch: anchor.anchorAtEpoch, count: 5 });
  });
});
