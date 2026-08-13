import { readFileSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app";
import type { AuthVerifier } from "../src/auth";
import {
  compactMobileSyncChanges,
  createMobileSyncRepository,
  decodeMobileSyncCursor,
  decodeMobileSyncSnapshotCursor,
  encodeMobileSyncCursor,
  encodeMobileSyncSnapshotCursor,
  type MobileSyncRepository,
} from "../src/db/mobile-sync";
import type { TenantResolver } from "../src/db/tenants";
import type { RateLimiter } from "../src/rate-limit";
import type { Bindings } from "../src/types";

const databases: DatabaseSync[] = [];

function d1FromSqlite(database: DatabaseSync, beforeBatch?: () => void): D1Database {
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
      beforeBatch?.();
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

function createSyncEnvironment(beforeTransferMigration?: (database: DatabaseSync) => void): {
  env: Bindings;
  database: DatabaseSync;
} {
  const database = new DatabaseSync(":memory:");
  databases.push(database);
  database.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE tenants (id text PRIMARY KEY NOT NULL, kind text NOT NULL, name text NOT NULL);
    CREATE TABLE effective_pro_entitlements (tenant_id text PRIMARY KEY NOT NULL);
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
  beforeTransferMigration?.(database);
  const transferMigration = readFileSync(
    new URL("../../../db/migrations/0036_mobile_sync_atomic_transfers.sql", import.meta.url),
    "utf8",
  );
  for (const statement of transferMigration
    .split("--> statement-breakpoint")
    .map((part) => part.trim())
    .filter(Boolean)) {
    database.exec(statement);
  }
  const acknowledgementMigration = readFileSync(
    new URL("../../../db/migrations/0037_mobile_sync_client_acknowledgements.sql", import.meta.url),
    "utf8",
  );
  for (const statement of acknowledgementMigration
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
    expect(decodeMobileSyncSnapshotCursor(encodeMobileSyncSnapshotCursor(12_345))).toBe(12_345);
    expect(() => decodeMobileSyncSnapshotCursor("s1.00")).toThrow();
  });
});

describe("mobile sync client acknowledgement", () => {
  const clientId = "00000000-0000-4000-8000-000000000001";

  it("advances monotonically and never accepts a regressed client cursor", async () => {
    const { env, database } = createSyncEnvironment();
    const repository = createMobileSyncRepository();
    const currentSequence = Number(
      database
        .prepare("SELECT sequence FROM mobile_sync_state WHERE tenant_id = ?")
        .get("tenant-1")!.sequence,
    );

    await expect(
      repository.acknowledge(env, "tenant-1", {
        protocolVersion: 1,
        clientId,
        cursor: encodeMobileSyncCursor(currentSequence),
      }),
    ).resolves.toEqual({
      protocolVersion: 1,
      acknowledgedCursor: encodeMobileSyncCursor(currentSequence),
      retentionFloorCursor: "v1.0",
    });
    expect(
      database
        .prepare(
          `SELECT acknowledged_sequence AS acknowledgedSequence
           FROM mobile_sync_clients WHERE tenant_id = ? AND client_id = ?`,
        )
        .get("tenant-1", clientId),
    ).toEqual({ acknowledgedSequence: currentSequence });

    await expect(
      repository.acknowledge(env, "tenant-1", {
        protocolVersion: 1,
        clientId,
        cursor: encodeMobileSyncCursor(currentSequence - 1),
      }),
    ).rejects.toMatchObject({ status: 409, code: "full_resync_required" });
  });

  it("rejects acknowledgements outside the current retention window", async () => {
    const { env, database } = createSyncEnvironment();
    const repository = createMobileSyncRepository();
    database
      .prepare(
        "UPDATE mobile_sync_state SET retention_floor_sequence = 2 WHERE tenant_id = 'tenant-1'",
      )
      .run();

    await expect(
      repository.acknowledge(env, "tenant-1", {
        protocolVersion: 1,
        clientId,
        cursor: "v1.1",
      }),
    ).rejects.toMatchObject({ status: 409, code: "full_resync_required" });
    await expect(
      repository.acknowledge(env, "tenant-1", {
        protocolVersion: 1,
        clientId,
        cursor: "v1.z",
      }),
    ).rejects.toMatchObject({ status: 409, code: "full_resync_required" });
  });
});

describe("mobile sync full snapshot", () => {
  const clientId = "00000000-0000-4000-8000-000000000001";

  it("keeps a stable server sequence across resumable pages", async () => {
    const { env, database } = createSyncEnvironment();
    const repository = createMobileSyncRepository(vi.fn(async () => true));
    const first = await repository.snapshot(env, "tenant-1", {
      protocolVersion: 1,
      clientId,
      snapshotCursor: null,
      offset: 0,
      limit: 2,
    });
    expect(first).toMatchObject({
      snapshotCursor: "s1.3",
      nextOffset: 2,
      hasMore: true,
      resumeCursor: "v1.3",
    });
    expect(first.changes.map((change) => change.entityId)).toEqual(["account-1", "category-1"]);

    database
      .prepare("INSERT INTO accounts (id, tenant_id, name, type) VALUES (?, ?, ?, ?)")
      .run("account-after-snapshot", "tenant-1", "Later", "cash");
    const second = await repository.snapshot(env, "tenant-1", {
      protocolVersion: 1,
      clientId,
      snapshotCursor: first.snapshotCursor,
      offset: first.nextOffset,
      limit: 2,
    });
    expect(second).toMatchObject({ nextOffset: 3, hasMore: false, resumeCursor: "v1.3" });
    expect(second.changes.map((change) => change.entityId)).toEqual(["transaction-1"]);
    expect(JSON.stringify(second)).not.toContain("account-after-snapshot");
  });

  it("binds a resumable snapshot to one non-expired installation session", async () => {
    const { env, database } = createSyncEnvironment();
    const repository = createMobileSyncRepository();
    const first = await repository.snapshot(env, "tenant-1", {
      protocolVersion: 1,
      clientId,
      snapshotCursor: null,
      offset: 0,
      limit: 1,
    });
    await expect(
      repository.snapshot(env, "tenant-1", {
        protocolVersion: 1,
        clientId: "00000000-0000-4000-8000-000000000002",
        snapshotCursor: first.snapshotCursor,
        offset: first.nextOffset,
        limit: 1,
      }),
    ).rejects.toMatchObject({ status: 409, code: "full_resync_required" });

    database
      .prepare(
        `UPDATE mobile_sync_clients SET snapshot_expires_at = datetime('now', '-1 second')
         WHERE tenant_id = ? AND client_id = ?`,
      )
      .run("tenant-1", clientId);
    await expect(
      repository.snapshot(env, "tenant-1", {
        protocolVersion: 1,
        clientId,
        snapshotCursor: first.snapshotCursor,
        offset: first.nextOffset,
        limit: 1,
      }),
    ).rejects.toMatchObject({ status: 409, code: "full_resync_required" });
  });
});

describe("mobile sync retention compaction", () => {
  const clientId = "00000000-0000-4000-8000-000000000001";

  it("removes only old acknowledged superseded rows and tombstones", async () => {
    const { env, database } = createSyncEnvironment();
    const repository = createMobileSyncRepository(vi.fn(async () => true));
    const entityId = "00000000-0000-4000-8000-000000000010";
    await repository.push(env, "tenant-1", {
      protocolVersion: 1,
      clientId,
      operations: [
        {
          operationId: "00000000-0000-4000-8000-000000000011",
          idempotencyKey: "00000000-0000-4000-8000-000000000012",
          entityType: "transaction",
          entityId,
          operationType: "create",
          baseRevision: 0,
          dependencyIds: [],
          payload: {
            kind: "expense",
            accountId: "account-1",
            categoryId: "category-1",
            date: "2026-01-01",
            description: "Old temporary row",
            amountMinor: 100,
            currency: "PHP",
          },
        },
      ],
    });
    await repository.push(env, "tenant-1", {
      protocolVersion: 1,
      clientId,
      operations: [
        {
          operationId: "00000000-0000-4000-8000-000000000013",
          idempotencyKey: "00000000-0000-4000-8000-000000000014",
          entityType: "transaction",
          entityId,
          operationType: "delete",
          baseRevision: 1,
          dependencyIds: [],
          payload: {},
        },
      ],
    });
    const sequence = Number(
      database
        .prepare("SELECT sequence FROM mobile_sync_state WHERE tenant_id = ?")
        .get("tenant-1")!.sequence,
    );
    await repository.acknowledge(env, "tenant-1", {
      protocolVersion: 1,
      clientId,
      cursor: encodeMobileSyncCursor(sequence),
    });
    database
      .prepare(
        `UPDATE mobile_sync_changes SET server_updated_at = '2025-01-01 00:00:00'
         WHERE tenant_id = ?`,
      )
      .run("tenant-1");

    await expect(compactMobileSyncChanges(env, "2026-08-14 00:00:00")).resolves.toMatchObject({
      tenants: 1,
      deletedChanges: 2,
    });
    expect(
      database
        .prepare("SELECT count(*) AS count FROM mobile_sync_changes WHERE entity_id = ?")
        .get(entityId),
    ).toEqual({ count: 0 });
    expect(
      database
        .prepare(
          `SELECT retention_floor_sequence AS retentionFloorSequence
           FROM mobile_sync_state WHERE tenant_id = ?`,
        )
        .get("tenant-1"),
    ).toEqual({ retentionFloorSequence: sequence });
    expect(
      database
        .prepare("SELECT count(*) AS count FROM mobile_sync_changes WHERE entity_id = ?")
        .get("account-1"),
    ).toEqual({ count: 1 });
  });

  it("does not compact while a resumable full snapshot is active", async () => {
    const { env, database } = createSyncEnvironment();
    const repository = createMobileSyncRepository();
    const sequence = Number(
      database
        .prepare("SELECT sequence FROM mobile_sync_state WHERE tenant_id = ?")
        .get("tenant-1")!.sequence,
    );
    await repository.acknowledge(env, "tenant-1", {
      protocolVersion: 1,
      clientId,
      cursor: encodeMobileSyncCursor(sequence),
    });
    await repository.snapshot(env, "tenant-1", {
      protocolVersion: 1,
      clientId,
      snapshotCursor: null,
      offset: 0,
      limit: 1,
    });
    database
      .prepare("UPDATE mobile_sync_changes SET server_updated_at = '2025-01-01 00:00:00'")
      .run();

    await expect(compactMobileSyncChanges(env, "2026-08-14 00:00:00")).resolves.toMatchObject({
      tenants: 0,
      deletedChanges: 0,
    });
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

  it("requires a safe full resync when a cursor predates retained changes", async () => {
    const { env, database } = createSyncEnvironment();
    const repository = createMobileSyncRepository();
    database
      .prepare(
        "UPDATE mobile_sync_state SET retention_floor_sequence = 2 WHERE tenant_id = 'tenant-1'",
      )
      .run();
    await expect(
      repository.pull(env, "tenant-1", {
        protocolVersion: 1,
        cursor: "v1.1",
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

  it("does not misclassify an unpaired historical transfer as an atomic group", async () => {
    const { env, database } = createSyncEnvironment();
    const repository = createMobileSyncRepository(vi.fn(async () => true));
    database
      .prepare("INSERT INTO categories (id, tenant_id, name, kind, color) VALUES (?, ?, ?, ?, ?)")
      .run("category-transfer", "tenant-1", "Transfer", "transfer", "#008877");
    const cursor = Number(
      database
        .prepare("SELECT sequence FROM mobile_sync_state WHERE tenant_id = ?")
        .get("tenant-1")!.sequence,
    );
    database
      .prepare(
        `INSERT INTO transactions (
          id, tenant_id, account_id, category_id, date, description, amount_minor,
          currency, kind, transfer_group_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        "legacy-transfer-leg",
        "tenant-1",
        "account-1",
        "category-transfer",
        "2026-08-14",
        "Historical transfer",
        -10_000,
        "PHP",
        "transfer",
        "legacy-unpaired-group",
      );

    expect(
      database
        .prepare(
          `SELECT count(*) AS count
           FROM mobile_sync_change_groups groups
           JOIN mobile_sync_changes changes
             ON changes.tenant_id = groups.tenant_id AND changes.sequence = groups.sequence
           WHERE changes.entity_id = ?`,
        )
        .get("legacy-transfer-leg"),
    ).toEqual({ count: 0 });
    const pulled = await repository.pull(env, "tenant-1", {
      protocolVersion: 1,
      cursor: encodeMobileSyncCursor(cursor),
      limit: 1,
    });
    expect(pulled.changes).toHaveLength(1);
    expect(pulled.changes[0]).toMatchObject({
      entityType: "transaction",
      entityId: "legacy-transfer-leg",
      payload: { transferGroupId: "legacy-unpaired-group" },
    });
  });

  it("does not bootstrap an unbalanced historical pair as an atomic group", () => {
    const { database } = createSyncEnvironment((databaseBeforeMigration) => {
      databaseBeforeMigration
        .prepare("INSERT INTO accounts (id, tenant_id, name, type) VALUES (?, ?, ?, ?)")
        .run("account-3", "tenant-1", "Savings", "savings");
      databaseBeforeMigration
        .prepare("INSERT INTO categories (id, tenant_id, name, kind, color) VALUES (?, ?, ?, ?, ?)")
        .run("category-transfer", "tenant-1", "Transfer", "transfer", "#008877");
      const insert = databaseBeforeMigration.prepare(
        `INSERT INTO transactions (
          id, tenant_id, account_id, category_id, date, description, amount_minor,
          currency, kind, transfer_group_id, transfer_fee_minor
        ) VALUES (?, 'tenant-1', ?, 'category-transfer', '2026-08-14',
          'Malformed historical transfer', ?, 'PHP', 'transfer', 'legacy-unbalanced-group', ?)`,
      );
      insert.run("legacy-transfer-out", "account-1", -10_000, 0);
      insert.run("legacy-transfer-in", "account-3", 9_000, null);
    });

    expect(
      database
        .prepare("SELECT count(*) AS count FROM transfer_groups WHERE id = ?")
        .get("legacy-unbalanced-group"),
    ).toEqual({ count: 0 });
    expect(
      database
        .prepare(
          `SELECT count(*) AS count
           FROM mobile_sync_change_groups groups
           JOIN mobile_sync_changes changes
             ON changes.tenant_id = groups.tenant_id AND changes.sequence = groups.sequence
           WHERE changes.entity_id IN (?, ?)`,
        )
        .get("legacy-transfer-out", "legacy-transfer-in"),
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

describe("mobile sync atomic transfer repository", () => {
  const clientId = "30000000-0000-4000-8000-000000000001";
  const groupId = "30000000-0000-4000-8000-000000000002";
  const fromId = "30000000-0000-4000-8000-000000000003";
  const toId = "30000000-0000-4000-8000-000000000004";

  function seedTransferReferences(database: DatabaseSync): void {
    database
      .prepare("INSERT INTO accounts (id, tenant_id, name, type) VALUES (?, ?, ?, ?)")
      .run("account-savings", "tenant-1", "Savings", "savings");
    database
      .prepare("INSERT INTO categories (id, tenant_id, name, kind, color) VALUES (?, ?, ?, ?, ?)")
      .run("category-transfer", "tenant-1", "Transfer", "transfer", "#008877");
  }

  function createTransfer() {
    return {
      protocolVersion: 1 as const,
      clientId,
      operations: [
        {
          operationId: "30000000-0000-4000-8000-000000000005",
          idempotencyKey: "30000000-0000-4000-8000-000000000006",
          entityType: "transfer" as const,
          entityId: groupId,
          operationType: "create" as const,
          baseRevision: 0 as const,
          dependencyIds: [],
          payload: {
            fromTransactionId: fromId,
            toTransactionId: toId,
            transfer: {
              kind: "transfer" as const,
              date: "2026-08-14",
              description: "Emergency fund",
              amountMinor: 50_000,
              transferFeeMinor: 500,
              currency: "PHP" as const,
              categoryId: "category-transfer",
              fromAccountId: "account-1",
              toAccountId: "account-savings",
            },
          },
        },
      ],
    };
  }

  it("creates, pages, updates, conflicts, and deletes both legs atomically", async () => {
    const { env, database } = createSyncEnvironment();
    const repository = createMobileSyncRepository(vi.fn(async () => true));
    seedTransferReferences(database);
    const beforeCreate = Number(
      database
        .prepare("SELECT sequence FROM mobile_sync_state WHERE tenant_id = ?")
        .get("tenant-1")!.sequence,
    );
    const create = createTransfer();

    const created = await repository.push(env, "tenant-1", create);
    expect(await repository.push(env, "tenant-1", create)).toEqual(created);
    expect(created.results[0]).toMatchObject({ status: "acknowledged", revision: 1 });
    expect(
      database
        .prepare(
          `SELECT id, account_id, amount_minor, transfer_fee_minor, revision
           FROM transactions WHERE transfer_group_id = ? ORDER BY amount_minor`,
        )
        .all(groupId),
    ).toEqual([
      {
        id: fromId,
        account_id: "account-1",
        amount_minor: -50_000,
        transfer_fee_minor: 500,
        revision: 1,
      },
      {
        id: toId,
        account_id: "account-savings",
        amount_minor: 49_500,
        transfer_fee_minor: null,
        revision: 1,
      },
    ]);

    const createPull = await repository.pull(env, "tenant-1", {
      protocolVersion: 1,
      cursor: encodeMobileSyncCursor(beforeCreate),
      limit: 1,
    });
    expect(createPull.changes).toHaveLength(2);
    expect(createPull.changes.map((change) => change.entityId)).toEqual([fromId, toId]);
    await expect(
      repository.pull(env, "tenant-1", {
        protocolVersion: 1,
        cursor: encodeMobileSyncCursor(beforeCreate + 1),
        limit: 10,
      }),
    ).rejects.toMatchObject({ status: 409, code: "full_resync_required" });

    const update = {
      protocolVersion: 1 as const,
      clientId,
      operations: [
        {
          operationId: "30000000-0000-4000-8000-000000000007",
          idempotencyKey: "30000000-0000-4000-8000-000000000008",
          entityType: "transfer" as const,
          entityId: groupId,
          operationType: "update" as const,
          baseRevision: 1,
          dependencyIds: [],
          payload: {
            transfer: {
              ...create.operations[0]!.payload.transfer,
              description: "Emergency reserve",
              amountMinor: 60_000,
              transferFeeMinor: 0,
            },
          },
        },
      ],
    };
    expect((await repository.push(env, "tenant-1", update)).results[0]).toMatchObject({
      status: "acknowledged",
      revision: 2,
    });
    expect(
      database
        .prepare(
          "SELECT description, amount_minor, revision FROM transactions WHERE transfer_group_id = ? ORDER BY amount_minor",
        )
        .all(groupId),
    ).toEqual([
      { description: "Emergency reserve", amount_minor: -60_000, revision: 2 },
      { description: "Emergency reserve", amount_minor: 60_000, revision: 2 },
    ]);

    const stale = structuredClone(update);
    stale.operations[0]!.operationId = "30000000-0000-4000-8000-000000000009";
    stale.operations[0]!.idempotencyKey = "30000000-0000-4000-8000-000000000010";
    const conflict = await repository.push(env, "tenant-1", stale);
    expect(conflict.results[0]).toMatchObject({
      status: "conflict",
      code: "stale_revision",
      serverRevision: 2,
      serverPayload: {
        id: groupId,
        fromTransactionId: fromId,
        toTransactionId: toId,
        amountMinor: 60_000,
      },
    });

    const removed = await repository.push(env, "tenant-1", {
      protocolVersion: 1,
      clientId,
      operations: [
        {
          operationId: "30000000-0000-4000-8000-000000000011",
          idempotencyKey: "30000000-0000-4000-8000-000000000012",
          entityType: "transfer",
          entityId: groupId,
          operationType: "delete",
          baseRevision: 2,
          dependencyIds: [],
          payload: {},
        },
      ],
    });
    expect(removed.results[0]).toMatchObject({ status: "acknowledged", revision: 3 });
    expect(
      database
        .prepare("SELECT count(*) AS count FROM transactions WHERE transfer_group_id = ?")
        .get(groupId),
    ).toEqual({ count: 0 });
    expect(
      database.prepare("SELECT count(*) AS count FROM transfer_groups WHERE id = ?").get(groupId),
    ).toEqual({ count: 0 });
  });

  it("rolls back a partial create when either client leg ID collides", async () => {
    const { env, database } = createSyncEnvironment();
    const repository = createMobileSyncRepository(vi.fn(async () => true));
    seedTransferReferences(database);
    const create = createTransfer();
    create.operations[0]!.payload.toTransactionId = "transaction-1";

    const result = await repository.push(env, "tenant-1", create);
    expect(result.results[0]).toMatchObject({ status: "rejected", code: "invalid_operation" });
    expect(
      database.prepare("SELECT id FROM transactions WHERE id = ?").get(fromId),
    ).toBeUndefined();
    expect(
      database.prepare("SELECT id FROM transfer_groups WHERE id = ?").get(groupId),
    ).toBeUndefined();
  });
});

describe("mobile sync account and category push repository", () => {
  const clientId = "10000000-0000-4000-8000-000000000001";

  it("creates, updates, and archives a client-ID account idempotently", async () => {
    const { env, database } = createSyncEnvironment();
    const repository = createMobileSyncRepository(vi.fn(async () => false));
    const entityId = "10000000-0000-4000-8000-000000000002";
    const create = {
      protocolVersion: 1 as const,
      clientId,
      operations: [
        {
          operationId: "10000000-0000-4000-8000-000000000003",
          idempotencyKey: "10000000-0000-4000-8000-000000000004",
          entityType: "account" as const,
          entityId,
          operationType: "create" as const,
          baseRevision: 0 as const,
          dependencyIds: [],
          payload: { name: "Offline savings", type: "savings" as const },
        },
      ],
    };

    const first = await repository.push(env, "tenant-1", create);
    expect(await repository.push(env, "tenant-1", create)).toEqual(first);
    expect(first.results[0]).toMatchObject({ status: "acknowledged", revision: 1 });

    const updated = await repository.push(env, "tenant-1", {
      protocolVersion: 1,
      clientId,
      operations: [
        {
          operationId: "10000000-0000-4000-8000-000000000005",
          idempotencyKey: "10000000-0000-4000-8000-000000000006",
          entityType: "account",
          entityId,
          operationType: "update",
          baseRevision: 1,
          dependencyIds: [],
          payload: { name: "Emergency savings", type: "savings" },
        },
      ],
    });
    expect(updated.results[0]).toMatchObject({ status: "acknowledged", revision: 2 });

    const archived = await repository.push(env, "tenant-1", {
      protocolVersion: 1,
      clientId,
      operations: [
        {
          operationId: "10000000-0000-4000-8000-000000000007",
          idempotencyKey: "10000000-0000-4000-8000-000000000008",
          entityType: "account",
          entityId,
          operationType: "delete",
          baseRevision: 2,
          dependencyIds: [],
          payload: {},
        },
      ],
    });
    expect(archived.results[0]).toMatchObject({ status: "acknowledged", revision: 3 });
    expect(
      database.prepare("SELECT name, archived, revision FROM accounts WHERE id = ?").get(entityId),
    ).toEqual({ name: "Emergency savings", archived: 1, revision: 3 });
    expect(
      database
        .prepare(
          "SELECT operation FROM mobile_sync_changes WHERE entity_id = ? ORDER BY sequence DESC LIMIT 1",
        )
        .get(entityId),
    ).toEqual({ operation: "upsert" });
  });

  it("protects account names, system rows, revisions, and tenant ownership", async () => {
    const { env, database } = createSyncEnvironment();
    const repository = createMobileSyncRepository(vi.fn(async () => false));
    database.prepare("UPDATE accounts SET system_key = ? WHERE id = ?").run("cash", "account-1");

    const duplicate = await repository.push(env, "tenant-1", {
      protocolVersion: 1,
      clientId,
      operations: [
        {
          operationId: "11000000-0000-4000-8000-000000000001",
          idempotencyKey: "11000000-0000-4000-8000-000000000002",
          entityType: "account",
          entityId: "11000000-0000-4000-8000-000000000003",
          operationType: "create",
          baseRevision: 0,
          dependencyIds: [],
          payload: { name: "wallet", type: "cash" },
        },
      ],
    });
    expect(duplicate.results[0]).toMatchObject({ status: "rejected", code: "invalid_operation" });

    const protectedEdit = await repository.push(env, "tenant-1", {
      protocolVersion: 1,
      clientId,
      operations: [
        {
          operationId: "11000000-0000-4000-8000-000000000004",
          idempotencyKey: "11000000-0000-4000-8000-000000000005",
          entityType: "account",
          entityId: "account-1",
          operationType: "update",
          baseRevision: 2,
          dependencyIds: [],
          payload: { name: "Renamed system account" },
        },
      ],
    });
    expect(protectedEdit.results[0]).toMatchObject({
      status: "rejected",
      code: "invalid_operation",
    });

    database.prepare("UPDATE accounts SET type = ? WHERE id = ?").run("checking", "account-1");
    const stale = await repository.push(env, "tenant-1", {
      protocolVersion: 1,
      clientId,
      operations: [
        {
          operationId: "11000000-0000-4000-8000-000000000006",
          idempotencyKey: "11000000-0000-4000-8000-000000000007",
          entityType: "account",
          entityId: "account-1",
          operationType: "update",
          baseRevision: 2,
          dependencyIds: [],
          payload: { name: "Wallet", type: "cash" },
        },
      ],
    });
    expect(stale.results[0]).toMatchObject({
      status: "conflict",
      code: "stale_revision",
      serverRevision: 3,
      serverPayload: { type: "checking" },
    });

    const otherTenant = await repository.push(env, "tenant-1", {
      protocolVersion: 1,
      clientId,
      operations: [
        {
          operationId: "11000000-0000-4000-8000-000000000008",
          idempotencyKey: "11000000-0000-4000-8000-000000000009",
          entityType: "account",
          entityId: "account-2",
          operationType: "delete",
          baseRevision: 1,
          dependencyIds: [],
          payload: {},
        },
      ],
    });
    expect(otherTenant.results[0]).toMatchObject({
      status: "conflict",
      code: "entity_missing",
      serverPayload: null,
    });
  });

  it("enforces Free and Pro category creation atomically and preserves archive semantics", async () => {
    const { env, database } = createSyncEnvironment();
    const repository = createMobileSyncRepository(async (bindings, tenantId) =>
      Boolean(
        await bindings.DB.prepare(
          "SELECT 1 AS entitled FROM effective_pro_entitlements WHERE tenant_id = ?",
        )
          .bind(tenantId)
          .first(),
      ),
    );
    const freeCategoryId = "12000000-0000-4000-8000-000000000001";
    const free = await repository.push(env, "tenant-1", {
      protocolVersion: 1,
      clientId,
      operations: [
        {
          operationId: "12000000-0000-4000-8000-000000000002",
          idempotencyKey: "12000000-0000-4000-8000-000000000003",
          entityType: "category",
          entityId: freeCategoryId,
          operationType: "create",
          baseRevision: 0,
          dependencyIds: [],
          payload: { name: "Offline needs", kind: "expense", color: "#0F766E" },
        },
      ],
    });
    expect(free.results[0]).toMatchObject({ status: "acknowledged", revision: 1 });
    expect(
      database.prepare("SELECT required_plan FROM categories WHERE id = ?").get(freeCategoryId),
    ).toEqual({ required_plan: "free" });

    const limited = await repository.push(env, "tenant-1", {
      protocolVersion: 1,
      clientId,
      operations: [
        {
          operationId: "12000000-0000-4000-8000-000000000004",
          idempotencyKey: "12000000-0000-4000-8000-000000000005",
          entityType: "category",
          entityId: "12000000-0000-4000-8000-000000000006",
          operationType: "create",
          baseRevision: 0,
          dependencyIds: [],
          payload: { name: "Second free", kind: "expense", color: "#1D4ED8" },
        },
      ],
    });
    expect(limited.results[0]).toMatchObject({ status: "rejected", code: "plan_limit" });

    database
      .prepare("INSERT INTO effective_pro_entitlements (tenant_id) VALUES (?)")
      .run("tenant-1");
    const proCategoryId = "12000000-0000-4000-8000-000000000007";
    const pro = await repository.push(env, "tenant-1", {
      protocolVersion: 1,
      clientId,
      operations: [
        {
          operationId: "12000000-0000-4000-8000-000000000008",
          idempotencyKey: "12000000-0000-4000-8000-000000000009",
          entityType: "category",
          entityId: proCategoryId,
          operationType: "create",
          baseRevision: 0,
          dependencyIds: [],
          payload: { name: "Pro wants", kind: "expense", color: "#7C3AED" },
        },
      ],
    });
    expect(pro.results[0]).toMatchObject({ status: "acknowledged", revision: 1 });
    expect(
      database.prepare("SELECT required_plan FROM categories WHERE id = ?").get(proCategoryId),
    ).toEqual({ required_plan: "zoption_pro" });

    const archived = await repository.push(env, "tenant-1", {
      protocolVersion: 1,
      clientId,
      operations: [
        {
          operationId: "12000000-0000-4000-8000-000000000010",
          idempotencyKey: "12000000-0000-4000-8000-000000000011",
          entityType: "category",
          entityId: proCategoryId,
          operationType: "delete",
          baseRevision: 1,
          dependencyIds: [],
          payload: {},
        },
      ],
    });
    expect(archived.results[0]).toMatchObject({ status: "acknowledged", revision: 2 });
    expect(
      database.prepare("SELECT archived, revision FROM categories WHERE id = ?").get(proCategoryId),
    ).toEqual({ archived: 1, revision: 2 });
  });

  it("rejects category name collisions, protected rows, and dependency graphs fail-closed", async () => {
    const { env, database } = createSyncEnvironment();
    const repository = createMobileSyncRepository(vi.fn(async () => false));
    database
      .prepare("UPDATE categories SET system_key = ? WHERE id = ?")
      .run("expense", "category-1");

    const duplicate = await repository.push(env, "tenant-1", {
      protocolVersion: 1,
      clientId,
      operations: [
        {
          operationId: "13000000-0000-4000-8000-000000000001",
          idempotencyKey: "13000000-0000-4000-8000-000000000002",
          entityType: "category",
          entityId: "13000000-0000-4000-8000-000000000003",
          operationType: "create",
          baseRevision: 0,
          dependencyIds: [],
          payload: { name: "dining", kind: "income", color: "#111827" },
        },
      ],
    });
    expect(duplicate.results[0]).toMatchObject({ status: "rejected", code: "invalid_operation" });

    const protectedCategory = await repository.push(env, "tenant-1", {
      protocolVersion: 1,
      clientId,
      operations: [
        {
          operationId: "13000000-0000-4000-8000-000000000004",
          idempotencyKey: "13000000-0000-4000-8000-000000000005",
          entityType: "category",
          entityId: "category-1",
          operationType: "update",
          baseRevision: 2,
          dependencyIds: [],
          payload: { color: "#FFFFFF" },
        },
      ],
    });
    expect(protectedCategory.results[0]).toMatchObject({
      status: "rejected",
      code: "invalid_operation",
    });

    const dependentId = "13000000-0000-4000-8000-000000000006";
    const dependent = await repository.push(env, "tenant-1", {
      protocolVersion: 1,
      clientId,
      operations: [
        {
          operationId: "13000000-0000-4000-8000-000000000007",
          idempotencyKey: "13000000-0000-4000-8000-000000000008",
          entityType: "account",
          entityId: dependentId,
          operationType: "create",
          baseRevision: 0,
          dependencyIds: ["13000000-0000-4000-8000-000000000009"],
          payload: { name: "Dependent account", type: "cash" },
        },
      ],
    });
    expect(dependent.results[0]).toMatchObject({
      status: "rejected",
      code: "unsupported_operation",
    });
    expect(
      database.prepare("SELECT id FROM accounts WHERE id = ?").get(dependentId),
    ).toBeUndefined();
  });

  it("commits new references and their dependent transaction as one idempotent graph", async () => {
    const { env, database } = createSyncEnvironment();
    const repository = createMobileSyncRepository(vi.fn(async () => false));
    const accountId = "15000000-0000-4000-8000-000000000001";
    const categoryId = "15000000-0000-4000-8000-000000000002";
    const transactionId = "15000000-0000-4000-8000-000000000003";
    const accountOperationId = "15000000-0000-4000-8000-000000000004";
    const categoryOperationId = "15000000-0000-4000-8000-000000000005";
    const input = {
      protocolVersion: 1 as const,
      clientId,
      operations: [
        {
          operationId: accountOperationId,
          idempotencyKey: "15000000-0000-4000-8000-000000000006",
          entityType: "account" as const,
          entityId: accountId,
          operationType: "create" as const,
          baseRevision: 0 as const,
          dependencyIds: [],
          payload: { name: "Graph wallet", type: "cash" as const },
        },
        {
          operationId: categoryOperationId,
          idempotencyKey: "15000000-0000-4000-8000-000000000007",
          entityType: "category" as const,
          entityId: categoryId,
          operationType: "create" as const,
          baseRevision: 0 as const,
          dependencyIds: [],
          payload: { name: "Graph dining", kind: "expense" as const, color: "#0F766E" },
        },
        {
          operationId: "15000000-0000-4000-8000-000000000008",
          idempotencyKey: "15000000-0000-4000-8000-000000000009",
          entityType: "transaction" as const,
          entityId: transactionId,
          operationType: "create" as const,
          baseRevision: 0 as const,
          dependencyIds: [accountOperationId, categoryOperationId],
          payload: {
            kind: "expense" as const,
            accountId,
            categoryId,
            date: "2026-08-13",
            description: "Atomic graph purchase",
            amountMinor: 5_000,
            currency: "PHP" as const,
          },
        },
      ],
    };

    const first = await repository.push(env, "tenant-1", input);
    expect(await repository.push(env, "tenant-1", input)).toEqual(first);
    expect(first.results).toMatchObject([
      { status: "acknowledged", revision: 1 },
      { status: "acknowledged", revision: 1 },
      { status: "acknowledged", revision: 1 },
    ]);
    expect(database.prepare("SELECT name FROM accounts WHERE id = ?").get(accountId)).toEqual({
      name: "Graph wallet",
    });
    expect(database.prepare("SELECT name FROM categories WHERE id = ?").get(categoryId)).toEqual({
      name: "Graph dining",
    });
    expect(
      database
        .prepare("SELECT account_id, category_id, amount_minor FROM transactions WHERE id = ?")
        .get(transactionId),
    ).toEqual({ account_id: accountId, category_id: categoryId, amount_minor: -5_000 });
    expect(
      database
        .prepare("SELECT count(*) AS count FROM mobile_sync_idempotency WHERE tenant_id = ?")
        .get("tenant-1"),
    ).toEqual({ count: 3 });
  });

  it("rejects disconnected dependency graphs as one unsupported atomic batch", async () => {
    const { env, database } = createSyncEnvironment();
    const repository = createMobileSyncRepository(vi.fn(async () => true));
    const accountIds = [crypto.randomUUID(), crypto.randomUUID()];
    const operations = accountIds.flatMap((accountId, index) => {
      const accountOperationId = crypto.randomUUID();
      return [
        {
          operationId: accountOperationId,
          idempotencyKey: crypto.randomUUID(),
          entityType: "account" as const,
          entityId: accountId,
          operationType: "create" as const,
          baseRevision: 0 as const,
          dependencyIds: [],
          payload: { name: `Disconnected wallet ${index}`, type: "cash" as const },
        },
        {
          operationId: crypto.randomUUID(),
          idempotencyKey: crypto.randomUUID(),
          entityType: "transaction" as const,
          entityId: crypto.randomUUID(),
          operationType: "create" as const,
          baseRevision: 0 as const,
          dependencyIds: [accountOperationId],
          payload: {
            kind: "expense" as const,
            accountId,
            categoryId: "category-1",
            date: "2026-08-14",
            description: `Disconnected purchase ${index}`,
            amountMinor: 1_000,
            currency: "PHP" as const,
          },
        },
      ];
    });

    const result = await repository.push(env, "tenant-1", {
      protocolVersion: 1,
      clientId,
      operations,
    });
    expect(result.results).toHaveLength(4);
    expect(result.results.every((item) => item.status === "rejected")).toBe(true);
    expect(result.results).toMatchObject([
      { code: "unsupported_operation" },
      { code: "unsupported_operation" },
      { code: "unsupported_operation" },
      { code: "unsupported_operation" },
    ]);
    expect(
      database
        .prepare("SELECT count(*) AS count FROM accounts WHERE id IN (?, ?)")
        .get(...accountIds),
    ).toEqual({ count: 0 });
  });

  it("rolls back every graph mutation when a guarded statement loses a race", async () => {
    const { env, database } = createSyncEnvironment();
    const repository = createMobileSyncRepository(vi.fn(async () => true));
    const accountId = "16000000-0000-4000-8000-000000000001";
    const accountOperationId = "16000000-0000-4000-8000-000000000002";
    let injectRace = true;
    env.DB = d1FromSqlite(database, () => {
      if (!injectRace) return;
      injectRace = false;
      database
        .prepare("INSERT INTO accounts (id, tenant_id, name, type) VALUES (?, ?, ?, ?)")
        .run("race-account", "tenant-1", "Raced graph wallet", "cash");
    });
    const input = {
      protocolVersion: 1 as const,
      clientId,
      operations: [
        {
          operationId: accountOperationId,
          idempotencyKey: "16000000-0000-4000-8000-000000000003",
          entityType: "account" as const,
          entityId: accountId,
          operationType: "create" as const,
          baseRevision: 0 as const,
          dependencyIds: [],
          payload: { name: "Raced graph wallet", type: "cash" as const },
        },
        {
          operationId: "16000000-0000-4000-8000-000000000004",
          idempotencyKey: "16000000-0000-4000-8000-000000000005",
          entityType: "transaction" as const,
          entityId: "16000000-0000-4000-8000-000000000006",
          operationType: "create" as const,
          baseRevision: 0 as const,
          dependencyIds: [accountOperationId],
          payload: {
            kind: "expense" as const,
            accountId,
            categoryId: "category-1",
            date: "2026-08-13",
            description: "Must not commit",
            amountMinor: 1_000,
            currency: "PHP" as const,
          },
        },
      ],
    };

    await expect(repository.push(env, "tenant-1", input)).rejects.toThrow(
      "rolled back before acknowledgement",
    );
    expect(database.prepare("SELECT id FROM accounts WHERE id = ?").get(accountId)).toBeUndefined();
    expect(
      database
        .prepare("SELECT id FROM transactions WHERE id = ?")
        .get("16000000-0000-4000-8000-000000000006"),
    ).toBeUndefined();
    expect(
      database
        .prepare("SELECT count(*) AS count FROM mobile_sync_idempotency WHERE tenant_id = ?")
        .get("tenant-1"),
    ).toEqual({ count: 0 });

    const retry = await repository.push(env, "tenant-1", input);
    expect(retry.results).toMatchObject([
      { status: "rejected", code: "invalid_operation" },
      { status: "rejected", code: "dependency_failed" },
    ]);
  });

  it("returns an entitlement-derived category snapshot for stale conflicts", async () => {
    const { env, database } = createSyncEnvironment();
    const repository = createMobileSyncRepository(vi.fn(async () => false));
    database.prepare("UPDATE categories SET color = ? WHERE id = ?").run("#ABCDEF", "category-1");

    const stale = await repository.push(env, "tenant-1", {
      protocolVersion: 1,
      clientId,
      operations: [
        {
          operationId: "14000000-0000-4000-8000-000000000001",
          idempotencyKey: "14000000-0000-4000-8000-000000000002",
          entityType: "category",
          entityId: "category-1",
          operationType: "update",
          baseRevision: 1,
          dependencyIds: [],
          payload: { color: "#FFFFFF" },
        },
      ],
    });
    expect(stale.results[0]).toMatchObject({
      status: "conflict",
      code: "stale_revision",
      serverRevision: 2,
      serverPayload: { color: "#ABCDEF", requiredPlan: "zoption_pro", locked: true },
    });
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
    const acknowledge = vi.fn(async () => ({
      protocolVersion: 1 as const,
      acknowledgedCursor: "v1.3",
      retentionFloorCursor: "v1.0",
    }));
    const snapshot = vi.fn(async () => ({
      protocolVersion: 1 as const,
      snapshotCursor: "s1.3",
      changes: [],
      nextOffset: 0,
      hasMore: false,
      resumeCursor: "v1.3",
    }));
    const mobileSync: MobileSyncRepository = {
      acknowledge,
      pull,
      push,
      snapshot,
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

    const acknowledged = await app.request("/api/app/sync/acknowledge", {
      method: "POST",
      headers,
      body: JSON.stringify({
        protocolVersion: 1,
        clientId: "00000000-0000-4000-8000-000000000001",
        cursor: "v1.3",
      }),
    });
    expect(acknowledged.status).toBe(200);
    expect(acknowledge).toHaveBeenCalledWith(undefined, "tenant-safe", {
      protocolVersion: 1,
      clientId: "00000000-0000-4000-8000-000000000001",
      cursor: "v1.3",
    });

    const forgedAcknowledgement = await app.request("/api/app/sync/acknowledge", {
      method: "POST",
      headers,
      body: JSON.stringify({
        protocolVersion: 1,
        clientId: "00000000-0000-4000-8000-000000000001",
        cursor: "v1.3",
        tenantId: "tenant-other",
      }),
    });
    expect(forgedAcknowledgement.status).toBe(400);
    expect(acknowledge).toHaveBeenCalledTimes(1);

    const snapshotted = await app.request("/api/app/sync/snapshot", {
      method: "POST",
      headers,
      body: JSON.stringify({
        protocolVersion: 1,
        clientId: "00000000-0000-4000-8000-000000000001",
        snapshotCursor: null,
        offset: 0,
        limit: 10,
      }),
    });
    expect(snapshotted.status).toBe(200);
    expect(snapshot).toHaveBeenCalledWith(undefined, "tenant-safe", {
      protocolVersion: 1,
      clientId: "00000000-0000-4000-8000-000000000001",
      snapshotCursor: null,
      offset: 0,
      limit: 10,
    });

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
