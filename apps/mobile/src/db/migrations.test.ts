import { applyLocalMigrations, LOCAL_SCHEMA_VERSION } from "./migrations";

describe("local SQLCipher migrations", () => {
  it("applies pending migrations transactionally and advances the version last", async () => {
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
    expect(statements.some((statement) => statement.includes("CREATE TABLE sync_outbox"))).toBe(
      true,
    );
    expect(statements.some((statement) => statement.includes("CREATE TABLE sync_tombstones"))).toBe(
      true,
    );
    expect(statements.some((statement) => statement.includes("sync_outbox_entity_unique"))).toBe(
      true,
    );
    expect(statements.some((statement) => statement.includes("server_acknowledged_cursor"))).toBe(
      true,
    );
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
});
