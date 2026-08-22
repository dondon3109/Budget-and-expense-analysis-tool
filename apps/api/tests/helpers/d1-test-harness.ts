import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync, type SQLInputValue, type StatementSync } from "node:sqlite";

const migrationsDirectory = new URL("../../../../db/migrations/", import.meta.url);

type BatchHook = () => void;

export interface D1MigrationContext {
  database: DatabaseSync;
  name: string;
}

export interface D1TestDatabaseOptions {
  beforeBatch?: BatchHook;
  beforeMigration?: (context: D1MigrationContext) => void;
  afterMigration?: (context: D1MigrationContext) => void;
}

function resultMeta(changes = 0, lastRowId = 0): D1Meta & Record<string, unknown> {
  return {
    duration: 0,
    size_after: 0,
    rows_read: 0,
    rows_written: changes,
    last_row_id: lastRowId,
    changed_db: changes > 0,
    changes,
  };
}

function successfulResult<T>(results: T[], changes = 0, lastRowId = 0): D1Result<T> {
  return { success: true, results, meta: resultMeta(changes, lastRowId) };
}

/**
 * Node SQLite implementation of the D1 prepared-statement surface used by repository tests.
 * Runtime-specific behavior is covered separately through the Workers Vitest integration layer.
 */
class SqliteD1PreparedStatement implements D1PreparedStatement {
  private bindings: SQLInputValue[] = [];

  constructor(
    private readonly statement: StatementSync,
    private readonly query: string,
  ) {}

  bind(...values: unknown[]): D1PreparedStatement {
    this.bindings = values as SQLInputValue[];
    return this;
  }

  first<T = unknown>(columnName?: string): Promise<T | null> {
    const row = this.statement.get(...this.bindings) as Record<string, unknown> | undefined;
    if (!row) return Promise.resolve(null);
    if (columnName !== undefined) {
      return Promise.resolve((row[columnName] as T | undefined) ?? null);
    }
    return Promise.resolve(row as T);
  }

  run<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    const result = this.execute();
    return Promise.resolve(successfulResult<T>([], result.changes, result.lastRowId));
  }

  all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    return Promise.resolve(successfulResult(this.statement.all(...this.bindings) as T[]));
  }

  raw<T = unknown[]>(options: { columnNames: true }): Promise<[string[], ...T[]]>;
  raw<T = unknown[]>(options?: { columnNames?: false }): Promise<T[]>;
  raw<T = unknown[]>(options?: { columnNames?: boolean }): Promise<T[] | [string[], ...T[]]> {
    const rows = this.statement.all(...this.bindings) as Record<string, unknown>[];
    const values = rows.map((row) => Object.values(row) as T);
    if (options?.columnNames) {
      const names = this.statement.columns().map((column) => column.name);
      return Promise.resolve([names, ...values]);
    }
    return Promise.resolve(values);
  }

  execute(): { changes: number; lastRowId: number } {
    const result = this.statement.run(...this.bindings);
    return { changes: Number(result.changes), lastRowId: Number(result.lastInsertRowid) };
  }

  sql(): string {
    return this.query;
  }
}

class SqliteD1Session implements D1DatabaseSession {
  constructor(private readonly binding: SqliteD1Database) {}

  prepare(query: string): D1PreparedStatement {
    return this.binding.prepare(query);
  }

  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
    return this.binding.batch<T>(statements);
  }

  getBookmark(): string | null {
    return null;
  }
}

export class SqliteD1Database implements D1Database {
  constructor(
    readonly database: DatabaseSync,
    private readonly beforeBatch?: BatchHook,
  ) {}

  prepare(query: string): D1PreparedStatement {
    return new SqliteD1PreparedStatement(this.database.prepare(query), query);
  }

  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
    this.beforeBatch?.();
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const results = statements.map((statement) => {
        if (!(statement instanceof SqliteD1PreparedStatement)) {
          throw new Error("The SQLite D1 test binding received a statement from another database.");
        }
        const result = statement.execute();
        return successfulResult<T>([], result.changes, result.lastRowId);
      });
      this.database.exec("COMMIT");
      return Promise.resolve(results);
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  exec(query: string): Promise<D1ExecResult> {
    this.database.exec(query);
    return Promise.resolve({ count: 1, duration: 0 });
  }

  withSession(): D1DatabaseSession {
    return new SqliteD1Session(this);
  }

  dump(): Promise<ArrayBuffer> {
    return Promise.reject(
      new Error("The deprecated D1 dump API is not supported by the SQLite test binding."),
    );
  }
}

export function applyD1Migrations(
  database: DatabaseSync,
  options: Pick<D1TestDatabaseOptions, "beforeMigration" | "afterMigration"> = {},
): void {
  const names = readdirSync(migrationsDirectory)
    .filter((name) => name.endsWith(".sql"))
    .sort();

  for (const name of names) {
    const context = { database, name };
    options.beforeMigration?.(context);
    const sql = readFileSync(new URL(name, migrationsDirectory), "utf8").replaceAll(
      "--> statement-breakpoint",
      "",
    );
    database.exec(sql);
    options.afterMigration?.(context);
  }
}

export function createD1TestDatabase(options: D1TestDatabaseOptions = {}): {
  binding: SqliteD1Database;
  database: DatabaseSync;
} {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON");
  try {
    applyD1Migrations(database, options);
  } catch (error) {
    database.close();
    throw error;
  }
  return { binding: new SqliteD1Database(database, options.beforeBatch), database };
}

export function d1FromSqlite(database: DatabaseSync, beforeBatch?: BatchHook): D1Database {
  return new SqliteD1Database(database, beforeBatch);
}
