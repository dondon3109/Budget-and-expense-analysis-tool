import { DatabaseSync, type SQLInputValue } from "node:sqlite";

import { afterEach, describe, expect, it } from "vitest";

import { assistantRepository } from "../src/db/assistant";
import type { Bindings } from "../src/types";

const TENANT_A = "user:tenant-a";
const TENANT_B = "user:tenant-b";
const THREAD_A = "11111111-1111-4111-8111-111111111111";
const THREAD_B = "22222222-2222-4222-8222-222222222222";

const databases: DatabaseSync[] = [];

function environment(): { env: Bindings; database: DatabaseSync } {
  const database = new DatabaseSync(":memory:");
  databases.push(database);
  database.exec("PRAGMA foreign_keys = ON;");
  database.exec("CREATE TABLE tenants (id text PRIMARY KEY NOT NULL);");
  database.prepare("INSERT INTO tenants (id) VALUES (?)").run(TENANT_A);
  database.prepare("INSERT INTO tenants (id) VALUES (?)").run(TENANT_B);
  database.exec(
    "CREATE TABLE assistant_threads (" +
      "id text PRIMARY KEY NOT NULL," +
      "tenant_id text NOT NULL," +
      "title text NOT NULL," +
      "last_message_at text DEFAULT (datetime('now')) NOT NULL," +
      "retention_expires_at text NOT NULL," +
      "created_at text DEFAULT (datetime('now')) NOT NULL," +
      "updated_at text DEFAULT (datetime('now')) NOT NULL" +
      ");",
  );
  database
    .prepare(
      "INSERT INTO assistant_threads (id, tenant_id, title, retention_expires_at) VALUES (?, ?, ?, ?)",
    )
    .run(THREAD_A, TENANT_A, "A's thread", "2999-01-01T00:00:00.000Z");
  database
    .prepare(
      "INSERT INTO assistant_threads (id, tenant_id, title, retention_expires_at) VALUES (?, ?, ?, ?)",
    )
    .run(THREAD_B, TENANT_B, "B's thread", "2999-01-01T00:00:00.000Z");

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
        async all<T>() {
          return { results: database.prepare(sql).all(...bindings) as T[] };
        },
        async run() {
          const result = database.prepare(sql).run(...bindings);
          return { success: true, meta: { changes: Number(result.changes) }, results: [] };
        },
      };
      return statement;
    },
    async batch() {
      return [];
    },
  } as unknown as D1Database;

  return { env: { DB: d1 }, database };
}

function threadCount(database: DatabaseSync, threadId: string): number {
  const row = database
    .prepare("SELECT count(*) AS c FROM assistant_threads WHERE id = ?")
    .get(threadId) as { c: number } | undefined;
  return row ? Number(row.c) : 0;
}

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

describe("assistantRepository.deleteThread", () => {
  it("deletes an existing conversation for the owning tenant", async () => {
    const { env, database } = environment();

    await expect(assistantRepository.deleteThread(env, TENANT_A, THREAD_A)).resolves.toBeUndefined();
    expect(threadCount(database, THREAD_A)).toBe(0);
  });

  it("is idempotent: deleting an already-absent conversation succeeds instead of 404", async () => {
    const { env } = environment();
    const missing = "99999999-9999-4999-8999-999999999999";

    await expect(assistantRepository.deleteThread(env, TENANT_A, missing)).resolves.toBeUndefined();
  });

  it("does not remove another tenant's conversation (workspace isolation preserved)", async () => {
    const { env, database } = environment();

    // Tenant A cannot delete Tenant B's thread; it is a tenant-scoped no-op.
    await expect(assistantRepository.deleteThread(env, TENANT_A, THREAD_B)).resolves.toBeUndefined();
    expect(threadCount(database, THREAD_B)).toBe(1);
    // And Tenant B's own ownership is unaffected.
    expect(threadCount(database, THREAD_A)).toBe(1);
  });
});
