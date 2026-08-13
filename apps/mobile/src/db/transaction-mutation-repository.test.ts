/// <reference types="node" />

import { DatabaseSync, type SQLInputValue } from "node:sqlite";

import type { MobileSyncPushResponse } from "@zoption/shared";
import type { SQLiteDatabase } from "expo-sqlite";

import { LocalDatabaseWriter } from "./database-writer";
import { migrations } from "./migrations";
import { LocalTransactionMutationRepository } from "./transaction-mutation-repository";

class TestDatabase {
  readonly native = new DatabaseSync(":memory:");

  constructor() {
    this.native.exec("PRAGMA foreign_keys = ON");
    for (const migration of migrations) this.native.exec(migration.sql);
    this.native.exec(`
      INSERT INTO accounts (
        id, name, type, currency, archived, system, server_revision, sync_state
      ) VALUES ('account-1', 'Wallet', 'cash', 'PHP', 0, 0, 1, 'synced');
      INSERT INTO categories (
        id, name, kind, color, archived, system, origin, required_plan, locked,
        server_revision, sync_state
      ) VALUES (
        'category-1', 'Dining', 'expense', '#123456', 0, 0, 'custom', 'free', 0,
        1, 'synced'
      );
    `);
  }

  async getFirstAsync<T>(source: string, ...params: unknown[]): Promise<T | null> {
    return (
      (this.native.prepare(source).get(...(params as SQLInputValue[])) as T | undefined) ?? null
    );
  }

  async getAllAsync<T>(source: string, ...params: unknown[]): Promise<T[]> {
    return this.native.prepare(source).all(...(params as SQLInputValue[])) as T[];
  }

  async runAsync(source: string, ...params: unknown[]): Promise<unknown> {
    return this.native.prepare(source).run(...(params as SQLInputValue[]));
  }

  async withTransactionAsync(task: () => Promise<void>): Promise<void> {
    this.native.exec("BEGIN IMMEDIATE");
    try {
      await task();
      this.native.exec("COMMIT");
    } catch (error) {
      this.native.exec("ROLLBACK");
      throw error;
    }
  }

  close(): void {
    this.native.close();
  }
}

const uuids = [
  "00000000-0000-4000-8000-000000000001",
  "00000000-0000-4000-8000-000000000002",
  "00000000-0000-4000-8000-000000000003",
  "00000000-0000-4000-8000-000000000004",
  "00000000-0000-4000-8000-000000000005",
  "00000000-0000-4000-8000-000000000006",
  "00000000-0000-4000-8000-000000000007",
] as const;

const input = {
  kind: "expense" as const,
  accountId: "account-1",
  categoryId: "category-1",
  date: "2026-08-13",
  description: "Offline lunch",
  amountMinor: 12_345,
  currency: "PHP" as const,
};

function repository(database: TestDatabase) {
  let index = 0;
  return new LocalTransactionMutationRepository(
    database as unknown as SQLiteDatabase,
    new LocalDatabaseWriter(),
    () => uuids[index++] ?? crypto.randomUUID(),
    () => new Date("2026-08-13T16:00:00.000Z"),
    () => 0.5,
  );
}

function seedSynchronizedTransaction(database: TestDatabase): void {
  database.native.exec(`
    INSERT INTO transactions (
      id, account_id, category_id, date, description, amount_minor, currency, kind,
      server_revision, server_updated_at, sync_state
    ) VALUES (
      'transaction-server', 'account-1', 'category-1', '2026-08-13', 'Server lunch',
      -10000, 'PHP', 'expense', 3, '2026-08-13 15:00:00', 'synced'
    );
  `);
}

describe("durable local transaction mutations", () => {
  let database: TestDatabase;

  beforeEach(() => {
    database = new TestDatabase();
  });

  afterEach(() => database.close());

  it("commits a pending transaction and encrypted outbox operation together", async () => {
    const mutations = repository(database);
    const id = await mutations.createTransaction(input);

    expect(
      database.native
        .prepare("SELECT amount_minor, server_revision, sync_state FROM transactions WHERE id = ?")
        .get(id),
    ).toEqual({ amount_minor: -12_345, server_revision: 0, sync_state: "pending" });
    const batch = await mutations.getPushBatch();
    expect(batch).toMatchObject({
      protocolVersion: 1,
      clientId: uuids[0],
      operations: [
        {
          entityId: id,
          operationType: "create",
          baseRevision: 0,
          payload: { description: "Offline lunch", amountMinor: 12_345 },
        },
      ],
    });

    const reopened = new LocalTransactionMutationRepository(
      database as unknown as SQLiteDatabase,
      new LocalDatabaseWriter(),
    );
    await expect(reopened.getPushBatch()).resolves.toEqual(batch);
  });

  it("replays an in-flight operation unchanged after restart and blocks payload mutation", async () => {
    const mutations = repository(database);
    const id = await mutations.createTransaction(input);
    const sending = await mutations.getPushBatch();

    await expect(
      mutations.updateTransaction(id, { description: "Unsafe in-flight replacement" }),
    ).rejects.toMatchObject({ code: "mutation_blocked" });

    const reopened = new LocalTransactionMutationRepository(
      database as unknown as SQLiteDatabase,
      new LocalDatabaseWriter(),
    );
    await expect(reopened.getPushBatch()).resolves.toEqual(sending);
    expect(database.native.prepare("SELECT state FROM sync_outbox").get()).toEqual({
      state: "sending",
    });
  });

  it("rolls back the local row when an outbox write cannot complete", async () => {
    const mutations = repository(database);
    await mutations.createTransaction(input);
    const before = database.native.prepare("SELECT count(*) AS count FROM transactions").get();
    database.native.exec(`
      CREATE TRIGGER reject_test_outbox
      BEFORE INSERT ON sync_outbox
      BEGIN
        SELECT RAISE(ABORT, 'simulated outbox failure');
      END;
    `);

    await expect(mutations.createTransaction(input)).rejects.toThrow();
    expect(database.native.prepare("SELECT count(*) AS count FROM transactions").get()).toEqual(
      before,
    );
    expect(database.native.prepare("SELECT count(*) AS count FROM sync_outbox").get()).toEqual({
      count: 1,
    });
  });

  it("coalesces edits into an unacknowledged create", async () => {
    const mutations = repository(database);
    const id = await mutations.createTransaction(input);
    await mutations.updateTransaction(id, { description: "Edited offline", amountMinor: 20_000 });

    const batch = await mutations.getPushBatch();
    expect(batch?.operations).toHaveLength(1);
    expect(batch?.operations[0]).toMatchObject({
      operationType: "create",
      payload: { description: "Edited offline", amountMinor: 20_000 },
    });
    expect(
      database.native
        .prepare("SELECT description, amount_minor FROM transactions WHERE id = ?")
        .get(id),
    ).toEqual({ description: "Edited offline", amount_minor: -20_000 });
  });

  it("applies acknowledgement atomically and removes the outbox operation", async () => {
    const mutations = repository(database);
    const id = await mutations.createTransaction(input);
    const request = (await mutations.getPushBatch())!;
    const response: MobileSyncPushResponse = {
      protocolVersion: 1,
      results: [
        {
          operationId: request.operations[0]!.operationId,
          entityType: "transaction",
          entityId: id,
          status: "acknowledged",
          revision: 1,
        },
      ],
    };
    await mutations.applyPushResponse(request, response);

    expect(
      database.native
        .prepare("SELECT server_revision, sync_state FROM transactions WHERE id = ?")
        .get(id),
    ).toEqual({ server_revision: 1, sync_state: "synced" });
    expect(database.native.prepare("SELECT count(*) AS count FROM sync_outbox").get()).toEqual({
      count: 0,
    });
  });

  it("preserves local and server versions when an edit conflicts", async () => {
    seedSynchronizedTransaction(database);
    const mutations = repository(database);
    await mutations.updateTransaction("transaction-server", { description: "My offline edit" });
    const request = (await mutations.getPushBatch())!;
    await mutations.applyPushResponse(request, {
      protocolVersion: 1,
      results: [
        {
          operationId: request.operations[0]!.operationId,
          entityType: "transaction",
          entityId: "transaction-server",
          status: "conflict",
          code: "stale_revision",
          serverRevision: 4,
          serverUpdatedAt: "2026-08-13 15:30:00",
          serverPayload: {
            id: "transaction-server",
            accountId: "account-1",
            categoryId: "category-1",
            date: "2026-08-13",
            description: "Web edit",
            amountMinor: -10_000,
            currency: "PHP",
            kind: "expense",
            notes: null,
            transferGroupId: null,
            transferFeeMinor: null,
            importFingerprint: null,
            revision: 4,
            updatedAt: "2026-08-13 15:30:00",
          },
        },
      ],
    });

    expect(
      database.native
        .prepare("SELECT description, sync_state FROM transactions WHERE id = ?")
        .get("transaction-server"),
    ).toEqual({
      description: "My offline edit",
      sync_state: "conflicted",
    });
    const versions = database.native
      .prepare("SELECT base_json, local_json, server_json FROM sync_conflicts")
      .get() as Record<string, string>;
    expect(JSON.parse(versions.base_json!)).toMatchObject({
      description: "Server lunch",
      revision: 3,
    });
    expect(JSON.parse(versions.local_json!)).toMatchObject({ description: "My offline edit" });
    expect(JSON.parse(versions.server_json!)).toMatchObject({
      description: "Web edit",
      revision: 4,
    });
    await expect(mutations.getPushSchedule()).resolves.toEqual({
      outstandingCount: 1,
      blockedCount: 1,
      nextAttemptAt: null,
    });
  });

  it("cancels an unpushed create when it is deleted offline", async () => {
    const mutations = repository(database);
    const id = await mutations.createTransaction(input);
    await mutations.deleteTransaction(id);

    expect(
      database.native.prepare("SELECT id FROM transactions WHERE id = ?").get(id),
    ).toBeUndefined();
    expect(database.native.prepare("SELECT count(*) AS count FROM sync_outbox").get()).toEqual({
      count: 0,
    });
  });

  it("persists full-jitter retry scheduling without changing the financial row", async () => {
    const mutations = repository(database);
    const id = await mutations.createTransaction(input);
    const request = (await mutations.getPushBatch())!;
    await mutations.recordPushFailure(request, "network_unreachable", null);

    expect(
      database.native
        .prepare("SELECT state, attempt_count, next_attempt_at FROM sync_outbox")
        .get(),
    ).toEqual({
      state: "retryable",
      attempt_count: 1,
      next_attempt_at: "2026-08-13T16:00:07.500Z",
    });
    expect(
      database.native.prepare("SELECT sync_state FROM transactions WHERE id = ?").get(id),
    ).toEqual({
      sync_state: "pending",
    });
    await expect(mutations.getPushSchedule()).resolves.toEqual({
      outstandingCount: 1,
      blockedCount: 0,
      nextAttemptAt: "2026-08-13T16:00:07.500Z",
    });
  });
});
