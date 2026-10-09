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

const AUGUST = { scope: "month", month: "2026-08-01" } as const;

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

describe("local budget mutations", () => {
  let database: TestDatabase;

  beforeEach(() => {
    database = new TestDatabase();
  });

  afterEach(() => database.close());

  it("queues an offline budget create and update with the correct payloads", async () => {
    const mutations = repository(database);

    await mutations.setBudgetLimit(AUGUST, "category-1", 50_000);
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
      payload: {
        categoryId: "category-1",
        month: "2026-08-01",
        occasionId: null,
        limitMinor: 50_000,
      },
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

    await mutations.setBudgetLimit(AUGUST, "category-1", 80_000);
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
      mutations.setBudgetLimit(AUGUST, "category-transfer", 50_000),
    ).rejects.toMatchObject({ code: "invalid_reference" });

    await mutations.setBudgetLimit(AUGUST, "category-1", 0);
    expect(database.native.prepare("SELECT count(*) AS count FROM budgets").get()).toEqual({
      count: 0,
    });
    expect(database.native.prepare("SELECT count(*) AS count FROM sync_outbox").get()).toEqual({
      count: 0,
    });
  });

  it("replaces a conflicting budget create with the preserved server budget", async () => {
    const mutations = repository(database);
    await mutations.setBudgetLimit(AUGUST, "category-1", 50_000);
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
    expect(database.native.prepare("SELECT count(*) AS count FROM sync_outbox").get()).toEqual({
      count: 0,
    });
  });

  it("re-queues a keep-mine budget edit against the latest server revision", async () => {
    const mutations = repository(database);
    database.native.exec(
      `INSERT INTO budgets (
        id, category_id, month, limit_minor, server_revision, server_updated_at, sync_state
      ) VALUES ('budget-1', 'category-1', '2026-08-01', 50_000, 3, '2026-08-13 15:00:00', 'synced')`,
    );
    await mutations.setBudgetLimit(AUGUST, "category-1", 80_000);
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

  it("keeps a month's zero limit as a row when it switches an every-month default off", async () => {
    const mutations = repository(database);
    await mutations.setBudgetLimit({ scope: "every-month" }, "category-1", 50_000);

    await mutations.setBudgetLimit(AUGUST, "category-1", 0);

    expect(
      database.native
        .prepare("SELECT month, occasion_id, limit_minor FROM budgets ORDER BY month")
        .all(),
    ).toEqual([
      { month: "0001-01-01", occasion_id: null, limit_minor: 50_000 },
      { month: "2026-08-01", occasion_id: null, limit_minor: 0 },
    ]);
  });

  it("queues an occasion limit against its event under the every-month placeholder month", async () => {
    const mutations = repository(database);

    await mutations.setBudgetLimit({ scope: "occasion", eventId: "event-1" }, "category-1", 80_000);

    const batch = await mutations.getPushBatch();
    expect(batch?.operations[0]).toMatchObject({
      entityType: "budget",
      operationType: "create",
      payload: {
        categoryId: "category-1",
        month: "0001-01-01",
        occasionId: "event-1",
        limitMinor: 80_000,
      },
    });
  });

  it("holds one limit per category in an occasion, apart from the months", async () => {
    const mutations = repository(database);
    await mutations.setBudgetLimit(AUGUST, "category-1", 50_000);
    await mutations.setBudgetLimit({ scope: "occasion", eventId: "event-1" }, "category-1", 80_000);
    await mutations.setBudgetLimit({ scope: "occasion", eventId: "event-2" }, "category-1", 20_000);

    expect(
      database.native
        .prepare("SELECT count(*) AS count FROM budgets WHERE category_id = ?")
        .get("category-1"),
    ).toEqual({ count: 3 });
  });
});
