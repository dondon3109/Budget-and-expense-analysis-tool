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
      ) VALUES
        ('account-1', 'Wallet', 'cash', 'PHP', 0, 0, 1, 'synced'),
        ('account-2', 'Savings', 'savings', 'PHP', 0, 0, 1, 'synced');
      INSERT INTO categories (
        id, name, kind, color, archived, system, origin, required_plan, locked,
        server_revision, sync_state
      ) VALUES (
        'category-1', 'Dining', 'expense', '#123456', 0, 0, 'custom', 'free', 0,
        1, 'synced'
      ), (
        'category-transfer', 'Transfer', 'transfer', '#008877', 0, 1, 'system', 'free', 0,
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

  it("queues an offline budget create and update with the correct payloads", async () => {
    const mutations = repository(database);

    await mutations.setBudgetLimit("2026-08-01", "category-1", 50_000);
    expect(
      database.native
        .prepare("SELECT category_id, month, limit_minor, server_revision, sync_state FROM budgets")
        .get(),
    ).toEqual({
      category_id: "category-1",
      month: "2026-08-01",
      limit_minor: 50_000,
      server_revision: 0,
      sync_state: "pending",
    });

    let batch = await mutations.getPushBatch();
    expect(batch?.operations).toHaveLength(1);
    expect(batch?.operations[0]).toMatchObject({
      entityType: "budget",
      operationType: "create",
      baseRevision: 0,
      payload: { categoryId: "category-1", month: "2026-08-01", limitMinor: 50_000 },
    });

    if (!batch) throw new Error("Expected a push batch.");
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
        .prepare("SELECT server_revision, sync_state FROM budgets WHERE category_id = ?")
        .get("category-1"),
    ).toEqual({ server_revision: 1, sync_state: "synced" });

    await mutations.setBudgetLimit("2026-08-01", "category-1", 80_000);
    batch = await mutations.getPushBatch();
    expect(batch?.operations).toHaveLength(1);
    expect(batch?.operations[0]).toMatchObject({
      entityType: "budget",
      operationType: "update",
      baseRevision: 1,
      payload: { limitMinor: 80_000 },
    });
  });

  it("rejects a budget for a non-expense category and a zero-limit create", async () => {
    const mutations = repository(database);

    await expect(
      mutations.setBudgetLimit("2026-08-01", "category-transfer", 50_000),
    ).rejects.toMatchObject({ code: "invalid_reference" });

    await mutations.setBudgetLimit("2026-08-01", "category-1", 0);
    expect(
      database.native.prepare("SELECT count(*) AS count FROM budgets").get(),
    ).toEqual({ count: 0 });
    expect(
      database.native.prepare("SELECT count(*) AS count FROM sync_outbox").get(),
    ).toEqual({ count: 0 });
  });

  it("replaces a conflicting budget create with the preserved server budget", async () => {
    const mutations = repository(database);
    await mutations.setBudgetLimit("2026-08-01", "category-1", 50_000);
    const request = (await mutations.getPushBatch())!;
    const localBudgetId = request.operations[0]!.entityId;
    await mutations.applyPushResponse(request, {
      protocolVersion: 1,
      results: [
        {
          operationId: request.operations[0]!.operationId,
          entityType: "budget",
          entityId: localBudgetId,
          status: "conflict",
          code: "entity_exists",
          serverRevision: 4,
          serverUpdatedAt: "2026-08-13 15:30:00",
          serverPayload: {
            id: "budget-server-1",
            categoryId: "category-1",
            month: "2026-08-01",
            limitMinor: 75_000,
            revision: 4,
            updatedAt: "2026-08-13 15:30:00",
          },
        },
      ],
    });

    await expect(mutations.getBudgetConflict(localBudgetId)).resolves.toMatchObject({
      local: { month: "2026-08-01", categoryId: "category-1", limitMinor: 50_000 },
      server: { month: "2026-08-01", categoryId: "category-1", limitMinor: 75_000 },
      serverRevision: 4,
    });

    await mutations.resolveBudgetConflict(localBudgetId, "keep_server");
    expect(
      database.native
        .prepare(
          "SELECT id, category_id, month, limit_minor, server_revision, sync_state FROM budgets",
        )
        .get(),
    ).toEqual({
      id: "budget-server-1",
      category_id: "category-1",
      month: "2026-08-01",
      limit_minor: 75_000,
      server_revision: 4,
      sync_state: "synced",
    });
    expect(
      database.native.prepare("SELECT count(*) AS count FROM sync_outbox").get(),
    ).toEqual({ count: 0 });
  });

  it("re-queues a keep-mine budget edit against the latest server revision", async () => {
    const mutations = repository(database);
    database.native.exec(
      `INSERT INTO budgets (
        id, category_id, month, limit_minor, server_revision, server_updated_at, sync_state
      ) VALUES ('budget-1', 'category-1', '2026-08-01', 50_000, 3, '2026-08-13 15:00:00', 'synced')`,
    );
    await mutations.setBudgetLimit("2026-08-01", "category-1", 80_000);
    const request = (await mutations.getPushBatch())!;
    await mutations.applyPushResponse(request, {
      protocolVersion: 1,
      results: [
        {
          operationId: request.operations[0]!.operationId,
          entityType: "budget",
          entityId: "budget-1",
          status: "conflict",
          code: "stale_revision",
          serverRevision: 5,
          serverUpdatedAt: "2026-08-13 16:00:00",
          serverPayload: {
            id: "budget-1",
            categoryId: "category-1",
            month: "2026-08-01",
            limitMinor: 90_000,
            revision: 5,
            updatedAt: "2026-08-13 16:00:00",
          },
        },
      ],
    });

    await mutations.resolveBudgetConflict("budget-1", "keep_local");
    expect(
      database.native
        .prepare(
          "SELECT limit_minor, server_revision, sync_state FROM budgets WHERE id = 'budget-1'",
        )
        .get(),
    ).toEqual({ limit_minor: 80_000, server_revision: 5, sync_state: "pending" });

    const batch = await mutations.getPushBatch();
    expect(batch?.operations).toHaveLength(1);
    expect(batch?.operations[0]).toMatchObject({
      entityType: "budget",
      entityId: "budget-1",
      operationType: "update",
      baseRevision: 5,
      payload: { limitMinor: 80_000 },
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

  it("persists, acknowledges, edits, and deletes both transfer legs as one outbox entity", async () => {
    const mutations = repository(database);
    const transfer = {
      kind: "transfer" as const,
      fromAccountId: "account-1",
      toAccountId: "account-2",
      categoryId: "category-transfer",
      date: "2026-08-13",
      description: "Emergency fund",
      amountMinor: 50_000,
      transferFeeMinor: 500,
      currency: "PHP" as const,
    };
    const fromId = await mutations.createTransaction(transfer);
    expect(
      database.native
        .prepare(
          `SELECT account_id, amount_minor, transfer_fee_minor, sync_state
           FROM transactions ORDER BY amount_minor`,
        )
        .all(),
    ).toEqual([
      {
        account_id: "account-1",
        amount_minor: -50_000,
        transfer_fee_minor: 500,
        sync_state: "pending",
      },
      {
        account_id: "account-2",
        amount_minor: 49_500,
        transfer_fee_minor: null,
        sync_state: "pending",
      },
    ]);
    const create = (await mutations.getPushBatch())!;
    expect(create.operations).toMatchObject([
      {
        entityType: "transfer",
        operationType: "create",
        payload: {
          fromTransactionId: fromId,
          transfer: { amountMinor: 50_000, transferFeeMinor: 500 },
        },
      },
    ]);
    await mutations.applyPushResponse(create, {
      protocolVersion: 1,
      results: [
        {
          operationId: create.operations[0]!.operationId,
          entityType: "transfer",
          entityId: create.operations[0]!.entityId,
          status: "acknowledged",
          revision: 1,
        },
      ],
    });
    expect(
      database.native
        .prepare(
          "SELECT server_revision, sync_state, count(*) AS count FROM transactions GROUP BY server_revision, sync_state",
        )
        .get(),
    ).toEqual({ server_revision: 1, sync_state: "synced", count: 2 });

    await mutations.updateTransfer(fromId, {
      ...transfer,
      description: "Emergency reserve",
      amountMinor: 60_000,
      transferFeeMinor: 0,
    });
    const update = (await mutations.getPushBatch())!;
    expect(update.operations).toMatchObject([
      {
        entityType: "transfer",
        operationType: "update",
        baseRevision: 1,
        payload: {
          transfer: {
            description: "Emergency reserve",
            amountMinor: 60_000,
            transferFeeMinor: 0,
          },
        },
      },
    ]);
    await mutations.applyPushResponse(update, {
      protocolVersion: 1,
      results: [
        {
          operationId: update.operations[0]!.operationId,
          entityType: "transfer",
          entityId: update.operations[0]!.entityId,
          status: "acknowledged",
          revision: 2,
        },
      ],
    });

    await mutations.deleteTransaction(fromId);
    const deletion = (await mutations.getPushBatch())!;
    expect(deletion.operations).toMatchObject([
      { entityType: "transfer", operationType: "delete", baseRevision: 2 },
    ]);
    expect(
      database.native
        .prepare(
          "SELECT deleted_at, sync_state, count(*) AS count FROM transactions GROUP BY deleted_at, sync_state",
        )
        .get(),
    ).toEqual({
      deleted_at: "2026-08-13T16:00:00.000Z",
      sync_state: "pending",
      count: 2,
    });
  });

  it("preserves both transfer versions and applies an explicit server conflict choice", async () => {
    const mutations = repository(database);
    const original = {
      kind: "transfer" as const,
      fromAccountId: "account-1",
      toAccountId: "account-2",
      categoryId: "category-transfer",
      date: "2026-08-13",
      description: "Original transfer",
      amountMinor: 40_000,
      transferFeeMinor: 0,
      currency: "PHP" as const,
    };
    const fromId = await mutations.createTransaction(original);
    const create = (await mutations.getPushBatch())!;
    const groupId = create.operations[0]!.entityId;
    await mutations.applyPushResponse(create, {
      protocolVersion: 1,
      results: [
        {
          operationId: create.operations[0]!.operationId,
          entityType: "transfer",
          entityId: groupId,
          status: "acknowledged",
          revision: 1,
        },
      ],
    });
    database.native
      .prepare("UPDATE transactions SET server_updated_at = ? WHERE transfer_group_id = ?")
      .run("2026-08-13 15:00:00", groupId);
    await mutations.updateTransfer(fromId, {
      ...original,
      description: "My offline transfer",
      amountMinor: 45_000,
    });
    const update = (await mutations.getPushBatch())!;
    const createPayload = create.operations[0]!;
    if (createPayload.entityType !== "transfer" || createPayload.operationType !== "create") {
      throw new Error("Expected a transfer create.");
    }
    await mutations.applyPushResponse(update, {
      protocolVersion: 1,
      results: [
        {
          operationId: update.operations[0]!.operationId,
          entityType: "transfer",
          entityId: groupId,
          status: "conflict",
          code: "stale_revision",
          serverRevision: 2,
          serverUpdatedAt: "2026-08-13 15:30:00",
          serverPayload: {
            id: groupId,
            fromTransactionId: createPayload.payload.fromTransactionId,
            toTransactionId: createPayload.payload.toTransactionId,
            fromAccountId: "account-1",
            toAccountId: "account-2",
            categoryId: "category-transfer",
            date: "2026-08-13",
            description: "Web transfer",
            amountMinor: 50_000,
            currency: "PHP",
            notes: null,
            transferFeeMinor: 500,
            revision: 2,
            updatedAt: "2026-08-13 15:30:00",
          },
        },
      ],
    });

    await expect(mutations.getConflict(fromId)).resolves.toMatchObject({
      entityId: fromId,
      local: { input: { description: "My offline transfer", amountMinor: 45_000 } },
      server: {
        input: {
          kind: "transfer",
          description: "Web transfer",
          amountMinor: 50_000,
          transferFeeMinor: 500,
        },
      },
      serverRevision: 2,
    });
    await mutations.resolveConflict(fromId, "keep_server");
    expect(
      database.native
        .prepare(
          `SELECT description, amount_minor, transfer_fee_minor, server_revision, sync_state
           FROM transactions WHERE transfer_group_id = ? ORDER BY amount_minor`,
        )
        .all(groupId),
    ).toEqual([
      {
        description: "Web transfer",
        amount_minor: -50_000,
        transfer_fee_minor: 500,
        server_revision: 2,
        sync_state: "synced",
      },
      {
        description: "Web transfer",
        amount_minor: 49_500,
        transfer_fee_minor: null,
        server_revision: 2,
        sync_state: "synced",
      },
    ]);
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

describe("durable local financial goal mutations", () => {
  let database: TestDatabase;

  beforeEach(() => {
    database = new TestDatabase();
  });

  afterEach(() => database.close());

  it("creates, updates, and deletes a goal offline", async () => {
    const mutations = repository(database);
    const id = await mutations.createGoal({
      name: "House Fund",
      targetAmountMinor: 500_000,
      currentAmountMinor: 0,
      targetDate: "2027-12-31",
      status: "active",
    });
    expect(
      database.native
        .prepare("SELECT name, server_revision, sync_state FROM financial_goals WHERE id = ?")
        .get(id),
    ).toEqual({ name: "House Fund", server_revision: 0, sync_state: "pending" });

    await mutations.updateGoal(id, { currentAmountMinor: 120_000 });
    expect(
      database.native
        .prepare("SELECT current_amount_minor, sync_state FROM financial_goals WHERE id = ?")
        .get(id),
    ).toEqual({ current_amount_minor: 120_000, sync_state: "pending" });

    await mutations.deleteGoal(id);
    expect(
      database.native.prepare("SELECT id FROM financial_goals WHERE id = ?").get(id),
    ).toBeUndefined();
    expect(
      database.native
        .prepare("SELECT count(*) AS count FROM sync_outbox WHERE entity_id = ?")
        .get(id),
    ).toEqual({ count: 0 });
  });

  it("rejects a duplicate goal name locally", async () => {
    const mutations = repository(database);
    await mutations.createGoal({
      name: "Emergency Fund",
      targetAmountMinor: 100_000,
      currentAmountMinor: 0,
      targetDate: "2026-12-31",
      status: "active",
    });
    await expect(
      mutations.createGoal({
        name: "EMERGENCY FUND",
        targetAmountMinor: 200_000,
        currentAmountMinor: 0,
        targetDate: "2027-06-30",
        status: "active",
      }),
    ).rejects.toMatchObject({ code: "name_conflict" });
  });

  it("rejects current savings above the target", async () => {
    const mutations = repository(database);
    const id = await mutations.createGoal({
      name: "Vacation",
      targetAmountMinor: 100_000,
      currentAmountMinor: 0,
      targetDate: "2027-01-01",
      status: "active",
    });
    await expect(
      mutations.updateGoal(id, { currentAmountMinor: 200_000 }),
    ).rejects.toMatchObject({ code: "mutation_blocked" });
  });

  it("preserves and resolves a stale goal update conflict", async () => {
    const mutations = repository(database);
    database.native.exec(`
      INSERT INTO financial_goals (
        id, name, target_amount_minor, current_amount_minor, target_date, status,
        server_revision, server_updated_at, sync_state
      ) VALUES (
        'goal-server', 'Server Goal', 100000, 25000, '2026-12-31', 'active',
        3, '2026-08-13 15:00:00', 'synced'
      );
    `);
    await mutations.updateGoal("goal-server", { currentAmountMinor: 50_000 });
    const request = (await mutations.getPushBatch())!;
    await mutations.applyPushResponse(request, {
      protocolVersion: 1,
      results: [
        {
          operationId: request.operations[0]!.operationId,
          entityType: "goal",
          entityId: "goal-server",
          status: "conflict",
          code: "stale_revision",
          serverRevision: 4,
          serverUpdatedAt: "2026-08-13 16:00:00",
          serverPayload: {
            id: "goal-server",
            name: "Server Goal",
            targetAmountMinor: 100_000,
            currentAmountMinor: 60_000,
            targetDate: "2026-12-31",
            status: "active",
            revision: 4,
            updatedAt: "2026-08-13 16:00:00",
          },
        },
      ],
    });

    const conflict = await mutations.getGoalConflict("goal-server");
    expect(conflict).toMatchObject({
      entityId: "goal-server",
      local: { currentAmountMinor: 50_000 },
      server: { currentAmountMinor: 60_000 },
    });

    await mutations.resolveGoalConflict("goal-server", "keep_local");
    expect(
      database.native
        .prepare(
          "SELECT current_amount_minor, server_revision, sync_state FROM financial_goals WHERE id = 'goal-server'",
        )
        .get(),
    ).toEqual({ current_amount_minor: 50_000, server_revision: 4, sync_state: "pending" });

    const batch = await mutations.getPushBatch();
    expect(batch?.operations).toHaveLength(1);
    expect(batch?.operations[0]).toMatchObject({
      entityType: "goal",
      entityId: "goal-server",
      operationType: "update",
      baseRevision: 4,
    });
  });
});
describe("durable local debt mutations", () => {
  let database: TestDatabase;

  beforeEach(() => {
    database = new TestDatabase();
  });

  afterEach(() => database.close());

  it("creates, updates, and deletes a debt offline", async () => {
    const mutations = repository(database);
    const id = await mutations.createDebt({
      name: "Car Loan",
      type: "auto_loan",
      balanceMinor: 500_000,
      aprBasisPoints: 850,
      minimumPaymentMinor: 12_000,
      balanceAsOf: "2026-08-14",
      status: "active",
    });
    expect(
      database.native
        .prepare("SELECT name, balance_minor, server_revision, sync_state FROM debts WHERE id = ?")
        .get(id),
    ).toEqual({ name: "Car Loan", balance_minor: 500_000, server_revision: 0, sync_state: "pending" });

    await mutations.updateDebt(id, { balanceMinor: 450_000, aprBasisPoints: 800 });
    expect(
      database.native
        .prepare("SELECT balance_minor, apr_basis_points, sync_state FROM debts WHERE id = ?")
        .get(id),
    ).toEqual({ balance_minor: 450_000, apr_basis_points: 800, sync_state: "pending" });

    await mutations.deleteDebt(id);
    expect(
      database.native.prepare("SELECT id FROM debts WHERE id = ?").get(id),
    ).toBeUndefined();
    expect(
      database.native
        .prepare("SELECT count(*) AS count FROM sync_outbox WHERE entity_id = ?")
        .get(id),
    ).toEqual({ count: 0 });
  });

  it("rejects a duplicate debt name locally", async () => {
    const mutations = repository(database);
    await mutations.createDebt({
      name: "Mortgage",
      type: "mortgage",
      balanceMinor: 2_000_000,
      aprBasisPoints: 600,
      minimumPaymentMinor: 25_000,
      balanceAsOf: "2026-08-14",
      status: "active",
    });
    await expect(
      mutations.createDebt({
        name: "MORTGAGE",
        type: "mortgage",
        balanceMinor: 1_000_000,
        aprBasisPoints: 600,
        minimumPaymentMinor: 20_000,
        balanceAsOf: "2026-08-14",
        status: "active",
      }),
    ).rejects.toMatchObject({ code: "name_conflict" });
  });

  it("allows paying a debt down to zero via update", async () => {
    const mutations = repository(database);
    const id = await mutations.createDebt({
      name: "Credit Card",
      type: "credit_card",
      balanceMinor: 80_000,
      aprBasisPoints: 2_400,
      minimumPaymentMinor: 2_000,
      balanceAsOf: "2026-08-14",
      status: "active",
    });
    await mutations.updateDebt(id, { balanceMinor: 0, status: "paid" });
    expect(
      database.native
        .prepare("SELECT balance_minor, status FROM debts WHERE id = ?")
        .get(id),
    ).toEqual({ balance_minor: 0, status: "paid" });
  });

  it("preserves and resolves a stale debt update conflict", async () => {
    const mutations = repository(database);
    database.native.exec(
      "INSERT INTO debts (id, name, type, balance_minor, apr_basis_points, minimum_payment_minor, " +
      "balance_as_of, status, server_revision, server_updated_at, sync_state) VALUES (" +
      "'debt-server', 'Server Loan', 'personal_loan', 100000, 1200, 5000, " +
      "'2026-08-14', 'active', 3, '2026-08-13 15:00:00', 'synced');",
    );
    await mutations.updateDebt("debt-server", { balanceMinor: 80_000 });
    const request = (await mutations.getPushBatch())!;
    await mutations.applyPushResponse(request, {
      protocolVersion: 1,
      results: [
        {
          operationId: request.operations[0]!.operationId,
          entityType: "debt",
          entityId: "debt-server",
          status: "conflict",
          code: "stale_revision",
          serverRevision: 4,
          serverUpdatedAt: "2026-08-13 16:00:00",
          serverPayload: {
            id: "debt-server",
            name: "Server Loan",
            type: "personal_loan",
            balanceMinor: 100_000,
            aprBasisPoints: 1_200,
            minimumPaymentMinor: 5_000,
            balanceAsOf: "2026-08-14",
            status: "active",
            revision: 4,
            updatedAt: "2026-08-13 16:00:00",
          },
        },
      ],
    });

    const conflict = await mutations.getDebtConflict("debt-server");
    expect(conflict).toMatchObject({
      entityId: "debt-server",
      local: { balanceMinor: 80_000 },
      server: { balanceMinor: 100_000 },
    });

    await mutations.resolveDebtConflict("debt-server", "keep_server");
    expect(
      database.native
        .prepare(
          "SELECT balance_minor, server_revision, sync_state FROM debts WHERE id = 'debt-server'",
        )
        .get(),
    ).toEqual({ balance_minor: 100_000, server_revision: 4, sync_state: "synced" });
  });
});
describe("durable local subscription mutations", () => {
  let database: TestDatabase;

  beforeEach(() => {
    database = new TestDatabase();
  });

  afterEach(() => database.close());

  it("creates, updates, cancels, and deletes a subscription offline", async () => {
    const mutations = repository(database);
    const id = await mutations.createSubscription({
      name: "Netflix",
      amountMinor: 54_900,
      billingCycle: "monthly",
      nextBillingDate: "2026-09-01",
      categoryId: "category-1",
      accountId: "account-1",
    });
    expect(
      database.native
        .prepare(
          "SELECT name, amount_minor, status, server_revision, sync_state FROM subscriptions WHERE id = ?",
        )
        .get(id),
    ).toEqual({
      name: "Netflix",
      amount_minor: 54_900,
      status: "active",
      server_revision: 0,
      sync_state: "pending",
    });

    await mutations.updateSubscription(id, {
      name: "Netflix Premium",
      amountMinor: 74_900,
      billingCycle: "monthly",
      nextBillingDate: "2026-09-01",
      categoryId: "category-1",
      accountId: "account-1",
    });
    expect(
      database.native
        .prepare("SELECT name, amount_minor, sync_state FROM subscriptions WHERE id = ?")
        .get(id),
    ).toEqual({ name: "Netflix Premium", amount_minor: 74_900, sync_state: "pending" });

    await mutations.updateSubscription(id, {
      name: "Netflix Premium",
      amountMinor: 74_900,
      billingCycle: "monthly",
      nextBillingDate: "2026-09-01",
      categoryId: "category-1",
      accountId: "account-1",
      status: "canceled",
    });
    expect(
      database.native.prepare("SELECT status FROM subscriptions WHERE id = ?").get(id),
    ).toEqual({ status: "canceled" });

    await mutations.deleteSubscription(id);
    expect(
      database.native.prepare("SELECT id FROM subscriptions WHERE id = ?").get(id),
    ).toBeUndefined();
    expect(
      database.native
        .prepare("SELECT count(*) AS count FROM sync_outbox WHERE entity_id = ?")
        .get(id),
    ).toEqual({ count: 0 });
  });

  it("rejects a subscription without an expense category or active account", async () => {
    const mutations = repository(database);
    await expect(
      mutations.createSubscription({
        name: "Transfer Billed",
        amountMinor: 10_000,
        billingCycle: "monthly",
        nextBillingDate: "2026-09-01",
        categoryId: "category-transfer",
        accountId: "account-1",
      }),
    ).rejects.toMatchObject({ code: "invalid_reference" });
    await expect(
      mutations.createSubscription({
        name: "Missing Account",
        amountMinor: 10_000,
        billingCycle: "monthly",
        nextBillingDate: "2026-09-01",
        categoryId: "category-1",
        accountId: "account-missing",
      }),
    ).rejects.toMatchObject({ code: "invalid_reference" });
  });

  it("preserves and resolves a stale subscription update conflict", async () => {
    const mutations = repository(database);
    database.native.exec(
      "INSERT INTO subscriptions (id, name, amount_minor, currency, billing_cycle, next_billing_date, " +
      "status, category_id, account_id, server_revision, server_updated_at, sync_state) VALUES (" +
      "'subscription-server', 'Server Sub', 9900, 'PHP', 'monthly', '2026-09-01', 'active', " +
      "'category-1', 'account-1', 3, '2026-08-13 15:00:00', 'synced');",
    );
    await mutations.updateSubscription("subscription-server", {
      name: "Device Sub",
      amountMinor: 12_900,
      billingCycle: "monthly",
      nextBillingDate: "2026-09-01",
      categoryId: "category-1",
      accountId: "account-1",
    });
    const request = (await mutations.getPushBatch())!;
    await mutations.applyPushResponse(request, {
      protocolVersion: 1,
      results: [
        {
          operationId: request.operations[0]!.operationId,
          entityType: "subscription",
          entityId: "subscription-server",
          status: "conflict",
          code: "stale_revision",
          serverRevision: 4,
          serverUpdatedAt: "2026-08-13 16:00:00",
          serverPayload: {
            id: "subscription-server",
            name: "Server Sub",
            amountMinor: 9_900,
            currency: "PHP",
            billingCycle: "monthly",
            nextBillingDate: "2026-09-01",
            status: "active",
            categoryId: "category-1",
            accountId: "account-1",
            revision: 4,
            updatedAt: "2026-08-13 16:00:00",
          },
        },
      ],
    });

    const conflict = await mutations.getSubscriptionConflict("subscription-server");
    expect(conflict).toMatchObject({
      entityId: "subscription-server",
      local: { name: "Device Sub", amountMinor: 12_900 },
      server: { name: "Server Sub", amountMinor: 9_900 },
    });

    await mutations.resolveSubscriptionConflict("subscription-server", "keep_server");
    expect(
      database.native
        .prepare(
          "SELECT name, amount_minor, server_revision, sync_state FROM subscriptions WHERE id = 'subscription-server'",
        )
        .get(),
    ).toEqual({ name: "Server Sub", amount_minor: 9_900, server_revision: 4, sync_state: "synced" });
  });
});
describe("durable local savings-interest mutations", () => {
  let database: TestDatabase;

  beforeEach(() => {
    database = new TestDatabase();
  });

  afterEach(() => database.close());

  it("queues offline interest settings and coalesces them with account edits", async () => {
    const mutations = repository(database);
    const id = await mutations.createAccount({ name: "Goal fund", type: "savings" });
    await mutations.updateAccountInterest(id, {
      enabled: true,
      annualRateBasisPoints: 500,
      frequency: "monthly",
      payDay: 15,
    });
    expect(
      database.native
        .prepare("SELECT interest_json, sync_state FROM accounts WHERE id = ?")
        .get(id),
    ).toEqual({
      interest_json: JSON.stringify({
        enabled: true,
        annualRateBasisPoints: 500,
        frequency: "monthly",
        payDay: 15,
      }),
      sync_state: "pending",
    });

    await mutations.updateAccount(id, { name: "Renamed fund", type: "savings" });
    const batch = (await mutations.getPushBatch())!;
    const create = batch.operations.find((operation) => operation.entityType === "account");
    expect(create?.operationType).toBe("create");
    expect(create?.payload).toMatchObject({
      name: "Renamed fund",
      type: "savings",
      interest: {
        enabled: true,
        annualRateBasisPoints: 500,
        frequency: "monthly",
        payDay: 15,
      },
    });
  });

  it("stores a savings conversion and its interest settings in one local mutation", async () => {
    const mutations = repository(database);
    const id = await mutations.createAccount({ name: "Travel fund", type: "checking" });
    const interest = {
      enabled: true,
      annualRateBasisPoints: 425,
      frequency: "monthly" as const,
      payDay: 10,
    };

    await mutations.updateAccount(id, {
      name: "Travel fund",
      type: "savings",
      interest,
    });

    expect(
      database.native.prepare("SELECT type, interest_json FROM accounts WHERE id = ?").get(id),
    ).toEqual({ type: "savings", interest_json: JSON.stringify(interest) });
    const batch = (await mutations.getPushBatch())!;
    expect(batch.operations).toMatchObject([
      {
        entityType: "account",
        entityId: id,
        operationType: "create",
        payload: { name: "Travel fund", type: "savings", interest },
      },
    ]);
  });

  it("allows an interest-only plan rejection to be retried after Pro access changes", async () => {
    const mutations = repository(database);
    const id = await mutations.createAccount({ name: "Emergency fund", type: "checking" });
    const interest = {
      enabled: true,
      annualRateBasisPoints: 500,
      frequency: "monthly" as const,
      payDay: 15,
    };
    await mutations.updateAccount(id, {
      name: "Emergency fund",
      type: "savings",
      interest,
    });
    const rejected = (await mutations.getPushBatch())!;
    await mutations.applyPushResponse(rejected, {
      protocolVersion: 1,
      results: [
        {
          operationId: rejected.operations[0]!.operationId,
          entityType: "account",
          entityId: id,
          status: "rejected",
          code: "plan_limit",
          message: "Automatic interest requires Zoption Pro.",
        },
      ],
    });

    await mutations.retryAccountInterestSync(id);

    expect(
      database.native
        .prepare(
          "SELECT state, attempt_count, last_error_code FROM sync_outbox WHERE entity_id = ?",
        )
        .get(id),
    ).toEqual({ state: "pending", attempt_count: 0, last_error_code: null });
    expect(database.native.prepare("SELECT sync_state FROM accounts WHERE id = ?").get(id)).toEqual(
      {
        sync_state: "pending",
      },
    );
    const retried = (await mutations.getPushBatch())!;
    expect(retried.operations).toMatchObject([
      {
        entityType: "account",
        entityId: id,
        operationType: "create",
        payload: { name: "Emergency fund", type: "savings", interest },
      },
    ]);
  });

  it("rejects interest settings on non-savings accounts", async () => {
    const mutations = repository(database);
    const id = await mutations.createAccount({ name: "Cash purse", type: "cash" });
    await expect(
      mutations.updateAccountInterest(id, {
        enabled: true,
        annualRateBasisPoints: 500,
        frequency: "monthly",
        payDay: 15,
      }),
    ).rejects.toMatchObject({ code: "mutation_blocked" });
    expect(
      database.native.prepare("SELECT interest_json FROM accounts WHERE id = ?").get(id),
    ).toEqual({
      interest_json: JSON.stringify({
        enabled: false,
        annualRateBasisPoints: null,
        frequency: null,
        payDay: null,
      }),
    });
  });

  it("applies acknowledged interest settings from the server snapshot", async () => {
    const mutations = repository(database);
    const id = await mutations.createAccount({ name: "Goal fund", type: "savings" });
    const createBatch = (await mutations.getPushBatch())!;
    await mutations.applyPushResponse(createBatch, {
      protocolVersion: 1,
      results: [
        {
          operationId: createBatch.operations[0]!.operationId,
          entityType: "account",
          entityId: id,
          status: "acknowledged",
          revision: 1,
        },
      ],
    });

    await mutations.updateAccountInterest(id, {
      enabled: true,
      annualRateBasisPoints: 500,
      frequency: "monthly",
      payDay: 15,
    });
    const updateBatch = (await mutations.getPushBatch())!;
    await mutations.applyPushResponse(updateBatch, {
      protocolVersion: 1,
      results: [
        {
          operationId: updateBatch.operations[0]!.operationId,
          entityType: "account",
          entityId: id,
          status: "acknowledged",
          revision: 2,
        },
      ],
    });
    expect(
      database.native
        .prepare(
          "SELECT interest_json, server_revision, sync_state FROM accounts WHERE id = ?",
        )
        .get(id),
    ).toEqual({
      interest_json: JSON.stringify({
        enabled: true,
        annualRateBasisPoints: 500,
        frequency: "monthly",
        payDay: 15,
      }),
      server_revision: 2,
      sync_state: "synced",
    });
  });

  it("preserves pending interest settings when a conflict is resolved locally", async () => {
    const mutations = repository(database);
    const id = await mutations.createAccount({ name: "Goal fund", type: "savings" });
    const createBatch = (await mutations.getPushBatch())!;
    await mutations.applyPushResponse(createBatch, {
      protocolVersion: 1,
      results: [
        {
          operationId: createBatch.operations[0]!.operationId,
          entityType: "account",
          entityId: id,
          status: "acknowledged",
          revision: 1,
        },
      ],
    });

    await mutations.updateAccountInterest(id, {
      enabled: true,
      annualRateBasisPoints: 500,
      frequency: "monthly",
      payDay: 15,
    });
    const updateBatch = (await mutations.getPushBatch())!;
    await mutations.applyPushResponse(updateBatch, {
      protocolVersion: 1,
      results: [
        {
          operationId: updateBatch.operations[0]!.operationId,
          entityType: "account",
          entityId: id,
          status: "conflict",
          code: "stale_revision",
          serverRevision: 2,
          serverUpdatedAt: "2026-08-13 16:00:00",
          serverPayload: {
            id,
            name: "Goal fund",
            type: "savings",
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
            updatedAt: "2026-08-13 16:00:00",
          },
        },
      ],
    });

    const conflict = await mutations.getReferenceConflict("account", id);
    expect(conflict).not.toBeNull();

    await mutations.resolveReferenceConflict("account", id, "keep_local");
    const requeued = (await mutations.getPushBatch())!;
    const update = requeued.operations.find((operation) => operation.entityType === "account");
    expect(update?.operationType).toBe("update");
    expect(update?.payload).toMatchObject({
      name: "Goal fund",
      type: "savings",
      interest: {
        enabled: true,
        annualRateBasisPoints: 500,
        frequency: "monthly",
        payDay: 15,
      },
    });
  });
});

describe("durable local calendar event mutations", () => {
  let database: TestDatabase;

  beforeEach(() => {
    database = new TestDatabase();
  });

  afterEach(() => database.close());

  it("creates, updates, and deletes an event offline", async () => {
    const mutations = repository(database);
    const id = await mutations.createEvent({
      title: "Birthday dinner",
      date: "2026-08-20",
      startTime: "18:00",
      endTime: "20:00",
      notes: "With family",
    });
    expect(
      database.native
        .prepare(
          "SELECT title, date, start_time, server_revision, sync_state FROM calendar_events WHERE id = ?",
        )
        .get(id),
    ).toEqual({
      title: "Birthday dinner",
      date: "2026-08-20",
      start_time: "18:00",
      server_revision: 0,
      sync_state: "pending",
    });

    await mutations.updateEvent(id, {
      title: "Birthday dinner",
      date: "2026-08-21",
      startTime: null,
      endTime: null,
      notes: null,
    });
    expect(
      database.native
        .prepare("SELECT date, start_time, end_time, sync_state FROM calendar_events WHERE id = ?")
        .get(id),
    ).toEqual({ date: "2026-08-21", start_time: null, end_time: null, sync_state: "pending" });

    await mutations.deleteEvent(id);
    expect(
      database.native.prepare("SELECT id FROM calendar_events WHERE id = ?").get(id),
    ).toBeUndefined();
    expect(
      database.native
        .prepare("SELECT count(*) AS count FROM sync_outbox WHERE entity_id = ?")
        .get(id),
    ).toEqual({ count: 0 });
  });

  it("rejects an inverted time window locally", async () => {
    const mutations = repository(database);
    expect(() =>
      mutations.createEvent({
        title: "Bad window",
        date: "2026-08-20",
        startTime: "21:00",
        endTime: "20:00",
        notes: null,
      }),
    ).toThrow();
    expect(
      database.native.prepare("SELECT count(*) AS count FROM calendar_events").get(),
    ).toEqual({ count: 0 });
  });

  it("preserves and resolves a stale event update conflict", async () => {
    const mutations = repository(database);
    database.native.exec(
      "INSERT INTO calendar_events (id, title, date, start_time, end_time, notes, " +
        "server_revision, server_updated_at, sync_state) VALUES (" +
        "'event-server', 'Server Event', '2026-08-20', '18:00', '20:00', NULL, " +
        "3, '2026-08-13 15:00:00', 'synced');",
    );
    await mutations.updateEvent("event-server", {
      title: "Device Event",
      date: "2026-08-20",
      startTime: "18:00",
      endTime: "20:00",
      notes: null,
    });
    const request = (await mutations.getPushBatch())!;
    await mutations.applyPushResponse(request, {
      protocolVersion: 1,
      results: [
        {
          operationId: request.operations[0]!.operationId,
          entityType: "event",
          entityId: "event-server",
          status: "conflict",
          code: "stale_revision",
          serverRevision: 4,
          serverUpdatedAt: "2026-08-13 16:00:00",
          serverPayload: {
            id: "event-server",
            title: "Server Event",
            date: "2026-08-20",
            startTime: "18:00",
            endTime: "20:00",
            notes: null,
            revision: 4,
            updatedAt: "2026-08-13 16:00:00",
          },
        },
      ],
    });

    const conflict = await mutations.getEventConflict("event-server");
    expect(conflict).toMatchObject({
      entityId: "event-server",
      local: { title: "Device Event" },
      server: { title: "Server Event" },
    });

    await mutations.resolveEventConflict("event-server", "keep_server");
    expect(
      database.native
        .prepare(
          "SELECT title, server_revision, sync_state FROM calendar_events WHERE id = 'event-server'",
        )
        .get(),
    ).toEqual({ title: "Server Event", server_revision: 4, sync_state: "synced" });
  });
});


