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
  const api = {
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
        async raw<T = unknown[]>() {
          const rows = database.prepare(sql).all(...bindings) as Record<string, unknown>[];
          return rows.map((row) => Object.values(row)) as T[];
        },
        async run() {
          const result = database.prepare(sql).run(...bindings);
          return { success: true, meta: { changes: Number(result.changes) } };
        },
        execute() {
          const result = database.prepare(sql).run(...bindings);
          return { success: true, meta: { changes: Number(result.changes) } };
        },
      };
      return statement;
    },
    async batch(statements: Array<{ execute(): unknown }>) {
      database.exec("BEGIN IMMEDIATE");
      try {
        const results = statements.map((statement) => statement.execute());
        database.exec("COMMIT");
        return results;
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },
  };
  return api as unknown as D1Database;
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
  database.exec(
    readFileSync(
      new URL("../../../db/migrations/0035_mobile_sync_transaction_push.sql", import.meta.url),
      "utf8",
    ),
  );
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

describe("mobile sync transaction push repository", () => {
  const clientId = "00000000-0000-4000-8000-000000000001";
  const entityId = "00000000-0000-4000-8000-000000000002";

  function createOperation() {
    return {
      protocolVersion: 1 as const,
      clientId,
      operations: [
        {
          operationId: "00000000-0000-4000-8000-000000000003",
          idempotencyKey: "00000000-0000-4000-8000-000000000004",
          entityType: "transaction" as const,
          entityId,
          operationType: "create" as const,
          baseRevision: 0 as const,
          dependencyIds: [],
          payload: {
            kind: "expense" as const,
            date: "2026-08-13",
            description: "Offline lunch",
            amountMinor: 12_345,
            currency: "PHP" as const,
            categoryId: "category-1",
            accountId: "account-1",
          },
        },
      ],
    };
  }

  it("creates a client-ID transaction and replays the same acknowledgement idempotently", async () => {
    const { env, database } = createSyncEnvironment();
    const repository = createMobileSyncRepository(vi.fn(async () => true));
    const input = createOperation();

    const first = await repository.push(env, "tenant-1", input);
    const replay = await repository.push(env, "tenant-1", input);

    expect(first).toEqual(replay);
    expect(first.results[0]).toMatchObject({ status: "acknowledged", revision: 1, entityId });
    expect(
      database
        .prepare("SELECT amount_minor, revision FROM transactions WHERE id = ?")
        .get(entityId),
    ).toEqual({ amount_minor: -12_345, revision: 1 });
    expect(
      database.prepare("SELECT count(*) AS count FROM transactions WHERE id = ?").get(entityId),
    ).toEqual({ count: 1 });
  });

  it("rejects reuse of one idempotency key with a different payload", async () => {
    const { env } = createSyncEnvironment();
    const repository = createMobileSyncRepository(vi.fn(async () => true));
    const input = createOperation();
    await repository.push(env, "tenant-1", input);
    input.operations[0]!.payload.description = "Changed request";

    await expect(repository.push(env, "tenant-1", input)).rejects.toMatchObject({
      status: 409,
      code: "idempotency_key_reused",
    });
  });

  it("updates only the expected revision and returns the server snapshot for a stale edit", async () => {
    const { env, database } = createSyncEnvironment();
    const repository = createMobileSyncRepository(vi.fn(async () => true));
    await repository.push(env, "tenant-1", createOperation());
    const update = {
      protocolVersion: 1 as const,
      clientId,
      operations: [
        {
          operationId: "00000000-0000-4000-8000-000000000005",
          idempotencyKey: "00000000-0000-4000-8000-000000000006",
          entityType: "transaction" as const,
          entityId,
          operationType: "update" as const,
          baseRevision: 1,
          dependencyIds: [],
          payload: { description: "Updated offline lunch" },
        },
      ],
    };
    const updated = await repository.push(env, "tenant-1", update);
    expect(updated.results[0]).toMatchObject({ status: "acknowledged", revision: 2 });
    expect(
      database.prepare("SELECT description, revision FROM transactions WHERE id = ?").get(entityId),
    ).toEqual({
      description: "Updated offline lunch",
      revision: 2,
    });

    const stale = structuredClone(update);
    stale.operations[0]!.operationId = "00000000-0000-4000-8000-000000000007";
    stale.operations[0]!.idempotencyKey = "00000000-0000-4000-8000-000000000008";
    stale.operations[0]!.payload.description = "Stale overwrite";
    const conflicted = await repository.push(env, "tenant-1", stale);
    expect(conflicted.results[0]).toMatchObject({
      status: "conflict",
      code: "stale_revision",
      serverRevision: 2,
      serverPayload: { description: "Updated offline lunch" },
    });
  });

  it("deletes once and emits a revisioned tombstone", async () => {
    const { env, database } = createSyncEnvironment();
    const repository = createMobileSyncRepository(vi.fn(async () => true));
    await repository.push(env, "tenant-1", createOperation());
    const removed = await repository.push(env, "tenant-1", {
      protocolVersion: 1,
      clientId,
      operations: [
        {
          operationId: "00000000-0000-4000-8000-000000000009",
          idempotencyKey: "00000000-0000-4000-8000-000000000010",
          entityType: "transaction",
          entityId,
          operationType: "delete",
          baseRevision: 1,
          dependencyIds: [],
          payload: {},
        },
      ],
    });
    expect(removed.results[0]).toMatchObject({ status: "acknowledged", revision: 2 });
    expect(
      database.prepare("SELECT id FROM transactions WHERE id = ?").get(entityId),
    ).toBeUndefined();
    expect(
      database
        .prepare(
          "SELECT operation, row_revision FROM mobile_sync_changes WHERE tenant_id = ? AND entity_id = ? ORDER BY sequence DESC LIMIT 1",
        )
        .get("tenant-1", entityId),
    ).toEqual({ operation: "delete", row_revision: 2 });
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
    const push = vi.fn(async () => ({
      protocolVersion: 1 as const,
      results: [
        {
          operationId: "00000000-0000-4000-8000-000000000003",
          entityType: "transaction" as const,
          entityId: "00000000-0000-4000-8000-000000000002",
          status: "acknowledged" as const,
          revision: 1,
        },
      ],
    }));
    const mobileSync: MobileSyncRepository = {
      pull,
      push,
    };
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

    const pushed = await app.request("/api/app/sync/push", {
      method: "POST",
      headers,
      body: JSON.stringify({
        protocolVersion: 1,
        clientId: "00000000-0000-4000-8000-000000000001",
        operations: [
          {
            operationId: "00000000-0000-4000-8000-000000000003",
            idempotencyKey: "00000000-0000-4000-8000-000000000004",
            entityType: "transaction",
            entityId: "00000000-0000-4000-8000-000000000002",
            operationType: "delete",
            baseRevision: 1,
            dependencyIds: [],
            payload: {},
          },
        ],
      }),
    });
    expect(pushed.status).toBe(200);
    expect(push).toHaveBeenCalledWith(undefined, "tenant-safe", expect.any(Object));

    const forgedPush = await app.request("/api/app/sync/push", {
      method: "POST",
      headers,
      body: JSON.stringify({
        protocolVersion: 1,
        clientId: "00000000-0000-4000-8000-000000000001",
        tenantId: "tenant-other",
        operations: [],
      }),
    });
    expect(forgedPush.status).toBe(400);
    expect(push).toHaveBeenCalledTimes(1);
  });
});
