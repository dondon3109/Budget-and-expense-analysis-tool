import { readFileSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app";
import type { AuthVerifier } from "../src/auth";
import {
  createMobileSyncRepository,
  decodeMobileSyncCursor,
  encodeMobileSyncCursor,
  type MobileSyncRepository,
} from "../src/db/mobile-sync";
import type { TenantResolver } from "../src/db/tenants";
import type { RateLimiter } from "../src/rate-limit";
import type { Bindings } from "../src/types";

const databases: DatabaseSync[] = [];

function d1FromSqlite(database: DatabaseSync): D1Database {
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
        async all<T>() {
          return {
            success: true,
            results: database.prepare(sql).all(...bindings) as T[],
          };
        },
      };
      return statement;
    },
  } as unknown as D1Database;
}

function createSyncEnvironment(): { env: Bindings; database: DatabaseSync } {
  const database = new DatabaseSync(":memory:");
  databases.push(database);
  database.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE tenants (id text PRIMARY KEY NOT NULL, kind text NOT NULL, name text NOT NULL);
    CREATE TABLE accounts (
      id text PRIMARY KEY NOT NULL, tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      name text NOT NULL,
      type text NOT NULL, currency text NOT NULL DEFAULT 'PHP', system_key text,
      archived integer NOT NULL DEFAULT 0, interest_enabled integer NOT NULL DEFAULT 0,
      annual_rate_basis_points integer, interest_frequency text, interest_pay_day integer,
      created_at text NOT NULL DEFAULT (datetime('now')),
      updated_at text NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE categories (
      id text PRIMARY KEY NOT NULL, tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      name text NOT NULL,
      kind text NOT NULL, color text NOT NULL, archived integer NOT NULL DEFAULT 0,
      system_key text, origin text NOT NULL DEFAULT 'custom',
      required_plan text NOT NULL DEFAULT 'free',
      created_at text NOT NULL DEFAULT (datetime('now')),
      updated_at text NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE transactions (
      id text PRIMARY KEY NOT NULL, tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      account_id text,
      category_id text NOT NULL, date text NOT NULL, description text NOT NULL,
      amount_minor integer NOT NULL, currency text NOT NULL DEFAULT 'PHP', kind text NOT NULL,
      transfer_group_id text, import_fingerprint text, source_kind text NOT NULL DEFAULT 'manual',
      import_id text, import_row_number integer, notes text, transfer_fee_minor integer,
      subscription_id text, created_at text NOT NULL DEFAULT (datetime('now')),
      updated_at text NOT NULL DEFAULT (datetime('now'))
    );
  `);
  database.exec(`
    INSERT INTO tenants (id, kind, name) VALUES
      ('tenant-1', 'user', 'One'), ('tenant-2', 'user', 'Two');
    INSERT INTO accounts (id, tenant_id, name, type) VALUES
      ('account-1', 'tenant-1', 'Wallet', 'cash'),
      ('account-2', 'tenant-2', 'Private', 'cash');
    INSERT INTO categories (id, tenant_id, name, kind, color, required_plan) VALUES
      ('category-1', 'tenant-1', 'Dining', 'expense', '#123456', 'zoption_pro'),
      ('category-2', 'tenant-2', 'Private', 'expense', '#654321', 'free');
    INSERT INTO transactions (
      id, tenant_id, account_id, category_id, date, description, amount_minor, currency, kind
    ) VALUES
      ('transaction-1', 'tenant-1', 'account-1', 'category-1', '2026-08-13', 'Lunch', -25000, 'PHP', 'expense'),
      ('transaction-2', 'tenant-2', 'account-2', 'category-2', '2026-08-13', 'Private', -99900, 'PHP', 'expense');
  `);
  const migration = readFileSync(
    new URL("../../../db/migrations/0034_mobile_sync_foundation.sql", import.meta.url),
    "utf8",
  );
  for (const statement of migration
    .split("--> statement-breakpoint")
    .map((part) => part.trim())
    .filter(Boolean)) {
    database.exec(statement);
  }
  return { env: { DB: d1FromSqlite(database) }, database };
}

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

describe("mobile sync cursor", () => {
  it("round-trips canonical opaque sequences", () => {
    expect(decodeMobileSyncCursor(encodeMobileSyncCursor(12_345))).toBe(12_345);
    expect(() => decodeMobileSyncCursor("v1.00")).toThrow();
  });
});

describe("mobile sync pull repository", () => {
  it("bootstraps in bounded pages, derives locks, and isolates tenants", async () => {
    const { env } = createSyncEnvironment();
    const repository = createMobileSyncRepository(vi.fn(async () => false));

    const first = await repository.pull(env, "tenant-1", {
      protocolVersion: 1,
      cursor: null,
      limit: 2,
    });
    expect(first).toMatchObject({ nextCursor: "v1.2", hasMore: true });
    expect(first.changes.map((change) => change.entityId)).toEqual(["account-1", "category-1"]);
    expect(first.changes[1]?.payload).toMatchObject({ requiredPlan: "zoption_pro", locked: true });
    expect(JSON.stringify(first)).not.toContain("Private");

    const second = await repository.pull(env, "tenant-1", {
      protocolVersion: 1,
      cursor: first.nextCursor,
      limit: 2,
    });
    expect(second).toMatchObject({ nextCursor: "v1.3", hasMore: false });
    expect(second.changes.map((change) => change.entityId)).toEqual(["transaction-1"]);
  });

  it("captures web updates and deletion tombstones without device timestamps", async () => {
    const { env, database } = createSyncEnvironment();
    const repository = createMobileSyncRepository(vi.fn(async () => true));

    database.prepare("UPDATE accounts SET name = ? WHERE id = ?").run("Main wallet", "account-1");
    database.prepare("DELETE FROM transactions WHERE id = ?").run("transaction-1");

    const pulled = await repository.pull(env, "tenant-1", {
      protocolVersion: 1,
      cursor: "v1.3",
      limit: 10,
    });
    expect(pulled.changes).toMatchObject([
      {
        entityType: "account",
        entityId: "account-1",
        revision: 2,
        operation: "upsert",
        payload: { name: "Main wallet", revision: 2 },
      },
      {
        entityType: "transaction",
        entityId: "transaction-1",
        revision: 2,
        operation: "delete",
        payload: null,
      },
    ]);
    expect(pulled.nextCursor).toBe("v1.5");
  });

  it("requires a safe full resync when a cursor is ahead of server state", async () => {
    const { env } = createSyncEnvironment();
    const repository = createMobileSyncRepository();
    await expect(
      repository.pull(env, "tenant-1", {
        protocolVersion: 1,
        cursor: "v1.z",
        limit: 10,
      }),
    ).rejects.toMatchObject({ status: 409, code: "full_resync_required" });
  });

  it("does not expose corrupted financial payloads through validation errors", async () => {
    const { env, database } = createSyncEnvironment();
    const repository = createMobileSyncRepository(vi.fn(async () => true));
    database
      .prepare(
        "UPDATE mobile_sync_changes SET payload_json = ? WHERE tenant_id = ? AND sequence = 3",
      )
      .run('{"description":"private ledger description"}', "tenant-1");

    await expect(
      repository.pull(env, "tenant-1", {
        protocolVersion: 1,
        cursor: "v1.2",
        limit: 10,
      }),
    ).rejects.toThrow("Stored mobile synchronization data failed validation.");
  });

  it("does not block tenant deletion with orphan sync writes", () => {
    const { database } = createSyncEnvironment();
    expect(() =>
      database.prepare("DELETE FROM tenants WHERE id = ?").run("tenant-1"),
    ).not.toThrow();
    expect(
      database
        .prepare("SELECT count(*) AS count FROM mobile_sync_state WHERE tenant_id = ?")
        .get("tenant-1"),
    ).toEqual({ count: 0 });
  });
});

describe("mobile sync route", () => {
  it("derives the tenant and rejects ownership fields", async () => {
    const pull = vi.fn(async () => ({
      protocolVersion: 1 as const,
      changes: [],
      nextCursor: "v1.0",
      hasMore: false,
    }));
    const mobileSync: MobileSyncRepository = { pull };
    const authVerifier: AuthVerifier = {
      verify: vi.fn(async () => ({ id: "user-1", role: "authenticated" })),
    };
    const tenantResolver: TenantResolver = {
      resolve: vi.fn(async () => ({ tenantId: "tenant-safe", defaultAccountId: "default" })),
    };
    const rateLimiter: RateLimiter = {
      consume: vi.fn(async () => ({
        allowed: true,
        limit: 60,
        remaining: 59,
        retryAfterSeconds: 60,
      })),
    };
    const app = createApp({
      mobileSync,
      authVerifier,
      tenantResolver,
      rateLimiter,
      readinessCheck: vi.fn(async () => undefined),
    });
    const headers = { Authorization: "Bearer valid", "Content-Type": "application/json" };

    const valid = await app.request("/api/app/sync/pull", {
      method: "POST",
      headers,
      body: JSON.stringify({ protocolVersion: 1, cursor: null, limit: 10 }),
    });
    expect(valid.status).toBe(200);
    expect(pull).toHaveBeenCalledWith(undefined, "tenant-safe", {
      protocolVersion: 1,
      cursor: null,
      limit: 10,
    });

    const forged = await app.request("/api/app/sync/pull", {
      method: "POST",
      headers,
      body: JSON.stringify({ protocolVersion: 1, tenantId: "tenant-other" }),
    });
    expect(forged.status).toBe(400);
    expect(pull).toHaveBeenCalledTimes(1);
  });
});
