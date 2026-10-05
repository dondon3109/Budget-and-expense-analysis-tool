import { mobileSyncFeatures } from "@zoption/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  compactMobileSyncChanges,
  createMobileSyncRepository,
  decodeMobileSyncCursor,
  decodeMobileSyncSnapshotCursor,
  encodeMobileSyncCursor,
  encodeMobileSyncSnapshotCursor,
} from "../src/db/mobile-sync";
import {
  closeSyncEnvironments,
  createSyncEnvironment,
} from "./helpers/mobile-sync-test-environment";

afterEach(closeSyncEnvironments);

// Category system keys reach only clients that announce the current sync features.
const currentClient = new Set(mobileSyncFeatures);

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
      snapshotCursor: "s1.c",
      nextOffset: 2,
      hasMore: true,
      resumeCursor: "v1.c",
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
    expect(second).toMatchObject({ nextOffset: 4, hasMore: true, resumeCursor: "v1.c" });
    // A snapshot groups rows by entity, so the second category page precedes the budget.
    expect(second.changes.map((change) => change.entityId)).toEqual([
      "tenant-1:category:debt-payment",
      "tenant-1:category:opening-balance",
    ]);
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
      // Two are the superseded first revisions of the product categories, re-sent by migration 0072.
      deletedChanges: 4,
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
    expect(fourth).toMatchObject({ hasMore: true });
    expect(fourth.changes.map((change) => change.entityId)).toEqual(["subscription-1", "event-1"]);

    // The product category migrations land last in the fixture sequence; 0072 sends them again
    // with their product key.
    const fifth = await repository.pull(env, "tenant-1", {
      protocolVersion: 1,
      cursor: fourth.nextCursor,
      limit: 2,
    });
    expect(fifth).toMatchObject({ hasMore: true });
    expect(fifth.changes.map((change) => change.entityId)).toEqual([
      "tenant-1:category:debt-payment",
      "tenant-1:category:opening-balance",
    ]);
    const sixth = await repository.pull(
      env,
      "tenant-1",
      {
        protocolVersion: 1,
        cursor: fifth.nextCursor,
        limit: 2,
      },
      currentClient,
    );
    expect(sixth).toMatchObject({ hasMore: false });
    expect(sixth.changes.map((change) => change.entityId)).toEqual([
      "tenant-1:category:debt-payment",
      "tenant-1:category:opening-balance",
    ]);
    expect(sixth.changes[1]?.payload).toMatchObject({
      systemKey: "opening:income",
      archived: true,
    });
  });

  it("captures web updates and deletion tombstones without device timestamps", async () => {
    const { env, database } = createSyncEnvironment();
    const repository = createMobileSyncRepository(vi.fn(async () => true));

    database.prepare("UPDATE accounts SET name = ? WHERE id = ?").run("Main wallet", "account-1");
    database.prepare("DELETE FROM transactions WHERE id = ?").run("transaction-1");

    const pulled = await repository.pull(
      env,
      "tenant-1",
      {
        protocolVersion: 1,
        cursor: "v1.3",
        limit: 12,
      },
      currentClient,
    );
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
        entityType: "category",
        entityId: "tenant-1:category:debt-payment",
        revision: 1,
        operation: "upsert",
        payload: { name: "Debt payment", kind: "expense", origin: "system", system: true },
      },
      {
        entityType: "category",
        entityId: "tenant-1:category:opening-balance",
        revision: 1,
        operation: "upsert",
        payload: { name: "Opening balance", kind: "income", origin: "system", system: true },
      },
      {
        entityType: "category",
        entityId: "tenant-1:category:debt-payment",
        revision: 2,
        operation: "upsert",
        payload: { name: "Debt payment", systemKey: "debt:expense" },
      },
      {
        entityType: "category",
        entityId: "tenant-1:category:opening-balance",
        revision: 2,
        operation: "upsert",
        payload: { name: "Opening balance", systemKey: "opening:income" },
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
    expect(pulled.nextCursor).toBe("v1.e");
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

    const pulled = await repository.pull(
      env,
      "tenant-1",
      {
        protocolVersion: 1,
        cursor: "v1.8",
        limit: 10,
      },
      currentClient,
    );
    expect(pulled.changes).toMatchObject([
      {
        entityType: "category",
        entityId: "tenant-1:category:debt-payment",
        revision: 1,
        operation: "upsert",
        payload: { name: "Debt payment" },
      },
      {
        entityType: "category",
        entityId: "tenant-1:category:opening-balance",
        revision: 1,
        operation: "upsert",
        payload: { name: "Opening balance" },
      },
      {
        entityType: "category",
        entityId: "tenant-1:category:debt-payment",
        revision: 2,
        operation: "upsert",
        payload: { name: "Debt payment", systemKey: "debt:expense" },
      },
      {
        entityType: "category",
        entityId: "tenant-1:category:opening-balance",
        revision: 2,
        operation: "upsert",
        payload: { name: "Opening balance", systemKey: "opening:income" },
      },
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
    expect(pulled.nextCursor).toBe("v1.e");
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
