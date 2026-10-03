/// <reference types="node" />

import { DatabaseSync, type SQLInputValue } from "node:sqlite";

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
      INSERT INTO accounts (id, name, type, currency, archived, system, server_revision, sync_state)
      VALUES
        ('account-1', 'Wallet', 'cash', 'PHP', 0, 0, 1, 'synced'),
        ('account-savings', 'Savings', 'savings', 'PHP', 0, 0, 1, 'synced'),
        ('account-loan', 'Loan', 'payable', 'PHP', 0, 0, 1, 'synced');
      INSERT INTO categories (
        id, name, kind, color, archived, system, origin, required_plan, locked,
        server_revision, sync_state
      ) VALUES
        ('tenant-1:category:debt-payment', 'Debt payment', 'expense', '#e34948', 0, 1, 'system',
          'free', 0, 1, 'synced'),
        ('category-transfer', 'Transfer', 'transfer', '#008877', 0, 1, 'system', 'free', 0,
          1, 'synced');
      INSERT INTO debts (
        id, name, type, balance_minor, apr_basis_points, minimum_payment_minor, balance_as_of,
        status, server_revision, sync_state
      ) VALUES
        ('debt-synced', 'Car loan', 'auto_loan', 500000, 0, 0, '2026-08-01', 'active', 1, 'synced'),
        ('debt-new', 'New loan', 'other', 100000, 0, 0, '2026-08-01', 'active', 0, 'pending');
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
}

function repository(database: TestDatabase) {
  return new LocalTransactionMutationRepository(
    database as unknown as SQLiteDatabase,
    new LocalDatabaseWriter(),
    () => crypto.randomUUID(),
    () => new Date("2026-08-13T16:00:00.000Z"),
    () => 0.5,
  );
}

const payment = {
  kind: "expense" as const,
  accountId: "account-1",
  categoryId: "tenant-1:category:debt-payment",
  date: "2026-08-13",
  description: "Car loan",
  amountMinor: 20_000,
  currency: "PHP" as const,
};

const transfer = {
  kind: "transfer" as const,
  fromAccountId: "account-1",
  toAccountId: "account-loan",
  categoryId: "category-transfer",
  date: "2026-08-13",
  description: "Loan payment",
  amountMinor: 20_000,
  currency: "PHP" as const,
};

function outboxPayload(database: TestDatabase, entityType: string): unknown {
  const row = database.native
    .prepare("SELECT payload_json AS payload FROM sync_outbox WHERE entity_type = ?")
    .get(entityType) as { payload: string };
  return JSON.parse(row.payload);
}

describe("local debt links", () => {
  it("records an expense's debt on the row and in the pushed payload", async () => {
    const database = new TestDatabase();
    const id = await repository(database).createTransaction({ ...payment, debtId: "debt-synced" });

    expect(
      database.native.prepare("SELECT debt_id FROM transactions WHERE id = ?").get(id),
    ).toEqual({ debt_id: "debt-synced" });
    expect(outboxPayload(database, "transaction")).toMatchObject({ debtId: "debt-synced" });
  });

  it("waits for a debt to reach the server before linking a payment to it", async () => {
    const database = new TestDatabase();

    await expect(
      repository(database).createTransaction({ ...payment, debtId: "debt-new" }),
    ).rejects.toMatchObject({ code: "invalid_reference" });
    expect(database.native.prepare("SELECT count(*) AS count FROM transactions").get()).toEqual({
      count: 0,
    });
  });

  it("links a transfer into a liability account on its sending leg", async () => {
    const database = new TestDatabase();
    await repository(database).createTransaction({ ...transfer, debtId: "debt-synced" });

    expect(
      database.native
        .prepare("SELECT account_id, debt_id FROM transactions ORDER BY amount_minor")
        .all(),
    ).toEqual([
      { account_id: "account-1", debt_id: "debt-synced" },
      { account_id: "account-loan", debt_id: null },
    ]);
    expect(outboxPayload(database, "transfer")).toMatchObject({
      transfer: { debtId: "debt-synced" },
    });
  });

  it("refuses a debt link on a transfer into an account that is not a liability", async () => {
    const database = new TestDatabase();

    await expect(
      repository(database).createTransaction({
        ...transfer,
        toAccountId: "account-savings",
        debtId: "debt-synced",
      }),
    ).rejects.toMatchObject({ code: "invalid_reference" });
  });
});
