import type { DatabaseSync } from "node:sqlite";

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
import { d1FromSqlite } from "./helpers/d1-test-harness";
import {
  createMobileSyncTestEnvironment,
  grantMobileSyncTestPro,
} from "./helpers/mobile-sync-test-environment";

const databases: DatabaseSync[] = [];

function createSyncEnvironment(beforeTransferMigration?: (database: DatabaseSync) => void): {
  env: Bindings;
  database: DatabaseSync;
} {
  const environment = createMobileSyncTestEnvironment(beforeTransferMigration);
  databases.push(environment.database);
  return environment;
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
      snapshotCursor: "s1.8",
      nextOffset: 2,
      hasMore: true,
      resumeCursor: "v1.8",
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
    expect(second).toMatchObject({ nextOffset: 4, hasMore: true, resumeCursor: "v1.8" });
    expect(second.changes.map((change) => change.entityId)).toEqual(["budget-1", "debt-1"]);
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
    expect(second).toMatchObject({ nextCursor: "v1.4", hasMore: true });
    expect(second.changes.map((change) => change.entityId)).toEqual(["transaction-1", "budget-1"]);

    const third = await repository.pull(env, "tenant-1", {
      protocolVersion: 1,
      cursor: second.nextCursor,
      limit: 2,
    });
    expect(third).toMatchObject({ hasMore: true });
    expect(third.changes.map((change) => change.entityId)).toEqual(["goal-1", "debt-1"]);
    const fourth = await repository.pull(env, "tenant-1", {
      protocolVersion: 1,
      cursor: third.nextCursor,
      limit: 2,
    });
    expect(fourth).toMatchObject({ hasMore: false });
    expect(fourth.changes.map((change) => change.entityId)).toEqual(["subscription-1", "event-1"]);
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
        entityType: "budget",
        entityId: "budget-1",
        revision: 1,
        operation: "upsert",
        payload: { categoryId: "category-1", month: "2026-08-01", limitMinor: 50000 },
      },
      {
        entityType: "goal",
        entityId: "goal-1",
        revision: 1,
        operation: "upsert",
        payload: { name: "Emergency Fund", targetAmountMinor: 100000, currentAmountMinor: 25000 },
      },
      {
        entityType: "debt",
        entityId: "debt-1",
        revision: 1,
        operation: "upsert",
        payload: { name: "Car Loan", type: "auto_loan", balanceMinor: 500000 },
      },
      {
        entityType: "subscription",
        entityId: "subscription-1",
        revision: 1,
        operation: "upsert",
        payload: { name: "Netflix", status: "canceled", billingCycle: "monthly" },
      },
      {
        entityType: "event",
        entityId: "event-1",
        revision: 1,
        operation: "upsert",
        payload: { title: "Birthday dinner", date: "2026-08-20", startTime: "18:00" },
      },
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
    expect(pulled.nextCursor).toBe("v1.a");
  });

  it("delivers a web-created subscription and its linked charge as adjacent group rows", async () => {
    const { env, database } = createSyncEnvironment();
    const repository = createMobileSyncRepository(vi.fn(async () => true));
    database.exec(
      "BEGIN;" +
        "INSERT INTO subscriptions (id, tenant_id, account_id, category_id, name, amount_minor, billing_cycle, next_billing_date, status) VALUES ('web-sub', 'tenant-1', 'account-1', 'category-1', 'Spotify', 19900, 'monthly', '2026-09-05', 'active');" +
        "INSERT INTO transactions (id, tenant_id, account_id, category_id, date, description, amount_minor, kind, subscription_id) VALUES ('web-charge', 'tenant-1', 'account-1', 'category-1', '2026-09-05', 'Spotify', -19900, 'expense', 'web-sub');" +
        "COMMIT;",
    );

    const pulled = await repository.pull(env, "tenant-1", {
      protocolVersion: 1,
      cursor: "v1.8",
      limit: 10,
    });
    expect(pulled.changes).toMatchObject([
      {
        entityType: "subscription",
        entityId: "web-sub",
        revision: 1,
        operation: "upsert",
        payload: { name: "Spotify", status: "active", amountMinor: 19900 },
      },
      {
        entityType: "transaction",
        entityId: "web-charge",
        revision: 1,
        operation: "upsert",
        payload: { description: "Spotify", amountMinor: -19900 },
      },
    ]);
    expect(pulled.nextCursor).toBe("v1.a");
    expect(pulled.hasMore).toBe(false);

    const snapshot = await repository.snapshot(env, "tenant-1", {
      protocolVersion: 1,
      clientId: "00000000-0000-4000-8000-000000000003",
      snapshotCursor: null,
      offset: 0,
      limit: 100,
    });
    expect(snapshot.hasMore).toBe(false);
    const ids = snapshot.changes.map((change) => change.entityId);
    expect(ids).toContain("web-sub");
    expect(ids).toContain("web-charge");
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

  it("updates automatic-interest settings atomically with account updates", async () => {
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
    const interest = {
      enabled: true,
      annualRateBasisPoints: 500,
      frequency: "monthly" as const,
      payDay: 15,
    };

    const notSavings = await repository.push(env, "tenant-1", {
      protocolVersion: 1,
      clientId,
      operations: [
        {
          operationId: "10000000-0000-4000-8000-0000000000a1",
          idempotencyKey: "10000000-0000-4000-8000-0000000000a2",
          entityType: "account",
          entityId: "account-1",
          operationType: "update",
          baseRevision: 1,
          dependencyIds: [],
          payload: { name: "Wallet", interest },
        },
      ],
    });
    expect(notSavings.results[0]).toMatchObject({
      status: "rejected",
      code: "invalid_operation",
    });
    expect(
      database.prepare("SELECT interest_enabled FROM accounts WHERE id = 'account-1'").get(),
    ).toEqual({ interest_enabled: 0 });

    const freeAttempt = await repository.push(env, "tenant-1", {
      protocolVersion: 1,
      clientId,
      operations: [
        {
          operationId: "10000000-0000-4000-8000-0000000000a3",
          idempotencyKey: "10000000-0000-4000-8000-0000000000a4",
          entityType: "account",
          entityId: "account-1",
          operationType: "update",
          baseRevision: 1,
          dependencyIds: [],
          payload: { name: "Wallet", type: "savings", interest },
        },
      ],
    });
    expect(freeAttempt.results[0]).toMatchObject({ status: "rejected", code: "plan_limit" });
    expect(
      database.prepare("SELECT type, interest_enabled FROM accounts WHERE id = 'account-1'").get(),
    ).toEqual({ type: "cash", interest_enabled: 0 });

    grantMobileSyncTestPro(database, "tenant-1");
    const pro = await repository.push(env, "tenant-1", {
      protocolVersion: 1,
      clientId,
      operations: [
        {
          operationId: "10000000-0000-4000-8000-0000000000a5",
          idempotencyKey: "10000000-0000-4000-8000-0000000000a6",
          entityType: "account",
          entityId: "account-1",
          operationType: "update",
          baseRevision: 1,
          dependencyIds: [],
          payload: { name: "Wallet", type: "savings", interest },
        },
      ],
    });
    expect(pro.results[0]).toMatchObject({ status: "acknowledged", revision: 2 });
    expect(
      database
        .prepare(
          "SELECT type, interest_enabled, annual_rate_basis_points, interest_frequency, interest_pay_day FROM accounts WHERE id = 'account-1'",
        )
        .get(),
    ).toEqual({
      type: "savings",
      interest_enabled: 1,
      annual_rate_basis_points: 500,
      interest_frequency: "monthly",
      interest_pay_day: 15,
    });

    const pulled = await repository.pull(env, "tenant-1", {
      protocolVersion: 1,
      cursor: "v1.8",
      limit: 20,
    });
    const accountChange = pulled.changes.find(
      (change) => change.entityType === "account" && change.entityId === "account-1",
    );
    expect(accountChange?.payload).toMatchObject({
      type: "savings",
      interest: { enabled: true, annualRateBasisPoints: 500, frequency: "monthly", payDay: 15 },
    });

    const disabled = await repository.push(env, "tenant-1", {
      protocolVersion: 1,
      clientId,
      operations: [
        {
          operationId: "10000000-0000-4000-8000-0000000000a7",
          idempotencyKey: "10000000-0000-4000-8000-0000000000a8",
          entityType: "account",
          entityId: "account-1",
          operationType: "update",
          baseRevision: 2,
          dependencyIds: [],
          payload: {
            name: "Wallet",
            interest: {
              enabled: false,
              annualRateBasisPoints: 0,
              frequency: "monthly",
              payDay: 15,
            },
          },
        },
      ],
    });
    expect(disabled.results[0]).toMatchObject({ status: "acknowledged", revision: 3 });
    expect(
      database
        .prepare(
          "SELECT interest_enabled, annual_rate_basis_points FROM accounts WHERE id = 'account-1'",
        )
        .get(),
    ).toEqual({ interest_enabled: 0, annual_rate_basis_points: 0 });

    const createdId = "10000000-0000-4000-8000-0000000000ab";
    const created = await repository.push(env, "tenant-1", {
      protocolVersion: 1,
      clientId,
      operations: [
        {
          operationId: "10000000-0000-4000-8000-0000000000ac",
          idempotencyKey: "10000000-0000-4000-8000-0000000000ad",
          entityType: "account",
          entityId: createdId,
          operationType: "create",
          baseRevision: 0,
          dependencyIds: [],
          payload: { name: "Goal fund", type: "savings", interest },
        },
      ],
    });
    expect(created.results[0]).toMatchObject({ status: "acknowledged", revision: 1 });
    expect(
      database
        .prepare(
          "SELECT interest_enabled, annual_rate_basis_points, interest_frequency, interest_pay_day FROM accounts WHERE id = ?",
        )
        .get(createdId),
    ).toEqual({
      interest_enabled: 1,
      annual_rate_basis_points: 500,
      interest_frequency: "monthly",
      interest_pay_day: 15,
    });

    const createFreeAttempt = await repository.push(env, "tenant-2", {
      protocolVersion: 1,
      clientId,
      operations: [
        {
          operationId: "10000000-0000-4000-8000-0000000000ae",
          idempotencyKey: "10000000-0000-4000-8000-0000000000af",
          entityType: "account",
          entityId: "10000000-0000-4000-8000-0000000000b0",
          operationType: "create",
          baseRevision: 0,
          dependencyIds: [],
          payload: { name: "Free savings", type: "savings", interest },
        },
      ],
    });
    expect(createFreeAttempt.results[0]).toMatchObject({ status: "rejected", code: "plan_limit" });
    expect(
      database
        .prepare("SELECT id FROM accounts WHERE id = '10000000-0000-4000-8000-0000000000b0'")
        .get(),
    ).toBeUndefined();
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

    grantMobileSyncTestPro(database, "tenant-1");
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

describe("mobile sync budget push repository", () => {
  const clientId = "20000000-0000-4000-8000-000000000001";

  it("creates and updates a month-scoped budget idempotently", async () => {
    const { env, database } = createSyncEnvironment();
    const repository = createMobileSyncRepository(vi.fn(async () => false));
    const entityId = "20000000-0000-4000-8000-000000000002";
    const create = {
      protocolVersion: 1 as const,
      clientId,
      operations: [
        {
          operationId: "20000000-0000-4000-8000-000000000003",
          idempotencyKey: "20000000-0000-4000-8000-000000000004",
          entityType: "budget" as const,
          entityId,
          operationType: "create" as const,
          baseRevision: 0 as const,
          dependencyIds: [],
          payload: { categoryId: "category-1", month: "2026-09-01", limitMinor: 75_000 },
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
          operationId: "20000000-0000-4000-8000-000000000005",
          idempotencyKey: "20000000-0000-4000-8000-000000000006",
          entityType: "budget",
          entityId,
          operationType: "update",
          baseRevision: 1,
          dependencyIds: [],
          payload: { limitMinor: 80_000 },
        },
      ],
    });
    expect(updated.results[0]).toMatchObject({ status: "acknowledged", revision: 2 });
    expect(
      database
        .prepare("SELECT limit_minor AS limitMinor, revision FROM budgets WHERE id = ?")
        .get(entityId),
    ).toEqual({ limitMinor: 80_000, revision: 2 });
    expect(
      database
        .prepare(
          "SELECT entity_type AS entityType, operation FROM mobile_sync_changes WHERE entity_id = ? ORDER BY sequence DESC LIMIT 1",
        )
        .get(entityId),
    ).toEqual({ entityType: "budget", operation: "upsert" });
  });

  it("rejects a duplicate month-category budget as an entity_exists conflict", async () => {
    const { env } = createSyncEnvironment();
    const repository = createMobileSyncRepository(vi.fn(async () => false));
    const duplicate = await repository.push(env, "tenant-1", {
      protocolVersion: 1,
      clientId,
      operations: [
        {
          operationId: "20000000-0000-4000-8000-000000000007",
          idempotencyKey: "20000000-0000-4000-8000-000000000008",
          entityType: "budget",
          entityId: "20000000-0000-4000-8000-000000000009",
          operationType: "create",
          baseRevision: 0,
          dependencyIds: [],
          payload: { categoryId: "category-1", month: "2026-08-01", limitMinor: 60_000 },
        },
      ],
    });
    expect(duplicate.results[0]).toMatchObject({
      status: "conflict",
      code: "entity_exists",
      serverPayload: {
        id: "budget-1",
        categoryId: "category-1",
        month: "2026-08-01",
        limitMinor: 50_000,
        revision: 1,
      },
    });
  });

  it("rejects a budget for a category the tenant does not own", async () => {
    const { env } = createSyncEnvironment();
    const repository = createMobileSyncRepository(vi.fn(async () => false));
    const rejected = await repository.push(env, "tenant-1", {
      protocolVersion: 1,
      clientId,
      operations: [
        {
          operationId: "20000000-0000-4000-8000-00000000000a",
          idempotencyKey: "20000000-0000-4000-8000-00000000000b",
          entityType: "budget",
          entityId: "20000000-0000-4000-8000-00000000000c",
          operationType: "create",
          baseRevision: 0,
          dependencyIds: [],
          payload: { categoryId: "category-2", month: "2026-09-01", limitMinor: 10_000 },
        },
      ],
    });
    expect(rejected.results[0]).toMatchObject({
      status: "rejected",
      code: "invalid_category",
    });
  });

  it("returns a stale revision conflict for an out-of-date budget update", async () => {
    const { env, database } = createSyncEnvironment();
    const repository = createMobileSyncRepository(vi.fn(async () => false));
    database.prepare("UPDATE budgets SET limit_minor = ? WHERE id = ?").run(90_000, "budget-1");

    const stale = await repository.push(env, "tenant-1", {
      protocolVersion: 1,
      clientId,
      operations: [
        {
          operationId: "20000000-0000-4000-8000-00000000000d",
          idempotencyKey: "20000000-0000-4000-8000-00000000000e",
          entityType: "budget",
          entityId: "budget-1",
          operationType: "update",
          baseRevision: 1,
          dependencyIds: [],
          payload: { limitMinor: 95_000 },
        },
      ],
    });
    expect(stale.results[0]).toMatchObject({
      status: "conflict",
      code: "stale_revision",
      serverRevision: 2,
      serverPayload: { id: "budget-1", limitMinor: 90_000 },
    });
  });
});

describe("mobile sync financial goal push repository", () => {
  const clientId = "30000000-0000-4000-8000-000000000001";

  it("creates, updates, and deletes a goal idempotently", async () => {
    const { env, database } = createSyncEnvironment();
    const repository = createMobileSyncRepository(vi.fn(async () => false));
    const entityId = "30000000-0000-4000-8000-000000000002";
    const create = {
      protocolVersion: 1 as const,
      clientId,
      operations: [
        {
          operationId: "30000000-0000-4000-8000-000000000003",
          idempotencyKey: "30000000-0000-4000-8000-000000000004",
          entityType: "goal" as const,
          entityId,
          operationType: "create" as const,
          baseRevision: 0 as const,
          dependencyIds: [],
          payload: {
            name: "House Fund",
            targetAmountMinor: 500_000,
            currentAmountMinor: 0,
            targetDate: "2027-12-31",
            status: "active" as const,
          },
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
          operationId: "30000000-0000-4000-8000-000000000005",
          idempotencyKey: "30000000-0000-4000-8000-000000000006",
          entityType: "goal",
          entityId,
          operationType: "update",
          baseRevision: 1,
          dependencyIds: [],
          payload: { currentAmountMinor: 120_000 },
        },
      ],
    });
    expect(updated.results[0]).toMatchObject({ status: "acknowledged", revision: 2 });
    expect(
      database
        .prepare(
          "SELECT current_amount_minor AS currentAmountMinor, revision FROM financial_goals WHERE id = ?",
        )
        .get(entityId),
    ).toEqual({ currentAmountMinor: 120_000, revision: 2 });

    const removed = await repository.push(env, "tenant-1", {
      protocolVersion: 1,
      clientId,
      operations: [
        {
          operationId: "30000000-0000-4000-8000-000000000007",
          idempotencyKey: "30000000-0000-4000-8000-000000000008",
          entityType: "goal",
          entityId,
          operationType: "delete",
          baseRevision: 2,
          dependencyIds: [],
          payload: {},
        },
      ],
    });
    expect(removed.results[0]).toMatchObject({ status: "acknowledged", revision: 3 });
    expect(
      database.prepare("SELECT 1 AS found FROM financial_goals WHERE id = ?").get(entityId),
    ).toBeUndefined();
    expect(
      database
        .prepare(
          "SELECT entity_type AS entityType, operation FROM mobile_sync_changes WHERE entity_id = ? ORDER BY sequence DESC LIMIT 1",
        )
        .get(entityId),
    ).toEqual({ entityType: "goal", operation: "delete" });
  });

  it("rejects a duplicate goal name", async () => {
    const { env } = createSyncEnvironment();
    const repository = createMobileSyncRepository(vi.fn(async () => false));
    const duplicate = await repository.push(env, "tenant-1", {
      protocolVersion: 1,
      clientId,
      operations: [
        {
          operationId: "30000000-0000-4000-8000-000000000009",
          idempotencyKey: "30000000-0000-4000-8000-00000000000a",
          entityType: "goal",
          entityId: "30000000-0000-4000-8000-00000000000b",
          operationType: "create",
          baseRevision: 0,
          dependencyIds: [],
          payload: {
            name: "Emergency Fund",
            targetAmountMinor: 200_000,
            currentAmountMinor: 0,
            targetDate: "2027-06-30",
            status: "active",
          },
        },
      ],
    });
    expect(duplicate.results[0]).toMatchObject({
      status: "rejected",
      code: "invalid_operation",
    });
  });

  it("rejects an update whose current savings exceed the target", async () => {
    const { env } = createSyncEnvironment();
    const repository = createMobileSyncRepository(vi.fn(async () => false));
    const rejected = await repository.push(env, "tenant-1", {
      protocolVersion: 1,
      clientId,
      operations: [
        {
          operationId: "30000000-0000-4000-8000-00000000000c",
          idempotencyKey: "30000000-0000-4000-8000-00000000000d",
          entityType: "goal",
          entityId: "goal-1",
          operationType: "update",
          baseRevision: 1,
          dependencyIds: [],
          payload: { currentAmountMinor: 200_000 },
        },
      ],
    });
    expect(rejected.results[0]).toMatchObject({
      status: "rejected",
      code: "invalid_operation",
    });
  });

  it("returns a stale revision conflict for an out-of-date goal update", async () => {
    const { env, database } = createSyncEnvironment();
    const repository = createMobileSyncRepository(vi.fn(async () => false));
    database
      .prepare("UPDATE financial_goals SET current_amount_minor = ? WHERE id = ?")
      .run(50_000, "goal-1");

    const stale = await repository.push(env, "tenant-1", {
      protocolVersion: 1,
      clientId,
      operations: [
        {
          operationId: "30000000-0000-4000-8000-00000000000e",
          idempotencyKey: "30000000-0000-4000-8000-00000000000f",
          entityType: "goal",
          entityId: "goal-1",
          operationType: "update",
          baseRevision: 1,
          dependencyIds: [],
          payload: { currentAmountMinor: 60_000 },
        },
      ],
    });
    expect(stale.results[0]).toMatchObject({
      status: "conflict",
      code: "stale_revision",
      serverRevision: 2,
      serverPayload: { id: "goal-1", currentAmountMinor: 50_000 },
    });
  });
});

describe("mobile sync debt push repository", () => {
  const clientId = "40000000-0000-4000-8000-000000000001";

  it("creates, updates, and deletes a debt idempotently", async () => {
    const { env, database } = createSyncEnvironment();
    const repository = createMobileSyncRepository(vi.fn(async () => false));
    const entityId = "40000000-0000-4000-8000-000000000002";
    const create = {
      protocolVersion: 1 as const,
      clientId,
      operations: [
        {
          operationId: "40000000-0000-4000-8000-000000000003",
          idempotencyKey: "40000000-0000-4000-8000-000000000004",
          entityType: "debt" as const,
          entityId,
          operationType: "create" as const,
          baseRevision: 0 as const,
          dependencyIds: [],
          payload: {
            name: "Personal Loan",
            type: "personal_loan" as const,
            balanceMinor: 250_000,
            aprBasisPoints: 1_200,
            minimumPaymentMinor: 8_000,
            balanceAsOf: "2026-08-14",
            status: "active" as const,
          },
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
          operationId: "40000000-0000-4000-8000-000000000005",
          idempotencyKey: "40000000-0000-4000-8000-000000000006",
          entityType: "debt",
          entityId,
          operationType: "update",
          baseRevision: 1,
          dependencyIds: [],
          payload: { balanceMinor: 200_000 },
        },
      ],
    });
    expect(updated.results[0]).toMatchObject({ status: "acknowledged", revision: 2 });
    expect(
      database
        .prepare("SELECT balance_minor AS balanceMinor, revision FROM debts WHERE id = ?")
        .get(entityId),
    ).toEqual({ balanceMinor: 200_000, revision: 2 });

    const removed = await repository.push(env, "tenant-1", {
      protocolVersion: 1,
      clientId,
      operations: [
        {
          operationId: "40000000-0000-4000-8000-000000000007",
          idempotencyKey: "40000000-0000-4000-8000-000000000008",
          entityType: "debt",
          entityId,
          operationType: "delete",
          baseRevision: 2,
          dependencyIds: [],
          payload: {},
        },
      ],
    });
    expect(removed.results[0]).toMatchObject({ status: "acknowledged", revision: 3 });
    expect(
      database.prepare("SELECT 1 AS found FROM debts WHERE id = ?").get(entityId),
    ).toBeUndefined();
    expect(
      database
        .prepare(
          "SELECT entity_type AS entityType, operation FROM mobile_sync_changes WHERE entity_id = ? ORDER BY sequence DESC LIMIT 1",
        )
        .get(entityId),
    ).toEqual({ entityType: "debt", operation: "delete" });
  });

  it("rejects a duplicate debt name case-insensitively", async () => {
    const { env } = createSyncEnvironment();
    const repository = createMobileSyncRepository(vi.fn(async () => false));
    const duplicate = await repository.push(env, "tenant-1", {
      protocolVersion: 1,
      clientId,
      operations: [
        {
          operationId: "40000000-0000-4000-8000-000000000009",
          idempotencyKey: "40000000-0000-4000-8000-00000000000a",
          entityType: "debt",
          entityId: "40000000-0000-4000-8000-00000000000b",
          operationType: "create",
          baseRevision: 0,
          dependencyIds: [],
          payload: {
            name: "CAR LOAN",
            type: "auto_loan",
            balanceMinor: 100_000,
            aprBasisPoints: 0,
            minimumPaymentMinor: 0,
            balanceAsOf: "2026-08-14",
            status: "active",
          },
        },
      ],
    });
    expect(duplicate.results[0]).toMatchObject({
      status: "rejected",
      code: "invalid_operation",
    });
  });

  it("returns a stale revision conflict for an out-of-date debt update", async () => {
    const { env, database } = createSyncEnvironment();
    const repository = createMobileSyncRepository(vi.fn(async () => false));
    database.prepare("UPDATE debts SET balance_minor = ? WHERE id = ?").run(450_000, "debt-1");

    const stale = await repository.push(env, "tenant-1", {
      protocolVersion: 1,
      clientId,
      operations: [
        {
          operationId: "40000000-0000-4000-8000-00000000000c",
          idempotencyKey: "40000000-0000-4000-8000-00000000000d",
          entityType: "debt",
          entityId: "debt-1",
          operationType: "update",
          baseRevision: 1,
          dependencyIds: [],
          payload: { balanceMinor: 420_000 },
        },
      ],
    });
    expect(stale.results[0]).toMatchObject({
      status: "conflict",
      code: "stale_revision",
      serverRevision: 2,
      serverPayload: { id: "debt-1", balanceMinor: 450_000 },
    });
  });
});
describe("mobile sync subscription push repository", () => {
  const clientId = "50000000-0000-4000-8000-000000000001";

  function insertFreeCategory(database: DatabaseSync): void {
    database
      .prepare(
        "INSERT INTO categories (id, tenant_id, name, kind, color, required_plan) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run("category-sub", "tenant-1", "Utilities", "expense", "#333333", "free");
  }

  it("creates, updates, cancels, reactivates, and removes a scheduled subscription idempotently", async () => {
    const { env, database } = createSyncEnvironment();
    const repository = createMobileSyncRepository(vi.fn(async () => false));
    insertFreeCategory(database);
    const entityId = "50000000-0000-4000-8000-000000000002";
    const create = {
      protocolVersion: 1 as const,
      clientId,
      operations: [
        {
          operationId: "50000000-0000-4000-8000-000000000003",
          idempotencyKey: "50000000-0000-4000-8000-000000000004",
          entityType: "subscription" as const,
          entityId,
          operationType: "create" as const,
          baseRevision: 0 as const,
          dependencyIds: [],
          payload: {
            name: "Netflix",
            amountMinor: 54_900,
            billingCycle: "monthly" as const,
            nextBillingDate: "2026-09-01",
            categoryId: "category-sub",
            accountId: "account-1",
          },
        },
      ],
    };

    const first = await repository.push(env, "tenant-1", create);
    expect(await repository.push(env, "tenant-1", create)).toEqual(first);
    expect(first.results[0]).toMatchObject({ status: "acknowledged", revision: 1 });
    expect(
      database
        .prepare("SELECT name, status, revision FROM subscriptions WHERE id = ?")
        .get(entityId),
    ).toEqual({ name: "Netflix", status: "active", revision: 1 });
    const charge = database
      .prepare(
        "SELECT id, amount_minor AS amountMinor, date, subscription_id AS subscriptionId FROM transactions WHERE subscription_id = ?",
      )
      .get(entityId) as { id: string; amountMinor: number; date: string; subscriptionId: string };
    expect(charge).toMatchObject({
      amountMinor: -54_900,
      date: "2026-09-01",
      subscriptionId: entityId,
    });
    const groups = database
      .prepare(
        "SELECT atomic_group_id AS atomicGroupId, sequence FROM mobile_sync_change_groups WHERE tenant_id = ? ORDER BY sequence DESC LIMIT 2",
      )
      .all("tenant-1") as Array<{ atomicGroupId: string; sequence: number }>;
    expect(groups).toHaveLength(2);
    expect(groups[0]!.atomicGroupId).toBe(groups[1]!.atomicGroupId);
    expect(groups[0]!.sequence).toBe(groups[1]!.sequence + 1);

    const updated = await repository.push(env, "tenant-1", {
      protocolVersion: 1,
      clientId,
      operations: [
        {
          operationId: "50000000-0000-4000-8000-000000000005",
          idempotencyKey: "50000000-0000-4000-8000-000000000006",
          entityType: "subscription",
          entityId,
          operationType: "update",
          baseRevision: 1,
          dependencyIds: [],
          payload: {
            name: "Netflix Premium",
            amountMinor: 74_900,
            billingCycle: "monthly",
            nextBillingDate: "2026-09-01",
            categoryId: "category-sub",
            accountId: "account-1",
          },
        },
      ],
    });
    expect(updated.results[0]).toMatchObject({ status: "acknowledged", revision: 2 });
    expect(
      database
        .prepare(
          "SELECT amount_minor AS amountMinor, description FROM transactions WHERE subscription_id = ?",
        )
        .get(entityId),
    ).toEqual({ amountMinor: -74_900, description: "Netflix Premium" });

    const canceled = await repository.push(env, "tenant-1", {
      protocolVersion: 1,
      clientId,
      operations: [
        {
          operationId: "50000000-0000-4000-8000-000000000007",
          idempotencyKey: "50000000-0000-4000-8000-000000000008",
          entityType: "subscription",
          entityId,
          operationType: "update",
          baseRevision: 2,
          dependencyIds: [],
          payload: {
            name: "Netflix Premium",
            amountMinor: 74_900,
            billingCycle: "monthly",
            nextBillingDate: "2026-09-01",
            categoryId: "category-sub",
            accountId: "account-1",
            status: "canceled" as const,
          },
        },
      ],
    });
    expect(canceled.results[0]).toMatchObject({ status: "acknowledged", revision: 3 });
    // Cancelling does not delete the transaction (no refund)
    expect(
      database
        .prepare("SELECT count(*) AS count FROM transactions WHERE subscription_id = ?")
        .get(entityId),
    ).toEqual({ count: 1 });

    const reactivated = await repository.push(env, "tenant-1", {
      protocolVersion: 1,
      clientId,
      operations: [
        {
          operationId: "50000000-0000-4000-8000-000000000009",
          idempotencyKey: "50000000-0000-4000-8000-00000000000a",
          entityType: "subscription",
          entityId,
          operationType: "update",
          baseRevision: 3,
          dependencyIds: [],
          payload: {
            name: "Netflix Premium",
            amountMinor: 74_900,
            billingCycle: "monthly",
            nextBillingDate: "2026-09-01",
            categoryId: "category-sub",
            accountId: "account-1",
            status: "active" as const,
          },
        },
      ],
    });
    expect(reactivated.results[0]).toMatchObject({ status: "acknowledged", revision: 4 });
    expect(
      database
        .prepare("SELECT count(*) AS count FROM transactions WHERE subscription_id = ?")
        .get(entityId),
    ).toEqual({ count: 1 });

    const removed = await repository.push(env, "tenant-1", {
      protocolVersion: 1,
      clientId,
      operations: [
        {
          operationId: "50000000-0000-4000-8000-00000000000b",
          idempotencyKey: "50000000-0000-4000-8000-00000000000c",
          entityType: "subscription",
          entityId,
          operationType: "delete",
          baseRevision: 4,
          dependencyIds: [],
          payload: {},
        },
      ],
    });
    expect(removed.results[0]).toMatchObject({ status: "acknowledged", revision: 5 });
    expect(
      database.prepare("SELECT 1 AS found FROM subscriptions WHERE id = ?").get(entityId),
    ).toBeUndefined();
    expect(
      database
        .prepare("SELECT count(*) AS count FROM transactions WHERE subscription_id = ?")
        .get(entityId),
    ).toEqual({ count: 0 });
    expect(
      database
        .prepare("SELECT amount_minor AS amountMinor, subscription_id AS subscriptionId FROM transactions WHERE id = ?")
        .get(charge.id),
    ).toEqual({ amountMinor: -74_900, subscriptionId: null });
    expect(
      database
        .prepare(
          "SELECT entity_type AS entityType, operation FROM mobile_sync_changes WHERE entity_id = ? ORDER BY sequence DESC LIMIT 1",
        )
        .get(entityId),
    ).toEqual({ entityType: "subscription", operation: "delete" });
  });

  it("rejects a Pro category and an unowned account", async () => {
    const { env } = createSyncEnvironment();
    const repository = createMobileSyncRepository(vi.fn(async () => false));
    const proCategory = await repository.push(env, "tenant-1", {
      protocolVersion: 1,
      clientId,
      operations: [
        {
          operationId: "50000000-0000-4000-8000-00000000000d",
          idempotencyKey: "50000000-0000-4000-8000-00000000000e",
          entityType: "subscription",
          entityId: "50000000-0000-4000-8000-00000000000f",
          operationType: "create",
          baseRevision: 0,
          dependencyIds: [],
          payload: {
            name: "Pro Tool",
            amountMinor: 100_000,
            billingCycle: "monthly",
            nextBillingDate: "2026-09-01",
            categoryId: "category-1",
            accountId: "account-1",
          },
        },
      ],
    });
    expect(proCategory.results[0]).toMatchObject({ status: "rejected", code: "plan_limit" });

    const foreignAccount = await repository.push(env, "tenant-1", {
      protocolVersion: 1,
      clientId,
      operations: [
        {
          operationId: "50000000-0000-4000-8000-000000000010",
          idempotencyKey: "50000000-0000-4000-8000-000000000011",
          entityType: "subscription",
          entityId: "50000000-0000-4000-8000-000000000012",
          operationType: "create",
          baseRevision: 0,
          dependencyIds: [],
          payload: {
            name: "Private Tool",
            amountMinor: 100_000,
            billingCycle: "monthly",
            nextBillingDate: "2026-09-01",
            categoryId: "category-2",
            accountId: "account-2",
          },
        },
      ],
    });
    expect(foreignAccount.results[0]).toMatchObject({
      status: "rejected",
      code: "invalid_category",
    });
  });

  it("returns a stale revision conflict for an out-of-date subscription update", async () => {
    const { env, database } = createSyncEnvironment();
    const repository = createMobileSyncRepository(vi.fn(async () => false));
    insertFreeCategory(database);
    database
      .prepare("UPDATE subscriptions SET name = ? WHERE id = ?")
      .run("Server Name", "subscription-1");

    const stale = await repository.push(env, "tenant-1", {
      protocolVersion: 1,
      clientId,
      operations: [
        {
          operationId: "50000000-0000-4000-8000-000000000013",
          idempotencyKey: "50000000-0000-4000-8000-000000000014",
          entityType: "subscription",
          entityId: "subscription-1",
          operationType: "update",
          baseRevision: 1,
          dependencyIds: [],
          payload: {
            name: "Device Name",
            amountMinor: 54_900,
            billingCycle: "monthly",
            nextBillingDate: "2026-09-01",
            categoryId: "category-sub",
            accountId: "account-1",
          },
        },
      ],
    });
    expect(stale.results[0]).toMatchObject({
      status: "conflict",
      code: "stale_revision",
      serverRevision: 2,
      serverPayload: { id: "subscription-1", name: "Server Name", status: "canceled" },
    });
  });
});

describe("mobile sync event push repository", () => {
  const clientId = "60000000-0000-4000-8000-000000000001";

  it("creates, updates, and deletes a calendar event idempotently", async () => {
    const { env, database } = createSyncEnvironment();
    const repository = createMobileSyncRepository(vi.fn(async () => false));
    const entityId = "60000000-0000-4000-8000-000000000002";
    const create = {
      protocolVersion: 1 as const,
      clientId,
      operations: [
        {
          operationId: "60000000-0000-4000-8000-000000000003",
          idempotencyKey: "60000000-0000-4000-8000-000000000004",
          entityType: "event" as const,
          entityId,
          operationType: "create" as const,
          baseRevision: 0 as const,
          dependencyIds: [],
          payload: {
            title: "Payday planning",
            date: "2026-08-30",
            startTime: "09:00",
            endTime: "10:00",
            notes: "Plan August allocations",
          },
        },
      ],
    };

    const first = await repository.push(env, "tenant-1", create);
    expect(await repository.push(env, "tenant-1", create)).toEqual(first);
    expect(first.results[0]).toMatchObject({ status: "acknowledged", revision: 1 });
    expect(
      database
        .prepare(
          "SELECT title, date, start_time AS startTime, revision FROM calendar_events WHERE id = ?",
        )
        .get(entityId),
    ).toEqual({ title: "Payday planning", date: "2026-08-30", startTime: "09:00", revision: 1 });

    const updated = await repository.push(env, "tenant-1", {
      protocolVersion: 1,
      clientId,
      operations: [
        {
          operationId: "60000000-0000-4000-8000-000000000005",
          idempotencyKey: "60000000-0000-4000-8000-000000000006",
          entityType: "event",
          entityId,
          operationType: "update",
          baseRevision: 1,
          dependencyIds: [],
          payload: { title: "Payday review", startTime: null, endTime: null },
        },
      ],
    });
    expect(updated.results[0]).toMatchObject({ status: "acknowledged", revision: 2 });
    expect(
      database
        .prepare(
          "SELECT title, start_time AS startTime, revision FROM calendar_events WHERE id = ?",
        )
        .get(entityId),
    ).toEqual({ title: "Payday review", startTime: null, revision: 2 });

    const removed = await repository.push(env, "tenant-1", {
      protocolVersion: 1,
      clientId,
      operations: [
        {
          operationId: "60000000-0000-4000-8000-000000000007",
          idempotencyKey: "60000000-0000-4000-8000-000000000008",
          entityType: "event",
          entityId,
          operationType: "delete",
          baseRevision: 2,
          dependencyIds: [],
          payload: {},
        },
      ],
    });
    expect(removed.results[0]).toMatchObject({ status: "acknowledged", revision: 3 });
    expect(
      database.prepare("SELECT 1 AS found FROM calendar_events WHERE id = ?").get(entityId),
    ).toBeUndefined();
    expect(
      database
        .prepare(
          "SELECT entity_type AS entityType, operation FROM mobile_sync_changes WHERE entity_id = ? ORDER BY sequence DESC LIMIT 1",
        )
        .get(entityId),
    ).toEqual({ entityType: "event", operation: "delete" });
  });

  it("rejects an update whose merged times are invalid", async () => {
    const { env, database } = createSyncEnvironment();
    const repository = createMobileSyncRepository(vi.fn(async () => false));

    const badEnd = await repository.push(env, "tenant-1", {
      protocolVersion: 1,
      clientId,
      operations: [
        {
          operationId: "60000000-0000-4000-8000-000000000009",
          idempotencyKey: "60000000-0000-4000-8000-00000000000a",
          entityType: "event",
          entityId: "event-1",
          operationType: "update",
          baseRevision: 1,
          dependencyIds: [],
          payload: { startTime: null, endTime: "21:00" },
        },
      ],
    });
    expect(badEnd.results[0]).toMatchObject({ status: "rejected", code: "invalid_operation" });
    expect(
      database.prepare("SELECT revision FROM calendar_events WHERE id = ?").get("event-1"),
    ).toEqual({ revision: 1 });

    const badOrder = await repository.push(env, "tenant-1", {
      protocolVersion: 1,
      clientId,
      operations: [
        {
          operationId: "60000000-0000-4000-8000-00000000000b",
          idempotencyKey: "60000000-0000-4000-8000-00000000000c",
          entityType: "event",
          entityId: "event-1",
          operationType: "update",
          baseRevision: 1,
          dependencyIds: [],
          payload: { startTime: "21:00", endTime: "20:00" },
        },
      ],
    });
    expect(badOrder.results[0]).toMatchObject({ status: "rejected", code: "invalid_operation" });
    expect(
      database.prepare("SELECT revision FROM calendar_events WHERE id = ?").get("event-1"),
    ).toEqual({ revision: 1 });
  });

  it("returns a stale revision conflict for an out-of-date event update", async () => {
    const { env, database } = createSyncEnvironment();
    const repository = createMobileSyncRepository(vi.fn(async () => false));
    database
      .prepare("UPDATE calendar_events SET title = ? WHERE id = ?")
      .run("Anniversary", "event-1");

    const stale = await repository.push(env, "tenant-1", {
      protocolVersion: 1,
      clientId,
      operations: [
        {
          operationId: "60000000-0000-4000-8000-00000000000d",
          idempotencyKey: "60000000-0000-4000-8000-00000000000e",
          entityType: "event",
          entityId: "event-1",
          operationType: "update",
          baseRevision: 1,
          dependencyIds: [],
          payload: { title: "Dinner" },
        },
      ],
    });
    expect(stale.results[0]).toMatchObject({
      status: "conflict",
      code: "stale_revision",
      serverRevision: 2,
      serverPayload: { id: "event-1", title: "Anniversary" },
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
