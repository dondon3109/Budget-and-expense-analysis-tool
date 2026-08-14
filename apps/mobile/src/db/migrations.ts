import type { SQLiteDatabase } from "expo-sqlite";

export interface MigrationTransaction {
  execAsync(source: string): Promise<void>;
}

export interface MigrationDatabase {
  getFirstAsync(source: string): Promise<{ user_version: number } | null>;
  withTransactionAsync(task: (transaction: MigrationTransaction) => Promise<void>): Promise<void>;
}

interface Migration {
  version: number;
  name: string;
  sql: string;
}

export const LOCAL_SCHEMA_VERSION = 5;

export const migrations: readonly Migration[] = [
  {
    version: 1,
    name: "local_sync_foundation",
    sql: `
      CREATE TABLE workspace_metadata (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      );

      CREATE TABLE accounts (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('cash', 'checking', 'savings', 'credit', 'other')),
        currency TEXT NOT NULL CHECK (currency IN ('PHP', 'USD')),
        balance_minor INTEGER,
        balance_as_of TEXT,
        archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
        system INTEGER NOT NULL DEFAULT 0 CHECK (system IN (0, 1)),
        interest_json TEXT,
        server_revision INTEGER NOT NULL DEFAULT 0 CHECK (server_revision >= 0),
        server_updated_at TEXT,
        deleted_at TEXT,
        sync_state TEXT NOT NULL DEFAULT 'synced' CHECK (sync_state IN ('synced', 'pending', 'failed', 'conflicted'))
      );

      CREATE TABLE categories (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('income', 'expense', 'transfer')),
        color TEXT NOT NULL,
        archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
        system INTEGER NOT NULL DEFAULT 0 CHECK (system IN (0, 1)),
        origin TEXT NOT NULL CHECK (origin IN ('starter', 'custom', 'system')),
        required_plan TEXT NOT NULL CHECK (required_plan IN ('free', 'zoption_pro')),
        locked INTEGER NOT NULL DEFAULT 0 CHECK (locked IN (0, 1)),
        server_revision INTEGER NOT NULL DEFAULT 0 CHECK (server_revision >= 0),
        server_updated_at TEXT,
        deleted_at TEXT,
        sync_state TEXT NOT NULL DEFAULT 'synced' CHECK (sync_state IN ('synced', 'pending', 'failed', 'conflicted'))
      );

      CREATE TABLE transactions (
        id TEXT PRIMARY KEY NOT NULL,
        account_id TEXT REFERENCES accounts(id),
        category_id TEXT NOT NULL REFERENCES categories(id),
        date TEXT NOT NULL,
        description TEXT NOT NULL,
        amount_minor INTEGER NOT NULL,
        currency TEXT NOT NULL CHECK (currency IN ('PHP', 'USD')),
        kind TEXT NOT NULL CHECK (kind IN ('income', 'expense', 'transfer')),
        notes TEXT,
        transfer_group_id TEXT,
        from_account_id TEXT REFERENCES accounts(id),
        to_account_id TEXT REFERENCES accounts(id),
        transfer_fee_minor INTEGER CHECK (transfer_fee_minor IS NULL OR transfer_fee_minor >= 0),
        import_fingerprint TEXT,
        server_revision INTEGER NOT NULL DEFAULT 0 CHECK (server_revision >= 0),
        server_updated_at TEXT,
        deleted_at TEXT,
        sync_state TEXT NOT NULL DEFAULT 'synced' CHECK (sync_state IN ('synced', 'pending', 'failed', 'conflicted'))
      );

      CREATE INDEX transactions_date_idx ON transactions(date DESC, id);
      CREATE INDEX transactions_category_idx ON transactions(category_id, date DESC);
      CREATE INDEX transactions_account_idx ON transactions(account_id, date DESC);
      CREATE UNIQUE INDEX transactions_import_fingerprint_unique
        ON transactions(import_fingerprint)
        WHERE import_fingerprint IS NOT NULL;

      CREATE TABLE sync_outbox (
        operation_id TEXT PRIMARY KEY NOT NULL,
        idempotency_key TEXT NOT NULL UNIQUE,
        entity_type TEXT NOT NULL CHECK (entity_type IN ('account', 'category', 'transaction', 'transfer')),
        entity_id TEXT NOT NULL,
        operation_type TEXT NOT NULL CHECK (operation_type IN ('create', 'update', 'delete')),
        base_revision INTEGER CHECK (base_revision IS NULL OR base_revision >= 0),
        payload_json TEXT NOT NULL,
        dependency_ids_json TEXT NOT NULL DEFAULT '[]',
        state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'sending', 'retryable', 'failed', 'conflicted')),
        attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
        next_attempt_at TEXT,
        last_error_code TEXT,
        created_sequence INTEGER NOT NULL UNIQUE
      );

      CREATE INDEX sync_outbox_ready_idx
        ON sync_outbox(state, next_attempt_at, created_sequence);

      CREATE TABLE sync_conflicts (
        conflict_id TEXT PRIMARY KEY NOT NULL,
        entity_type TEXT NOT NULL CHECK (entity_type IN ('account', 'category', 'transaction', 'transfer')),
        entity_id TEXT NOT NULL,
        operation_id TEXT REFERENCES sync_outbox(operation_id),
        base_json TEXT NOT NULL,
        local_json TEXT NOT NULL,
        server_json TEXT NOT NULL,
        server_revision INTEGER NOT NULL CHECK (server_revision >= 0),
        created_at TEXT NOT NULL,
        resolved_at TEXT,
        resolution TEXT CHECK (resolution IS NULL OR resolution IN ('keep_local', 'keep_server', 'merged'))
      );

      CREATE TABLE sync_metadata (
        singleton INTEGER PRIMARY KEY NOT NULL DEFAULT 1 CHECK (singleton = 1),
        server_cursor TEXT,
        last_successful_sync_at TEXT,
        consecutive_failures INTEGER NOT NULL DEFAULT 0 CHECK (consecutive_failures >= 0)
      );

      INSERT INTO sync_metadata (singleton) VALUES (1);
    `,
  },
  {
    version: 2,
    name: "pull_application_safety",
    sql: `
      ALTER TABLE sync_outbox ADD COLUMN base_json TEXT NOT NULL DEFAULT '{}';

      CREATE TABLE sync_tombstones (
        entity_type TEXT NOT NULL CHECK (entity_type IN ('account', 'category', 'transaction')),
        entity_id TEXT NOT NULL,
        server_revision INTEGER NOT NULL CHECK (server_revision > 0),
        server_updated_at TEXT NOT NULL,
        PRIMARY KEY (entity_type, entity_id)
      );

      CREATE INDEX sync_tombstones_revision_idx
        ON sync_tombstones(entity_type, server_revision);
    `,
  },
  {
    version: 3,
    name: "single_entity_outbox_operation",
    sql: `
      CREATE UNIQUE INDEX sync_outbox_entity_unique
        ON sync_outbox(entity_type, entity_id);
    `,
  },
  {
    version: 4,
    name: "sync_cursor_acknowledgements",
    sql: `
      ALTER TABLE sync_metadata ADD COLUMN server_acknowledged_cursor TEXT;
      ALTER TABLE sync_metadata ADD COLUMN retention_floor_cursor TEXT;
    `,
  },
  {
    version: 5,
    name: "monthly_budgets",
    sql: `
      CREATE TABLE budgets (
        id TEXT PRIMARY KEY NOT NULL,
        category_id TEXT NOT NULL REFERENCES categories(id),
        month TEXT NOT NULL,
        limit_minor INTEGER NOT NULL CHECK (limit_minor >= 0),
        server_revision INTEGER NOT NULL DEFAULT 0 CHECK (server_revision >= 0),
        server_updated_at TEXT,
        deleted_at TEXT,
        sync_state TEXT NOT NULL DEFAULT 'synced' CHECK (sync_state IN ('synced', 'pending', 'failed', 'conflicted'))
      );

      CREATE UNIQUE INDEX budgets_month_category_unique ON budgets(month, category_id);
    `,
  },
] as const;

export async function applyLocalMigrations(database: MigrationDatabase): Promise<number> {
  const current = await database.getFirstAsync("PRAGMA user_version");
  const currentVersion = current?.user_version ?? 0;
  if (currentVersion > LOCAL_SCHEMA_VERSION) {
    throw new Error("This local workspace was created by a newer Zoption version.");
  }

  for (const migration of migrations) {
    if (migration.version <= currentVersion) continue;
    await database.withTransactionAsync(async (transaction) => {
      await transaction.execAsync(migration.sql);
      await transaction.execAsync(`PRAGMA user_version = ${migration.version}`);
      await transaction.execAsync(
        `INSERT INTO workspace_metadata (key, value) VALUES ('migration:${migration.version}', '${migration.name}')`,
      );
    });
  }
  return LOCAL_SCHEMA_VERSION;
}

export function asMigrationDatabase(database: SQLiteDatabase): MigrationDatabase {
  return {
    getFirstAsync: (source) => database.getFirstAsync<{ user_version: number }>(source),
    // Expo's exclusive helper uses a separate native connection. A regular
    // transaction stays on this already-keyed SQLCipher connection; startup is
    // serialized and the database is not exposed until migrations finish.
    withTransactionAsync: (task) => database.withTransactionAsync(() => task(database)),
  };
}
