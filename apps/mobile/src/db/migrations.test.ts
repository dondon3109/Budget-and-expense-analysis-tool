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
  it("applies the baseline schema in a single transaction on a fresh database", async () => {
    const statements: string[] = [];
    const database = {
      getFirstAsync: jest.fn(() => Promise.resolve({ user_version: 0 })),
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
    expect(database.withTransactionAsync).toHaveBeenCalledTimes(1);
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
      statements.some((statement) => statement.includes("budgets_period_category_unique")),
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
    expect(statements.some((statement) => statement.includes("icon_emoji"))).toBe(true);
    expect(statements.some((statement) => statement.includes("server_acknowledged_cursor"))).toBe(
      true,
    );
    expect(
      statements.some((statement) => statement.includes("transactions_transfer_group_idx")),
    ).toBe(true);
    expect(
      statements.some((statement) => statement.includes("transactions_account_balance_idx")),
    ).toBe(true);
    expect(statements.at(-2)).toBe(`PRAGMA user_version = ${LOCAL_SCHEMA_VERSION}`);
    expect(statements.at(-1)).toContain(`migration:${LOCAL_SCHEMA_VERSION}`);
  });

  it("applies only pending incremental migrations when upgrading an existing database", async () => {
    const statements: string[] = [];
    const database = {
      getFirstAsync: jest.fn(() => Promise.resolve({ user_version: 1 })),
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
    expect(database.withTransactionAsync).toHaveBeenCalledTimes(LOCAL_SCHEMA_VERSION - 1);
    expect(
      statements.some((statement) => statement.includes("budgets_month_category_unique")),
    ).toBe(true);
    expect(statements.some((statement) => statement.includes("ADD COLUMN icon_emoji"))).toBe(true);
    expect(statements.at(-2)).toBe(`PRAGMA user_version = ${LOCAL_SCHEMA_VERSION}`);
    expect(statements.at(-1)).toContain(`migration:${LOCAL_SCHEMA_VERSION}`);
  });

  it("does not mutate a current workspace", async () => {
    const database = {
      getFirstAsync: jest.fn(() => Promise.resolve({ user_version: LOCAL_SCHEMA_VERSION })),
      withTransactionAsync: jest.fn(),
    };
    await expect(applyLocalMigrations(database)).resolves.toBe(LOCAL_SCHEMA_VERSION);
    expect(database.withTransactionAsync).not.toHaveBeenCalled();
  });

  it("fails closed for a database from a newer application", async () => {
    const database = {
      getFirstAsync: jest.fn(() => Promise.resolve({ user_version: LOCAL_SCHEMA_VERSION + 1 })),
      withTransactionAsync: jest.fn(),
    };
    await expect(applyLocalMigrations(database)).rejects.toThrow("newer Zoption version");
    expect(database.withTransactionAsync).not.toHaveBeenCalled();
  });

  it("propagates migration failure without advancing outside the transaction", async () => {
    const database = {
      getFirstAsync: jest.fn(() => Promise.resolve({ user_version: 0 })),
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

  it("widens account types and adds debt links while transactions keep their accounts", async () => {
    const native = new DatabaseSync(":memory:");
    native.exec("PRAGMA foreign_keys = ON");
    for (const migration of migrations.filter((entry) => entry.version <= 14)) {
      native.exec(migration.sql);
    }
    native.exec("PRAGMA user_version = 14");
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
    expect(native.prepare("SELECT account_id, debt_id FROM transactions").get()).toEqual({
      account_id: "a1",
      debt_id: null,
    });
    expect(native.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    expect(() =>
      native.exec(`INSERT INTO transactions (id, account_id, category_id, date, description, amount_minor, currency, kind)
        VALUES ('t2', 'missing', 'c1', '2026-10-01', 'x', -1, 'PHP', 'expense')`),
    ).toThrow("FOREIGN KEY");
  });

  it("produces the exact same schema from the v20 baseline as running migrations 1..20 incrementally", async () => {
    const incremental = new DatabaseSync(":memory:");
    incremental.exec("PRAGMA foreign_keys = ON");
    for (const migration of migrations) {
      incremental.exec(migration.sql);
      incremental.exec(`PRAGMA user_version = ${migration.version}`);
      incremental.exec(
        `INSERT INTO workspace_metadata (key, value) VALUES ('migration:${migration.version}', '${migration.name}')`,
      );
    }

    const fresh = new DatabaseSync(":memory:");
    fresh.exec("PRAGMA foreign_keys = ON");
    await expect(applyLocalMigrations(nativeMigrationDatabase(fresh))).resolves.toBe(
      LOCAL_SCHEMA_VERSION,
    );

    const inspectSchema = (db: DatabaseSync) => {
      const userVersion = (db.prepare("PRAGMA user_version").get() as { user_version: number })
        .user_version;
      const tables = (
        db
          .prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
          )
          .all() as { name: string }[]
      ).map((row) => row.name);
      const indexes = (
        db
          .prepare(
            "SELECT name, tbl_name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_autoindex_%' ORDER BY name",
          )
          .all() as { name: string; tbl_name: string }[]
      ).map((row) => ({
        ...row,
        columns: db.prepare(`PRAGMA index_info("${row.name}")`).all(),
      }));
      const tableDetails = Object.fromEntries(
        tables.map((table) => [
          table,
          {
            columns: db.prepare(`PRAGMA table_info("${table}")`).all(),
            foreignKeys: db.prepare(`PRAGMA foreign_key_list("${table}")`).all(),
            indexList: (
              db.prepare(`PRAGMA index_list("${table}")`).all() as {
                name: string;
                unique: number;
                origin: string;
                partial: number;
              }[]
            )
              .map((idx) => ({
                unique: idx.unique,
                origin: idx.origin,
                partial: idx.partial,
                columns: (
                  db.prepare(`PRAGMA index_info("${idx.name}")`).all() as {
                    seqno: number;
                    name: string | null;
                  }[]
                ).map((c) => ({ seqno: c.seqno, name: c.name })),
              }))
              .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
          },
        ]),
      );
      const syncMetadata = db.prepare("SELECT * FROM sync_metadata").all();
      return { userVersion, tables, indexes, tableDetails, syncMetadata };
    };

    expect(inspectSchema(fresh)).toEqual(inspectSchema(incremental));
    expect(
      fresh
        .prepare("SELECT value FROM workspace_metadata WHERE key = ?")
        .get(`migration:${LOCAL_SCHEMA_VERSION}`),
    ).toBeDefined();

    incremental.close();
    fresh.close();
  });
});
