/// <reference types="node" />

import { DatabaseSync, type SQLInputValue } from "node:sqlite";

import type { MobileSyncPullResponse } from "@zoption/shared";
import type { SQLiteDatabase } from "expo-sqlite";

import { migrations } from "./migrations";
import { LocalSyncRepository } from "./sync-repository";

class TestDatabase {
  readonly native = new DatabaseSync(":memory:");

  constructor() {
    this.native.exec("PRAGMA foreign_keys = ON");
    for (const migration of migrations) this.native.exec(migration.sql);
  }

  async getFirstAsync<T>(source: string, ...params: unknown[]): Promise<T | null> {
    return (
      (this.native.prepare(source).get(...(params as SQLInputValue[])) as T | undefined) ?? null
    );
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

const timestamp = "2026-08-13 14:00:00";

const bootstrapPage: MobileSyncPullResponse = {
  protocolVersion: 1,
  nextCursor: "v1.3",
  hasMore: false,
  changes: [
    {
      entityType: "account",
      entityId: "account-1",
      revision: 1,
      operation: "upsert",
      serverUpdatedAt: timestamp,
      payload: {
        id: "account-1",
        name: "Wallet",
        type: "cash",
        currency: "PHP",
        archived: false,
        system: false,
        interest: {
          enabled: false,
          annualRateBasisPoints: null,
          frequency: null,
          payDay: null,
        },
        revision: 1,
        updatedAt: timestamp,
      },
    },
    {
      entityType: "category",
      entityId: "category-1",
      revision: 1,
      operation: "upsert",
      serverUpdatedAt: timestamp,
      payload: {
        id: "category-1",
        name: "Dining",
        kind: "expense",
        color: "#123456",
        archived: false,
        system: false,
        origin: "custom",
        requiredPlan: "free",
        locked: false,
        revision: 1,
        updatedAt: timestamp,
      },
    },
    {
      entityType: "transaction",
      entityId: "transaction-1",
      revision: 1,
      operation: "upsert",
      serverUpdatedAt: timestamp,
      payload: {
        id: "transaction-1",
        accountId: "account-1",
        categoryId: "category-1",
        date: "2026-08-13",
        description: "Lunch",
        amountMinor: -25_000,
        currency: "PHP",
        kind: "expense",
        notes: null,
        transferGroupId: null,
        transferFeeMinor: null,
        importFingerprint: null,
        revision: 1,
        updatedAt: timestamp,
      },
    },
  ],
};

describe("atomic encrypted pull application", () => {
  let database: TestDatabase;

  beforeEach(() => {
    database = new TestDatabase();
  });

  afterEach(() => database.close());

  it("persists a validated page and cursor for process restart", async () => {
    const repository = new LocalSyncRepository(database as unknown as SQLiteDatabase);
    await repository.applyPullPage(null, bootstrapPage);

    const reopened = new LocalSyncRepository(database as unknown as SQLiteDatabase);
    await expect(reopened.getCursor()).resolves.toBe("v1.3");
    expect(
      database.native
        .prepare("SELECT description, server_revision, sync_state FROM transactions")
        .get(),
    ).toEqual({ description: "Lunch", server_revision: 1, sync_state: "synced" });
  });

  it("applies a budget upsert into the monthly budgets table", async () => {
    const repository = new LocalSyncRepository(database as unknown as SQLiteDatabase);
    await repository.applyPullPage(null, bootstrapPage);

    await repository.applyPullPage("v1.3", {
      protocolVersion: 1,
      nextCursor: "v1.4",
      hasMore: false,
      changes: [
        {
          entityType: "budget",
          entityId: "budget-1",
          revision: 1,
          operation: "upsert",
          serverUpdatedAt: timestamp,
          payload: {
            id: "budget-1",
            categoryId: "category-1",
            month: "2026-08-01",
            limitMinor: 50_000,
            revision: 1,
            updatedAt: timestamp,
          },
        },
      ],
    });

    expect(
      database.native
        .prepare("SELECT category_id, month, limit_minor, server_revision, sync_state FROM budgets")
        .get(),
    ).toEqual({
      category_id: "category-1",
      month: "2026-08-01",
      limit_minor: 50_000,
      server_revision: 1,
      sync_state: "synced",
    });
  });

  it("applies a financial goal upsert and deletion tombstone", async () => {
    const repository = new LocalSyncRepository(database as unknown as SQLiteDatabase);
    await repository.applyPullPage(null, bootstrapPage);

    await repository.applyPullPage("v1.3", {
      protocolVersion: 1,
      nextCursor: "v1.4",
      hasMore: false,
      changes: [
        {
          entityType: "goal",
          entityId: "goal-1",
          revision: 1,
          operation: "upsert",
          serverUpdatedAt: timestamp,
          payload: {
            id: "goal-1",
            name: "Emergency Fund",
            targetAmountMinor: 100_000,
            currentAmountMinor: 25_000,
            targetDate: "2026-12-31",
            status: "active",
            revision: 1,
            updatedAt: timestamp,
          },
        },
      ],
    });

    expect(
      database.native
        .prepare(
          "SELECT name, target_amount_minor, current_amount_minor, status, server_revision, sync_state FROM financial_goals",
        )
        .get(),
    ).toEqual({
      name: "Emergency Fund",
      target_amount_minor: 100_000,
      current_amount_minor: 25_000,
      status: "active",
      server_revision: 1,
      sync_state: "synced",
    });

    await repository.applyPullPage("v1.4", {
      protocolVersion: 1,
      nextCursor: "v1.5",
      hasMore: false,
      changes: [
        {
          entityType: "goal",
          entityId: "goal-1",
          revision: 2,
          operation: "delete",
          serverUpdatedAt: timestamp,
          payload: null,
        },
      ],
    });

    expect(
      database.native
        .prepare("SELECT server_revision, sync_state, deleted_at FROM financial_goals WHERE id = 'goal-1'")
        .get(),
    ).toEqual({ server_revision: 2, sync_state: "synced", deleted_at: timestamp });
  });
  it("applies a debt upsert and deletion tombstone", async () => {
    const repository = new LocalSyncRepository(database as unknown as SQLiteDatabase);
    await repository.applyPullPage(null, bootstrapPage);

    await repository.applyPullPage("v1.3", {
      protocolVersion: 1,
      nextCursor: "v1.4",
      hasMore: false,
      changes: [
        {
          entityType: "debt",
          entityId: "debt-1",
          revision: 1,
          operation: "upsert",
          serverUpdatedAt: timestamp,
          payload: {
            id: "debt-1",
            name: "Car Loan",
            type: "auto_loan",
            balanceMinor: 500_000,
            aprBasisPoints: 850,
            minimumPaymentMinor: 12_000,
            balanceAsOf: "2026-08-14",
            status: "active",
            revision: 1,
            updatedAt: timestamp,
          },
        },
      ],
    });

    expect(
      database.native
        .prepare(
          "SELECT name, type, balance_minor, apr_basis_points, minimum_payment_minor, balance_as_of, status, server_revision, sync_state FROM debts",
        )
        .get(),
    ).toEqual({
      name: "Car Loan",
      type: "auto_loan",
      balance_minor: 500_000,
      apr_basis_points: 850,
      minimum_payment_minor: 12_000,
      balance_as_of: "2026-08-14",
      status: "active",
      server_revision: 1,
      sync_state: "synced",
    });

    await repository.applyPullPage("v1.4", {
      protocolVersion: 1,
      nextCursor: "v1.5",
      hasMore: false,
      changes: [
        {
          entityType: "debt",
          entityId: "debt-1",
          revision: 2,
          operation: "delete",
          serverUpdatedAt: timestamp,
          payload: null,
        },
      ],
    });

    expect(
      database.native
        .prepare("SELECT server_revision, sync_state, deleted_at FROM debts WHERE id = 'debt-1'")
        .get(),
    ).toEqual({ server_revision: 2, sync_state: "synced", deleted_at: timestamp });
  });


  it("records a server acknowledgement only for the currently committed cursor", async () => {
    const repository = new LocalSyncRepository(database as unknown as SQLiteDatabase);
    await repository.applyPullPage(null, bootstrapPage);
    await repository.recordAcknowledgement("v1.3", "v1.1");
    expect(
      database.native
        .prepare(
          `SELECT server_cursor, server_acknowledged_cursor, retention_floor_cursor
           FROM sync_metadata`,
        )
        .get(),
    ).toEqual({
      server_cursor: "v1.3",
      server_acknowledged_cursor: "v1.3",
      retention_floor_cursor: "v1.1",
    });

    await expect(repository.recordAcknowledgement("v1.2", "v1.1")).rejects.toMatchObject({
      code: "cursor_mismatch",
    });
  });

  it("rolls back every row and the cursor when a dependency is invalid", async () => {
    const page: MobileSyncPullResponse = {
      ...bootstrapPage,
      nextCursor: "v1.2",
      changes: [bootstrapPage.changes[0]!, bootstrapPage.changes[2]!],
    };
    const repository = new LocalSyncRepository(database as unknown as SQLiteDatabase);

    await expect(repository.applyPullPage(null, page)).rejects.toThrow();
    await expect(repository.getCursor()).resolves.toBeNull();
    expect(database.native.prepare("SELECT count(*) AS count FROM accounts").get()).toEqual({
      count: 0,
    });
  });

  it("retains a tombstone when the deleted row was never present locally", async () => {
    const repository = new LocalSyncRepository(database as unknown as SQLiteDatabase);
    await repository.applyPullPage(null, {
      protocolVersion: 1,
      nextCursor: "v1.1",
      hasMore: false,
      changes: [
        {
          entityType: "transaction",
          entityId: "missing-transaction",
          revision: 4,
          operation: "delete",
          serverUpdatedAt: timestamp,
          payload: null,
        },
      ],
    });

    expect(database.native.prepare("SELECT * FROM sync_tombstones").get()).toMatchObject({
      entity_type: "transaction",
      entity_id: "missing-transaction",
      server_revision: 4,
    });
  });

  it("does not advance past pending local work", async () => {
    const repository = new LocalSyncRepository(database as unknown as SQLiteDatabase);
    await repository.applyPullPage(null, {
      ...bootstrapPage,
      nextCursor: "v1.1",
      changes: [bootstrapPage.changes[0]!],
    });
    database.native
      .prepare("UPDATE accounts SET sync_state = 'pending' WHERE id = ?")
      .run("account-1");

    await expect(
      repository.applyPullPage("v1.1", {
        protocolVersion: 1,
        nextCursor: "v1.2",
        hasMore: false,
        changes: [
          {
            ...bootstrapPage.changes[0]!,
            revision: 2,
            serverUpdatedAt: "2026-08-13 15:00:00",
            payload: {
              ...bootstrapPage.changes[0]!.payload!,
              name: "Server wallet",
              revision: 2,
              updatedAt: "2026-08-13 15:00:00",
            },
          },
        ],
      }),
    ).rejects.toMatchObject({ code: "local_conflict" });
    await expect(repository.getCursor()).resolves.toBe("v1.1");
    expect(database.native.prepare("SELECT name, sync_state FROM accounts").get()).toEqual({
      name: "Wallet",
      sync_state: "pending",
    });
  });

  it("advances past the server version already preserved in an unresolved conflict", async () => {
    const repository = new LocalSyncRepository(database as unknown as SQLiteDatabase);
    await repository.applyPullPage(null, bootstrapPage);
    database.native.exec(`
      INSERT INTO sync_outbox (
        operation_id, idempotency_key, entity_type, entity_id, operation_type,
        base_revision, payload_json, dependency_ids_json, base_json, state, created_sequence
      ) VALUES (
        '00000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-000000000002',
        'transaction', 'transaction-1', 'update', 1, '{}', '[]', '{}', 'conflicted', 1
      );
      INSERT INTO sync_conflicts (
        conflict_id, entity_type, entity_id, operation_id, base_json, local_json,
        server_json, server_revision, created_at
      ) VALUES (
        '00000000-0000-4000-8000-000000000003', 'transaction', 'transaction-1',
        '00000000-0000-4000-8000-000000000001', '{}', '{}', '{}', 2,
        '2026-08-13T15:00:00.000Z'
      );
      UPDATE transactions SET description = 'My edit', sync_state = 'conflicted'
      WHERE id = 'transaction-1';
    `);

    await repository.applyPullPage("v1.3", {
      protocolVersion: 1,
      nextCursor: "v1.4",
      hasMore: false,
      changes: [
        {
          ...bootstrapPage.changes[2]!,
          revision: 2,
          serverUpdatedAt: "2026-08-13 15:00:00",
          payload: {
            ...bootstrapPage.changes[2]!.payload!,
            description: "Web edit",
            revision: 2,
            updatedAt: "2026-08-13 15:00:00",
          },
        },
      ],
    });

    await expect(repository.getCursor()).resolves.toBe("v1.4");
    expect(
      database.native
        .prepare("SELECT description, sync_state FROM transactions WHERE id = ?")
        .get("transaction-1"),
    ).toEqual({ description: "My edit", sync_state: "conflicted" });
  });

  it("rejects stale page application after another page advances the cursor", async () => {
    const repository = new LocalSyncRepository(database as unknown as SQLiteDatabase);
    await repository.applyPullPage(null, bootstrapPage);
    await expect(repository.applyPullPage(null, bootstrapPage)).rejects.toMatchObject({
      code: "cursor_mismatch",
    });
  });
});
