/// <reference types="node" />

import { DatabaseSync } from "node:sqlite";

import {
  applyLocalMigrations,
  LOCAL_SCHEMA_VERSION,
  migrations,
  type MigrationDatabase,
} from "./migrations";

function nativeMigrationDatabase(native: DatabaseSync): MigrationDatabase {
  return {
    getFirstAsync: async (source) =>
      (native.prepare(source).get() as { user_version: number } | undefined) ?? null,
    execAsync: async (source) => native.exec(source),
    withTransactionAsync: async (task) => {
      native.exec("BEGIN IMMEDIATE");
      try {
        await task({ execAsync: async (source) => native.exec(source) });
        native.exec("COMMIT");
      } catch (error) {
        native.exec("ROLLBACK");
        throw error;
      }
    },
  };
}

describe("local SQLCipher migrations", () => {
  it("applies pending migrations transactionally and advances the version last", async () => {
    const statements: string[] = [];
    const database = {
      getFirstAsync: jest.fn(() => Promise.resolve({ user_version: 0 })),
      execAsync: jest.fn(() => Promise.resolve()),
      withTransactionAsync: jest.fn(
        async (
          task: (transaction: { execAsync(source: string): Promise<void> }) => Promise<void>,
        ) => {
          await task({
            execAsync: (source) => {
              statements.push(source);
              return Promise.resolve();
            },
          });
        },
      ),
    };

    await expect(applyLocalMigrations(database)).resolves.toBe(LOCAL_SCHEMA_VERSION);
    expect(statements.some((statement) => statement.includes("CREATE TABLE sync_outbox"))).toBe(
      true,
    );
    expect(statements.some((statement) => statement.includes("CREATE TABLE sync_tombstones"))).toBe(
      true,
    );
    expect(statements.some((statement) => statement.includes("sync_outbox_entity_unique"))).toBe(
      true,
    );
    expect(statements.some((statement) => statement.includes("CREATE TABLE budgets"))).toBe(true);
    expect(
      statements.some((statement) => statement.includes("budgets_month_category_unique")),
    ).toBe(true);
    expect(statements.some((statement) => statement.includes("CREATE TABLE financial_goals"))).toBe(
      true,
    );
    expect(statements.some((statement) => statement.includes("financial_goals_status_idx"))).toBe(
      true,
    );
    expect(statements.some((statement) => statement.includes("CREATE TABLE debts"))).toBe(true);
    expect(statements.some((statement) => statement.includes("debts_status_idx"))).toBe(true);
    expect(statements.some((statement) => statement.includes("CREATE TABLE subscriptions"))).toBe(
      true,
    );
    expect(statements.some((statement) => statement.includes("CREATE TABLE calendar_events"))).toBe(
      true,
    );
    expect(statements.some((statement) => statement.includes("subscriptions_status_idx"))).toBe(
      true,
    );
    expect(statements.some((statement) => statement.includes("'subscription'"))).toBe(true);
    expect(statements.some((statement) => statement.includes("'event'"))).toBe(true);
    expect(statements.some((statement) => statement.includes("ADD COLUMN icon_emoji"))).toBe(true);
    expect(statements.some((statement) => statement.includes("server_acknowledged_cursor"))).toBe(
      true,
    );
    expect(statements.at(-2)).toBe(`PRAGMA user_version = ${LOCAL_SCHEMA_VERSION}`);
    expect(statements.at(-1)).toContain(`migration:${LOCAL_SCHEMA_VERSION}`);
  });

  it("does not mutate a current workspace", async () => {
    const database = {
      getFirstAsync: jest.fn(() => Promise.resolve({ user_version: LOCAL_SCHEMA_VERSION })),
      execAsync: jest.fn(),
      withTransactionAsync: jest.fn(),
    };
    await expect(applyLocalMigrations(database)).resolves.toBe(LOCAL_SCHEMA_VERSION);
    expect(database.withTransactionAsync).not.toHaveBeenCalled();
  });

  it("fails closed for a database from a newer application", async () => {
    const database = {
      getFirstAsync: jest.fn(() => Promise.resolve({ user_version: LOCAL_SCHEMA_VERSION + 1 })),
      execAsync: jest.fn(),
      withTransactionAsync: jest.fn(),
    };
    await expect(applyLocalMigrations(database)).rejects.toThrow("newer Zoption version");
    expect(database.withTransactionAsync).not.toHaveBeenCalled();
  });

  it("propagates migration failure without advancing outside the transaction", async () => {
    const database = {
      getFirstAsync: jest.fn(() => Promise.resolve({ user_version: 0 })),
      execAsync: jest.fn(),
      withTransactionAsync: jest.fn(
        async (
          task: (transaction: { execAsync(source: string): Promise<void> }) => Promise<void>,
        ) => {
          await task({ execAsync: () => Promise.reject(new Error("disk full")) });
        },
      ),
    };
    await expect(applyLocalMigrations(database)).rejects.toThrow("disk full");
  });

  it("widens account types while transactions keep referencing their accounts", async () => {
    const native = new DatabaseSync(":memory:");
    native.exec("PRAGMA foreign_keys = ON");
    for (const migration of migrations.filter((entry) => entry.version <= 13)) {
      native.exec(migration.sql);
    }
    native.exec("PRAGMA user_version = 13");
    native.exec(`
      INSERT INTO accounts (id, name, type, currency) VALUES ('a1', 'Wallet', 'cash', 'PHP');
      INSERT INTO categories (id, name, kind, color, origin, required_plan)
        VALUES ('c1', 'Food', 'expense', '#000000', 'starter', 'free');
      INSERT INTO transactions (id, account_id, category_id, date, description, amount_minor, currency, kind)
        VALUES ('t1', 'a1', 'c1', '2026-10-01', 'Lunch', -15000, 'PHP', 'expense');
    `);

    await expect(applyLocalMigrations(nativeMigrationDatabase(native))).resolves.toBe(
      LOCAL_SCHEMA_VERSION,
    );

    native.exec(
      "INSERT INTO accounts (id, name, type, currency) VALUES ('a2', 'Loan', 'payable', 'PHP')",
    );
    expect(native.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    expect(native.prepare("PRAGMA foreign_keys").get()).toEqual({ foreign_keys: 1 });
    expect(() =>
      native.exec(`INSERT INTO transactions (id, account_id, category_id, date, description, amount_minor, currency, kind)
        VALUES ('t2', 'missing', 'c1', '2026-10-01', 'x', -1, 'PHP', 'expense')`),
    ).toThrow("FOREIGN KEY");
  });
});
