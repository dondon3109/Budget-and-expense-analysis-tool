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

  it("persists an atomic dependency graph for new references and their transaction", async () => {
    const mutations = repository(database);
    const accountId = await mutations.createAccount({ name: "Offline bank", type: "checking" });
    const categoryId = await mutations.createCategory({
      name: "Offline groceries",
      kind: "expense",
      color: "#0F766E",
    });

    expect(
      database.native
        .prepare("SELECT name, server_revision, sync_state FROM accounts WHERE id = ?")
        .get(accountId),
    ).toEqual({ name: "Offline bank", server_revision: 0, sync_state: "pending" });
    expect(
      database.native
        .prepare(
          "SELECT name, required_plan, server_revision, sync_state FROM categories WHERE id = ?",
        )
        .get(categoryId),
    ).toEqual({
      name: "Offline groceries",
      required_plan: "free",
      server_revision: 0,
      sync_state: "pending",
    });
    const transactionId = await mutations.createTransaction({ ...input, accountId, categoryId });
    await expect(mutations.archiveAccount(accountId)).rejects.toMatchObject({
      code: "mutation_blocked",
    });

    const batch = await mutations.getPushBatch();
    expect(batch?.operations).toHaveLength(3);
    expect(batch?.operations).toMatchObject([
      { entityType: "account", entityId: accountId, operationType: "create", dependencyIds: [] },
      {
        entityType: "category",
        entityId: categoryId,
        operationType: "create",
        dependencyIds: [],
      },
      {
        entityType: "transaction",
        entityId: transactionId,
        operationType: "create",
      },
    ]);
    expect(batch?.operations[2]?.dependencyIds).toEqual([
      batch?.operations[0]?.operationId,
      batch?.operations[1]?.operationId,
    ]);
    if (!batch) throw new Error("Expected a dependency graph batch.");
    await mutations.applyPushResponse(batch, {
      protocolVersion: 1,
      results: batch.operations.map((operation) => ({
        operationId: operation.operationId,
        entityType: operation.entityType,
        entityId: operation.entityId,
        status: "acknowledged" as const,
        revision: 1,
      })),
    });
    expect(
      database.native
        .prepare(
          `SELECT
            (SELECT sync_state FROM accounts WHERE id = ?) AS account_state,
            (SELECT sync_state FROM categories WHERE id = ?) AS category_state,
            (SELECT sync_state FROM transactions WHERE id = ?) AS transaction_state,
            (SELECT count(*) FROM sync_outbox) AS outbox_count`,
        )
        .get(accountId, categoryId, transactionId),
    ).toEqual({
      account_state: "synced",
      category_state: "synced",
      transaction_state: "synced",
      outbox_count: 0,
    });
  });

  it("does not split one dependency graph into an undersized push batch", async () => {
    const mutations = repository(database);
    const accountId = await mutations.createAccount({ name: "Graph account", type: "cash" });
    await mutations.createTransaction({ ...input, accountId });

    await expect(mutations.getPushBatch(1)).rejects.toMatchObject({ code: "invalid_outbox" });
    expect(
      database.native
        .prepare("SELECT state, count(*) AS count FROM sync_outbox GROUP BY state")
        .all(),
    ).toEqual([{ state: "pending", count: 2 }]);
  });

  it("coalesces reference edits and cancels unpushed create/archive pairs", async () => {
    const mutations = repository(database);
    const accountId = await mutations.createAccount({ name: "Draft wallet", type: "cash" });
    const categoryId = await mutations.createCategory({
      name: "Draft category",
      kind: "expense",
      color: "#123456",
    });

    await mutations.updateAccount(accountId, { name: "Edited wallet", type: "savings" });
    await mutations.updateCategory(categoryId, { name: "Edited category", color: "#654321" });
    const batch = await mutations.getPushBatch();
    expect(batch?.operations).toMatchObject([
      {
        entityType: "account",
        operationType: "create",
        payload: { name: "Edited wallet", type: "savings" },
      },
      {
        entityType: "category",
        operationType: "create",
        payload: { name: "Edited category", color: "#654321" },
      },
    ]);

    const fresh = repository(database);
    const canceledAccount = await fresh.createAccount({ name: "Cancel account", type: "cash" });
    const canceledCategory = await fresh.createCategory({
      name: "Cancel category",
      kind: "income",
      color: "#ABCDEF",
    });
    await fresh.archiveAccount(canceledAccount);
    await fresh.archiveCategory(canceledCategory);
    expect(
      database.native.prepare("SELECT id FROM accounts WHERE id = ?").get(canceledAccount),
    ).toBeUndefined();
    expect(
      database.native.prepare("SELECT id FROM categories WHERE id = ?").get(canceledCategory),
    ).toBeUndefined();
  });

  it("archives synchronized references and applies acknowledgements to the correct tables", async () => {
    const mutations = repository(database);
    await mutations.archiveAccount("account-1");
    await mutations.archiveCategory("category-1");
    const request = (await mutations.getPushBatch())!;
    expect(request.operations).toMatchObject([
      { entityType: "account", entityId: "account-1", operationType: "delete", baseRevision: 1 },
      { entityType: "category", entityId: "category-1", operationType: "delete", baseRevision: 1 },
    ]);
    await mutations.applyPushResponse(request, {
      protocolVersion: 1,
      results: request.operations.map((operation) => ({
        operationId: operation.operationId,
        entityType: operation.entityType,
        entityId: operation.entityId,
        status: "acknowledged" as const,
        revision: 2,
      })),
    });

    expect(
      database.native
        .prepare(
          "SELECT archived, server_revision, sync_state FROM accounts WHERE id = 'account-1'",
        )
        .get(),
    ).toEqual({ archived: 1, server_revision: 2, sync_state: "synced" });
    expect(
      database.native
        .prepare(
          "SELECT archived, server_revision, sync_state FROM categories WHERE id = 'category-1'",
        )
        .get(),
    ).toEqual({ archived: 1, server_revision: 2, sync_state: "synced" });
  });

  it("protects local names and permanent reference rows before queueing", async () => {
    const mutations = repository(database);
    await expect(mutations.createAccount({ name: "wallet", type: "cash" })).rejects.toMatchObject({
      code: "name_conflict",
    });
    await expect(
      mutations.createCategory({ name: "DINING", kind: "income", color: "#FFFFFF" }),
    ).rejects.toMatchObject({ code: "name_conflict" });

    database.native.prepare("UPDATE accounts SET system = 1 WHERE id = 'account-1'").run();
    database.native.prepare("UPDATE categories SET system = 1 WHERE id = 'category-1'").run();
    await expect(mutations.updateAccount("account-1", { name: "Renamed" })).rejects.toMatchObject({
      code: "mutation_blocked",
    });
    await expect(mutations.archiveAccount("account-1")).rejects.toMatchObject({
      code: "mutation_blocked",
    });
    await expect(
      mutations.updateCategory("category-1", { color: "#FFFFFF" }),
    ).rejects.toMatchObject({ code: "mutation_blocked" });
  });

  it("accepts the preserved server account after a stale edit conflict", async () => {
    const mutations = repository(database);
    await mutations.updateAccount("account-1", { name: "Device wallet", type: "cash" });
    const request = (await mutations.getPushBatch())!;
    await mutations.applyPushResponse(request, {
      protocolVersion: 1,
      results: [
        {
          operationId: request.operations[0]!.operationId,
          entityType: "account",
          entityId: "account-1",
          status: "conflict",
          code: "stale_revision",
          serverRevision: 2,
          serverUpdatedAt: "2026-08-13 15:30:00",
          serverPayload: {
            id: "account-1",
            name: "Web wallet",
            type: "checking",
            currency: "PHP",
            archived: false,
            system: false,
            interest: {
              enabled: false,
              annualRateBasisPoints: null,
              frequency: null,
              payDay: null,
            },
            revision: 2,
            updatedAt: "2026-08-13 15:30:00",
          },
        },
      ],
    });

    await expect(mutations.getReferenceConflict("account", "account-1")).resolves.toMatchObject({
      local: { name: "Device wallet", detail: "Cash · PHP", archived: false },
      server: { name: "Web wallet", detail: "Checking · PHP", archived: false },
      serverRevision: 2,
    });
    await mutations.resolveReferenceConflict("account", "account-1", "keep_server");
    expect(
      database.native
        .prepare("SELECT name, type, server_revision, sync_state FROM accounts WHERE id = ?")
        .get("account-1"),
    ).toEqual({
      name: "Web wallet",
      type: "checking",
      server_revision: 2,
      sync_state: "synced",
    });
  });

  it("turns keep-mine category recovery into a fresh revision-aware operation", async () => {
    const mutations = repository(database);
    await mutations.updateCategory("category-1", { name: "Device dining", color: "#0F766E" });
    const request = (await mutations.getPushBatch())!;
    await mutations.applyPushResponse(request, {
      protocolVersion: 1,
      results: [
        {
          operationId: request.operations[0]!.operationId,
          entityType: "category",
          entityId: "category-1",
          status: "conflict",
          code: "stale_revision",
          serverRevision: 2,
          serverUpdatedAt: "2026-08-13 15:30:00",
          serverPayload: {
            id: "category-1",
            name: "Web dining",
            kind: "expense",
            color: "#ABCDEF",
            archived: false,
            system: false,
            origin: "custom",
            requiredPlan: "free",
            locked: false,
            revision: 2,
            updatedAt: "2026-08-13 15:30:00",
          },
        },
      ],
    });

    await expect(mutations.getReferenceConflict("category", "category-1")).resolves.toMatchObject({
      local: { name: "Device dining", detail: "Expense", color: "#0F766E" },
      server: { name: "Web dining", detail: "Expense", color: "#ABCDEF" },
      serverRevision: 2,
    });
    await mutations.resolveReferenceConflict("category", "category-1", "keep_local");
    const retry = await mutations.getPushBatch();
    expect(retry?.operations).toMatchObject([
      {
        entityType: "category",
        entityId: "category-1",
        operationType: "update",
        baseRevision: 2,
        payload: { name: "Device dining", color: "#0F766E", archived: false },
      },
    ]);
    expect(retry?.operations[0]?.idempotencyKey).not.toBe(request.operations[0]!.idempotencyKey);
  });

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

  it("accepts the preserved server version and closes the conflicted operation atomically", async () => {
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
            amountMinor: -20_000,
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

    await expect(mutations.getConflict("transaction-server")).resolves.toMatchObject({
      local: { input: { description: "My offline edit", amountMinor: 10_000 } },
      server: { input: { description: "Web edit", amountMinor: 20_000 } },
      serverRevision: 4,
    });
    await mutations.resolveConflict("transaction-server", "keep_server");

    expect(
      database.native
        .prepare(
          "SELECT description, amount_minor, server_revision, sync_state FROM transactions WHERE id = ?",
        )
        .get("transaction-server"),
    ).toEqual({
      description: "Web edit",
      amount_minor: -20_000,
      server_revision: 4,
      sync_state: "synced",
    });
    expect(database.native.prepare("SELECT count(*) AS count FROM sync_outbox").get()).toEqual({
      count: 0,
    });
    expect(
      database.native.prepare("SELECT resolution, resolved_at FROM sync_conflicts").get(),
    ).toEqual({ resolution: "keep_server", resolved_at: "2026-08-13T16:00:00.000Z" });
  });

  it("turns keep-mine into a new operation based on the preserved server revision", async () => {
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

    await mutations.resolveConflict("transaction-server", "keep_local");
    const resolution = await mutations.getPushBatch();
    expect(resolution?.operations).toMatchObject([
      {
        entityId: "transaction-server",
        operationType: "update",
        baseRevision: 4,
        payload: { description: "My offline edit", amountMinor: 10_000 },
      },
    ]);
    expect(resolution?.operations[0]?.idempotencyKey).not.toBe(
      request.operations[0]!.idempotencyKey,
    );
    expect(
      database.native
        .prepare("SELECT sync_state FROM transactions WHERE id = ?")
        .get("transaction-server"),
    ).toEqual({ sync_state: "pending" });
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
