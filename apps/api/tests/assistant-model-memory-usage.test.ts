import { readFileSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";

import { afterEach, describe, expect, it } from "vitest";

import {
  assistantModelMemoryUsageRepository,
  MODEL_MEMORY_PASS_CYCLE_CAP,
  MODEL_MEMORY_PASS_CYCLE_SECONDS,
} from "../src/db/assistant-model-memory-usage";
import type { Bindings } from "../src/types";

const TENANT_ID = "user:user-1";
const databases: DatabaseSync[] = [];

function migration(name: string): string {
  return readFileSync(
    new URL(`../../../db/migrations/${name}`, import.meta.url),
    "utf8",
  ).replaceAll("--> statement-breakpoint", "");
}

function d1For(database: DatabaseSync): D1Database {
  return {
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
      };
      return statement;
    },
  } as unknown as D1Database;
}

function environment(): { env: Bindings; database: DatabaseSync } {
  const database = new DatabaseSync(":memory:");
  databases.push(database);
  database.exec("PRAGMA foreign_keys = ON; CREATE TABLE tenants (id text PRIMARY KEY NOT NULL);");
  database.prepare("INSERT INTO tenants (id) VALUES (?)").run(TENANT_ID);
  database.exec(migration("0024_assistant_memory.sql"));
  database.exec(migration("0029_assistant_model_memory_pass_usage.sql"));
  return { env: { DB: d1For(database) }, database };
}

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

describe("assistant model-memory usage migration", () => {
  it("backfills clamped legacy counts and removes every legacy memory row", () => {
    const database = new DatabaseSync(":memory:");
    databases.push(database);
    database.exec("PRAGMA foreign_keys = ON; CREATE TABLE tenants (id text PRIMARY KEY NOT NULL);");
    for (const tenantId of ["recent", "over", "negative", "invalid"]) {
      database.prepare("INSERT INTO tenants (id) VALUES (?)").run(tenantId);
    }
    database.exec(migration("0024_assistant_memory.sql"));

    const insertMemory = database.prepare(
      `INSERT INTO assistant_memories
       (id, tenant_id, kind, key, value, source, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'deterministic', ?, ?)`,
    );
    insertMemory.run(
      "recent-count",
      "recent",
      "fact",
      "model_memory_pass_count",
      "3",
      "2026-08-08 00:00:00",
      "2026-08-08 00:00:00",
    );
    insertMemory.run(
      "over-count",
      "over",
      "fact",
      "model_memory_pass_count",
      "99",
      "2026-06-01 00:00:00",
      "2026-08-08 00:00:00",
    );
    insertMemory.run(
      "negative-count",
      "negative",
      "fact",
      "model_memory_pass_count",
      "-4",
      "2026-08-08 00:00:00",
      "2026-08-08 00:00:00",
    );
    insertMemory.run(
      "invalid-count",
      "invalid",
      "fact",
      "model_memory_pass_count",
      "not-a-count",
      "2026-08-08 00:00:00",
      "2026-08-08 00:00:00",
    );
    insertMemory.run(
      "rogue-count",
      "recent",
      "preference",
      "model_memory_pass_count",
      "7",
      "2026-08-08 00:00:00",
      "2026-08-08 00:00:00",
    );
    insertMemory.run(
      "keep-memory",
      "recent",
      "fact",
      "emergency_fund_target",
      "PHP 100,000",
      "2026-08-08 00:00:00",
      "2026-08-08 00:00:00",
    );

    database.exec(migration("0029_assistant_model_memory_pass_usage.sql"));

    const rows = database
      .prepare(
        `SELECT tenant_id AS tenantId, count
         FROM assistant_model_memory_pass_usage ORDER BY tenant_id`,
      )
      .all();
    expect(rows).toEqual([
      { tenantId: "invalid", count: 0 },
      { tenantId: "negative", count: 0 },
      { tenantId: "over", count: MODEL_MEMORY_PASS_CYCLE_CAP },
      { tenantId: "recent", count: 3 },
    ]);
    expect(
      database
        .prepare("SELECT COUNT(*) AS count FROM assistant_memories WHERE key = ?")
        .get("model_memory_pass_count"),
    ).toEqual({ count: 0 });
    expect(
      database.prepare("SELECT value FROM assistant_memories WHERE id = 'keep-memory'").get(),
    ).toEqual({ value: "PHP 100,000" });
  });
});

describe("assistant model-memory usage repository", () => {
  it("atomically allows eight passes and rejects the ninth", async () => {
    const { env, database } = environment();

    await expect(
      Promise.all(
        Array.from({ length: MODEL_MEMORY_PASS_CYCLE_CAP }, () =>
          assistantModelMemoryUsageRepository.tryConsumePass(env, TENANT_ID),
        ),
      ),
    ).resolves.toEqual(Array.from({ length: MODEL_MEMORY_PASS_CYCLE_CAP }, () => true));
    await expect(assistantModelMemoryUsageRepository.tryConsumePass(env, TENANT_ID)).resolves.toBe(
      false,
    );

    expect(
      database
        .prepare(
          `SELECT period_index AS periodIndex, count
           FROM assistant_model_memory_pass_usage WHERE tenant_id = ?`,
        )
        .get(TENANT_ID),
    ).toEqual({ periodIndex: 0, count: MODEL_MEMORY_PASS_CYCLE_CAP });
  });

  it("resets in the next anchored period without moving the anchor", async () => {
    const { env, database } = environment();
    const anchor = Math.floor(Date.now() / 1_000) - MODEL_MEMORY_PASS_CYCLE_SECONDS * 3;
    database
      .prepare(
        `INSERT INTO assistant_model_memory_pass_usage
         (tenant_id, anchor_at_epoch, period_index, count)
         VALUES (?, ?, 0, ?)`,
      )
      .run(TENANT_ID, anchor, MODEL_MEMORY_PASS_CYCLE_CAP);

    await expect(assistantModelMemoryUsageRepository.tryConsumePass(env, TENANT_ID)).resolves.toBe(
      true,
    );

    expect(
      database
        .prepare(
          `SELECT anchor_at_epoch AS anchorAtEpoch, period_index AS periodIndex, count
           FROM assistant_model_memory_pass_usage WHERE tenant_id = ?`,
        )
        .get(TENANT_ID),
    ).toEqual({ anchorAtEpoch: anchor, periodIndex: 3, count: 1 });
    expect(() =>
      database
        .prepare(
          "UPDATE assistant_model_memory_pass_usage SET anchor_at_epoch = ? WHERE tenant_id = ?",
        )
        .run(anchor + 1, TENANT_ID),
    ).toThrow(/assistant_model_memory_pass_anchor_immutable/i);
  });
});
