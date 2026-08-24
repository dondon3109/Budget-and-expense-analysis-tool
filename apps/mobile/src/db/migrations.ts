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

export const LOCAL_SCHEMA_VERSION = 11;

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
  {
    version: 6,
    name: "budget_outbox_operations",
    sql: `
      CREATE TABLE sync_outbox_v6 (
        operation_id TEXT PRIMARY KEY NOT NULL,
        idempotency_key TEXT NOT NULL UNIQUE,
        entity_type TEXT NOT NULL CHECK (entity_type IN ('account', 'category', 'transaction', 'transfer', 'budget')),
        entity_id TEXT NOT NULL,
        operation_type TEXT NOT NULL CHECK (operation_type IN ('create', 'update', 'delete')),
        base_revision INTEGER CHECK (base_revision IS NULL OR base_revision >= 0),
        payload_json TEXT NOT NULL,
        dependency_ids_json TEXT NOT NULL DEFAULT '[]',
        base_json TEXT NOT NULL DEFAULT '{}',
        state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'sending', 'retryable', 'failed', 'conflicted')),
        attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
        next_attempt_at TEXT,
        last_error_code TEXT,
        created_sequence INTEGER NOT NULL UNIQUE
      );

      CREATE TABLE sync_conflicts_v6 (
        conflict_id TEXT PRIMARY KEY NOT NULL,
        entity_type TEXT NOT NULL CHECK (entity_type IN ('account', 'category', 'transaction', 'transfer', 'budget')),
        entity_id TEXT NOT NULL,
        operation_id TEXT REFERENCES sync_outbox_v6(operation_id),
        base_json TEXT NOT NULL,
        local_json TEXT NOT NULL,
        server_json TEXT NOT NULL,
        server_revision INTEGER NOT NULL CHECK (server_revision >= 0),
        created_at TEXT NOT NULL,
        resolved_at TEXT,
        resolution TEXT CHECK (resolution IS NULL OR resolution IN ('keep_local', 'keep_server', 'merged'))
      );

      INSERT INTO sync_outbox_v6 (
        operation_id, idempotency_key, entity_type, entity_id, operation_type,
        base_revision, payload_json, dependency_ids_json, state, attempt_count,
        next_attempt_at, last_error_code, created_sequence, base_json
      )
      SELECT
        operation_id, idempotency_key, entity_type, entity_id, operation_type,
        base_revision, payload_json, dependency_ids_json, state, attempt_count,
        next_attempt_at, last_error_code, created_sequence, base_json
      FROM sync_outbox;

      INSERT INTO sync_conflicts_v6 (
        conflict_id, entity_type, entity_id, operation_id, base_json, local_json,
        server_json, server_revision, created_at, resolved_at, resolution
      )
      SELECT
        conflict_id, entity_type, entity_id, operation_id, base_json, local_json,
        server_json, server_revision, created_at, resolved_at, resolution
      FROM sync_conflicts;

      DROP TABLE sync_conflicts;
      DROP TABLE sync_outbox;

      ALTER TABLE sync_outbox_v6 RENAME TO sync_outbox;
      ALTER TABLE sync_conflicts_v6 RENAME TO sync_conflicts;

      CREATE INDEX sync_outbox_ready_idx
        ON sync_outbox(state, next_attempt_at, created_sequence);
      CREATE UNIQUE INDEX sync_outbox_entity_unique
        ON sync_outbox(entity_type, entity_id);
    `,
  },
  {
    version: 7,
    name: "financial_goals",
    sql: `
      CREATE TABLE financial_goals (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        target_amount_minor INTEGER NOT NULL CHECK (target_amount_minor >= 0),
        current_amount_minor INTEGER NOT NULL DEFAULT 0 CHECK (current_amount_minor >= 0),
        target_date TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('active', 'paused', 'completed')),
        server_revision INTEGER NOT NULL DEFAULT 0 CHECK (server_revision >= 0),
        server_updated_at TEXT,
        deleted_at TEXT,
        sync_state TEXT NOT NULL DEFAULT 'synced'
          CHECK (sync_state IN ('synced', 'pending', 'failed', 'conflicted'))
      );

      CREATE INDEX financial_goals_status_idx
        ON financial_goals(status, target_date);

      CREATE TABLE sync_outbox_v7 (
        operation_id TEXT PRIMARY KEY NOT NULL,
        idempotency_key TEXT NOT NULL UNIQUE,
        entity_type TEXT NOT NULL CHECK (entity_type IN ('account', 'category', 'transaction', 'transfer', 'budget', 'goal')),
        entity_id TEXT NOT NULL,
        operation_type TEXT NOT NULL CHECK (operation_type IN ('create', 'update', 'delete')),
        base_revision INTEGER CHECK (base_revision IS NULL OR base_revision >= 0),
        payload_json TEXT NOT NULL,
        dependency_ids_json TEXT NOT NULL DEFAULT '[]',
        base_json TEXT NOT NULL DEFAULT '{}',
        state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'sending', 'retryable', 'failed', 'conflicted')),
        attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
        next_attempt_at TEXT,
        last_error_code TEXT,
        created_sequence INTEGER NOT NULL UNIQUE
      );

      CREATE TABLE sync_conflicts_v7 (
        conflict_id TEXT PRIMARY KEY NOT NULL,
        entity_type TEXT NOT NULL CHECK (entity_type IN ('account', 'category', 'transaction', 'transfer', 'budget', 'goal')),
        entity_id TEXT NOT NULL,
        operation_id TEXT REFERENCES sync_outbox_v7(operation_id),
        base_json TEXT NOT NULL,
        local_json TEXT NOT NULL,
        server_json TEXT NOT NULL,
        server_revision INTEGER NOT NULL CHECK (server_revision >= 0),
        created_at TEXT NOT NULL,
        resolved_at TEXT,
        resolution TEXT CHECK (resolution IS NULL OR resolution IN ('keep_local', 'keep_server', 'merged'))
      );

      CREATE TABLE sync_tombstones_v7 (
        entity_type TEXT NOT NULL CHECK (entity_type IN ('account', 'category', 'transaction', 'goal')),
        entity_id TEXT NOT NULL,
        server_revision INTEGER NOT NULL CHECK (server_revision > 0),
        server_updated_at TEXT NOT NULL,
        PRIMARY KEY (entity_type, entity_id)
      );

      INSERT INTO sync_outbox_v7 (
        operation_id, idempotency_key, entity_type, entity_id, operation_type,
        base_revision, payload_json, dependency_ids_json, state, attempt_count,
        next_attempt_at, last_error_code, created_sequence, base_json
      )
      SELECT
        operation_id, idempotency_key, entity_type, entity_id, operation_type,
        base_revision, payload_json, dependency_ids_json, state, attempt_count,
        next_attempt_at, last_error_code, created_sequence, base_json
      FROM sync_outbox;

      INSERT INTO sync_conflicts_v7 (
        conflict_id, entity_type, entity_id, operation_id, base_json, local_json,
        server_json, server_revision, created_at, resolved_at, resolution
      )
      SELECT
        conflict_id, entity_type, entity_id, operation_id, base_json, local_json,
        server_json, server_revision, created_at, resolved_at, resolution
      FROM sync_conflicts;

      INSERT INTO sync_tombstones_v7 (
        entity_type, entity_id, server_revision, server_updated_at
      )
      SELECT entity_type, entity_id, server_revision, server_updated_at
      FROM sync_tombstones;

      DROP TABLE sync_tombstones;
      DROP TABLE sync_conflicts;
      DROP TABLE sync_outbox;

      ALTER TABLE sync_tombstones_v7 RENAME TO sync_tombstones;
      ALTER TABLE sync_conflicts_v7 RENAME TO sync_conflicts;
      ALTER TABLE sync_outbox_v7 RENAME TO sync_outbox;

      CREATE INDEX sync_outbox_ready_idx
        ON sync_outbox(state, next_attempt_at, created_sequence);
      CREATE UNIQUE INDEX sync_outbox_entity_unique
        ON sync_outbox(entity_type, entity_id);
      CREATE INDEX sync_tombstones_revision_idx
        ON sync_tombstones(entity_type, server_revision);
    `,
  },
  {
    version: 8,
    name: "debts",
    sql: `
      CREATE TABLE debts (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('credit_card', 'personal_loan', 'auto_loan', 'mortgage', 'other')),
        balance_minor INTEGER NOT NULL CHECK (balance_minor >= 0),
        apr_basis_points INTEGER NOT NULL DEFAULT 0 CHECK (apr_basis_points >= 0),
        minimum_payment_minor INTEGER NOT NULL DEFAULT 0 CHECK (minimum_payment_minor >= 0),
        balance_as_of TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paid')),
        server_revision INTEGER NOT NULL DEFAULT 0 CHECK (server_revision >= 0),
        server_updated_at TEXT,
        deleted_at TEXT,
        sync_state TEXT NOT NULL DEFAULT 'synced'
          CHECK (sync_state IN ('synced', 'pending', 'failed', 'conflicted'))
      );

      CREATE INDEX debts_status_idx
        ON debts(status, name);

      CREATE TABLE sync_outbox_v8 (
        operation_id TEXT PRIMARY KEY NOT NULL,
        idempotency_key TEXT NOT NULL UNIQUE,
        entity_type TEXT NOT NULL CHECK (entity_type IN ('account', 'category', 'transaction', 'transfer', 'budget', 'goal', 'debt')),
        entity_id TEXT NOT NULL,
        operation_type TEXT NOT NULL CHECK (operation_type IN ('create', 'update', 'delete')),
        base_revision INTEGER CHECK (base_revision IS NULL OR base_revision >= 0),
        payload_json TEXT NOT NULL,
        dependency_ids_json TEXT NOT NULL DEFAULT '[]',
        base_json TEXT NOT NULL DEFAULT '{}',
        state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'sending', 'retryable', 'failed', 'conflicted')),
        attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
        next_attempt_at TEXT,
        last_error_code TEXT,
        created_sequence INTEGER NOT NULL UNIQUE
      );

      CREATE TABLE sync_conflicts_v8 (
        conflict_id TEXT PRIMARY KEY NOT NULL,
        entity_type TEXT NOT NULL CHECK (entity_type IN ('account', 'category', 'transaction', 'transfer', 'budget', 'goal', 'debt')),
        entity_id TEXT NOT NULL,
        operation_id TEXT REFERENCES sync_outbox_v8(operation_id),
        base_json TEXT NOT NULL,
        local_json TEXT NOT NULL,
        server_json TEXT NOT NULL,
        server_revision INTEGER NOT NULL CHECK (server_revision >= 0),
        created_at TEXT NOT NULL,
        resolved_at TEXT,
        resolution TEXT CHECK (resolution IS NULL OR resolution IN ('keep_local', 'keep_server', 'merged'))
      );

      CREATE TABLE sync_tombstones_v8 (
        entity_type TEXT NOT NULL CHECK (entity_type IN ('account', 'category', 'transaction', 'goal', 'debt')),
        entity_id TEXT NOT NULL,
        server_revision INTEGER NOT NULL CHECK (server_revision > 0),
        server_updated_at TEXT NOT NULL,
        PRIMARY KEY (entity_type, entity_id)
      );

      INSERT INTO sync_outbox_v8 (
        operation_id, idempotency_key, entity_type, entity_id, operation_type,
        base_revision, payload_json, dependency_ids_json, state, attempt_count,
        next_attempt_at, last_error_code, created_sequence, base_json
      )
      SELECT
        operation_id, idempotency_key, entity_type, entity_id, operation_type,
        base_revision, payload_json, dependency_ids_json, state, attempt_count,
        next_attempt_at, last_error_code, created_sequence, base_json
      FROM sync_outbox;

      INSERT INTO sync_conflicts_v8 (
        conflict_id, entity_type, entity_id, operation_id, base_json, local_json,
        server_json, server_revision, created_at, resolved_at, resolution
      )
      SELECT
        conflict_id, entity_type, entity_id, operation_id, base_json, local_json,
        server_json, server_revision, created_at, resolved_at, resolution
      FROM sync_conflicts;

      INSERT INTO sync_tombstones_v8 (
        entity_type, entity_id, server_revision, server_updated_at
      )
      SELECT entity_type, entity_id, server_revision, server_updated_at
      FROM sync_tombstones;

      DROP TABLE sync_tombstones;
      DROP TABLE sync_conflicts;
      DROP TABLE sync_outbox;

      ALTER TABLE sync_tombstones_v8 RENAME TO sync_tombstones;
      ALTER TABLE sync_conflicts_v8 RENAME TO sync_conflicts;
      ALTER TABLE sync_outbox_v8 RENAME TO sync_outbox;

      CREATE INDEX sync_outbox_ready_idx
        ON sync_outbox(state, next_attempt_at, created_sequence);
      CREATE UNIQUE INDEX sync_outbox_entity_unique
        ON sync_outbox(entity_type, entity_id);
      CREATE INDEX sync_tombstones_revision_idx
        ON sync_tombstones(entity_type, server_revision);
    `,
  },
  {
    version: 9,
    name: "subscriptions",
    sql: `
      CREATE TABLE subscriptions (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
        currency TEXT NOT NULL DEFAULT 'PHP',
        billing_cycle TEXT NOT NULL CHECK (billing_cycle IN ('monthly', 'yearly')),
        next_billing_date TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'canceled')),
        category_id TEXT,
        account_id TEXT,
        server_revision INTEGER NOT NULL DEFAULT 0 CHECK (server_revision >= 0),
        server_updated_at TEXT,
        deleted_at TEXT,
        sync_state TEXT NOT NULL DEFAULT 'synced'
          CHECK (sync_state IN ('synced', 'pending', 'failed', 'conflicted'))
      );

      CREATE INDEX subscriptions_status_idx
        ON subscriptions(status, name);

      CREATE TABLE sync_outbox_v9 (
        operation_id TEXT PRIMARY KEY NOT NULL,
        idempotency_key TEXT NOT NULL UNIQUE,
        entity_type TEXT NOT NULL CHECK (entity_type IN ('account', 'category', 'transaction', 'transfer', 'budget', 'goal', 'debt', 'subscription')),
        entity_id TEXT NOT NULL,
        operation_type TEXT NOT NULL CHECK (operation_type IN ('create', 'update', 'delete')),
        base_revision INTEGER CHECK (base_revision IS NULL OR base_revision >= 0),
        payload_json TEXT NOT NULL,
        dependency_ids_json TEXT NOT NULL DEFAULT '[]',
        base_json TEXT NOT NULL DEFAULT '{}',
        state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'sending', 'retryable', 'failed', 'conflicted')),
        attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
        next_attempt_at TEXT,
        last_error_code TEXT,
        created_sequence INTEGER NOT NULL UNIQUE
      );

      CREATE TABLE sync_conflicts_v9 (
        conflict_id TEXT PRIMARY KEY NOT NULL,
        entity_type TEXT NOT NULL CHECK (entity_type IN ('account', 'category', 'transaction', 'transfer', 'budget', 'goal', 'debt', 'subscription')),
        entity_id TEXT NOT NULL,
        operation_id TEXT REFERENCES sync_outbox_v9(operation_id),
        base_json TEXT NOT NULL,
        local_json TEXT NOT NULL,
        server_json TEXT NOT NULL,
        server_revision INTEGER NOT NULL CHECK (server_revision >= 0),
        created_at TEXT NOT NULL,
        resolved_at TEXT,
        resolution TEXT CHECK (resolution IS NULL OR resolution IN ('keep_local', 'keep_server', 'merged'))
      );

      CREATE TABLE sync_tombstones_v9 (
        entity_type TEXT NOT NULL CHECK (entity_type IN ('account', 'category', 'transaction', 'goal', 'debt', 'subscription')),
        entity_id TEXT NOT NULL,
        server_revision INTEGER NOT NULL CHECK (server_revision > 0),
        server_updated_at TEXT NOT NULL,
        PRIMARY KEY (entity_type, entity_id)
      );

      INSERT INTO sync_outbox_v9 (
        operation_id, idempotency_key, entity_type, entity_id, operation_type,
        base_revision, payload_json, dependency_ids_json, state, attempt_count,
        next_attempt_at, last_error_code, created_sequence, base_json
      )
      SELECT
        operation_id, idempotency_key, entity_type, entity_id, operation_type,
        base_revision, payload_json, dependency_ids_json, state, attempt_count,
        next_attempt_at, last_error_code, created_sequence, base_json
      FROM sync_outbox;

      INSERT INTO sync_conflicts_v9 (
        conflict_id, entity_type, entity_id, operation_id, base_json, local_json,
        server_json, server_revision, created_at, resolved_at, resolution
      )
      SELECT
        conflict_id, entity_type, entity_id, operation_id, base_json, local_json,
        server_json, server_revision, created_at, resolved_at, resolution
      FROM sync_conflicts;

      INSERT INTO sync_tombstones_v9 (
        entity_type, entity_id, server_revision, server_updated_at
      )
      SELECT entity_type, entity_id, server_revision, server_updated_at
      FROM sync_tombstones;

      DROP TABLE sync_tombstones;
      DROP TABLE sync_conflicts;
      DROP TABLE sync_outbox;

      ALTER TABLE sync_tombstones_v9 RENAME TO sync_tombstones;
      ALTER TABLE sync_conflicts_v9 RENAME TO sync_conflicts;
      ALTER TABLE sync_outbox_v9 RENAME TO sync_outbox;

      CREATE INDEX sync_outbox_ready_idx
        ON sync_outbox(state, next_attempt_at, created_sequence);
      CREATE UNIQUE INDEX sync_outbox_entity_unique
        ON sync_outbox(entity_type, entity_id);
      CREATE INDEX sync_tombstones_revision_idx
        ON sync_tombstones(entity_type, server_revision);
    `,
  },
  {
    version: 10,
    name: "calendar-events",
    sql: `
      CREATE TABLE calendar_events (
        id TEXT PRIMARY KEY NOT NULL,
        title TEXT NOT NULL,
        date TEXT NOT NULL,
        start_time TEXT,
        end_time TEXT,
        notes TEXT,
        server_revision INTEGER NOT NULL DEFAULT 0 CHECK (server_revision >= 0),
        server_updated_at TEXT,
        deleted_at TEXT,
        sync_state TEXT NOT NULL DEFAULT 'synced'
          CHECK (sync_state IN ('synced', 'pending', 'failed', 'conflicted'))
      );

      CREATE INDEX calendar_events_date_idx
        ON calendar_events(date, start_time);

      CREATE TABLE sync_outbox_v10 (
        operation_id TEXT PRIMARY KEY NOT NULL,
        idempotency_key TEXT NOT NULL UNIQUE,
        entity_type TEXT NOT NULL CHECK (entity_type IN ('account', 'category', 'transaction', 'transfer', 'budget', 'goal', 'debt', 'subscription', 'event')),
        entity_id TEXT NOT NULL,
        operation_type TEXT NOT NULL CHECK (operation_type IN ('create', 'update', 'delete')),
        base_revision INTEGER CHECK (base_revision IS NULL OR base_revision >= 0),
        payload_json TEXT NOT NULL,
        dependency_ids_json TEXT NOT NULL DEFAULT '[]',
        base_json TEXT NOT NULL DEFAULT '{}',
        state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'sending', 'retryable', 'failed', 'conflicted')),
        attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
        next_attempt_at TEXT,
        last_error_code TEXT,
        created_sequence INTEGER NOT NULL UNIQUE
      );

      CREATE TABLE sync_conflicts_v10 (
        conflict_id TEXT PRIMARY KEY NOT NULL,
        entity_type TEXT NOT NULL CHECK (entity_type IN ('account', 'category', 'transaction', 'transfer', 'budget', 'goal', 'debt', 'subscription', 'event')),
        entity_id TEXT NOT NULL,
        operation_id TEXT REFERENCES sync_outbox_v10(operation_id),
        base_json TEXT NOT NULL,
        local_json TEXT NOT NULL,
        server_json TEXT NOT NULL,
        server_revision INTEGER NOT NULL CHECK (server_revision >= 0),
        created_at TEXT NOT NULL,
        resolved_at TEXT,
        resolution TEXT CHECK (resolution IS NULL OR resolution IN ('keep_local', 'keep_server', 'merged'))
      );

      CREATE TABLE sync_tombstones_v10 (
        entity_type TEXT NOT NULL CHECK (entity_type IN ('account', 'category', 'transaction', 'goal', 'debt', 'subscription', 'event')),
        entity_id TEXT NOT NULL,
        server_revision INTEGER NOT NULL CHECK (server_revision > 0),
        server_updated_at TEXT NOT NULL,
        PRIMARY KEY (entity_type, entity_id)
      );

      INSERT INTO sync_outbox_v10 (
        operation_id, idempotency_key, entity_type, entity_id, operation_type,
        base_revision, payload_json, dependency_ids_json, state, attempt_count,
        next_attempt_at, last_error_code, created_sequence, base_json
      )
      SELECT
        operation_id, idempotency_key, entity_type, entity_id, operation_type,
        base_revision, payload_json, dependency_ids_json, state, attempt_count,
        next_attempt_at, last_error_code, created_sequence, base_json
      FROM sync_outbox;

      INSERT INTO sync_conflicts_v10 (
        conflict_id, entity_type, entity_id, operation_id, base_json, local_json,
        server_json, server_revision, created_at, resolved_at, resolution
      )
      SELECT
        conflict_id, entity_type, entity_id, operation_id, base_json, local_json,
        server_json, server_revision, created_at, resolved_at, resolution
      FROM sync_conflicts;

      INSERT INTO sync_tombstones_v10 (
        entity_type, entity_id, server_revision, server_updated_at
      )
      SELECT entity_type, entity_id, server_revision, server_updated_at
      FROM sync_tombstones;

      DROP TABLE sync_tombstones;
      DROP TABLE sync_conflicts;
      DROP TABLE sync_outbox;

      ALTER TABLE sync_tombstones_v10 RENAME TO sync_tombstones;
      ALTER TABLE sync_conflicts_v10 RENAME TO sync_conflicts;
      ALTER TABLE sync_outbox_v10 RENAME TO sync_outbox;

      CREATE INDEX sync_outbox_ready_idx
        ON sync_outbox(state, next_attempt_at, created_sequence);
      CREATE UNIQUE INDEX sync_outbox_entity_unique
        ON sync_outbox(entity_type, entity_id);
      CREATE INDEX sync_tombstones_revision_idx
        ON sync_tombstones(entity_type, server_revision);
    `,
  },
  {
    version: 11,
    name: "category_emoji_icons",
    sql: `
      ALTER TABLE categories ADD COLUMN icon_emoji TEXT;

      UPDATE categories
      SET icon_emoji = CASE
        WHEN id = 'category-salary' OR id LIKE '%:category:salary' THEN '💼'
        WHEN id = 'category-groceries' THEN '🛒'
        WHEN id = 'category-dining' OR id = 'category-food' OR id LIKE '%:category:food' THEN '🍔'
        WHEN id = 'category-housing' OR id LIKE '%:category:housing' THEN '🏠'
        WHEN id = 'category-transport' OR id LIKE '%:category:transport' THEN '🚗'
        WHEN id = 'category-utilities' OR id LIKE '%:category:utilities' THEN '💡'
        WHEN id = 'category-leisure' OR id = 'category-shopping' OR id LIKE '%:category:leisure' THEN '🎁'
        WHEN id = 'category-healthcare' THEN '💊'
        WHEN id = 'category-savings-transfer' OR id LIKE '%:category:savings-transfer' THEN '💰'
        ELSE icon_emoji
      END
      WHERE origin = 'starter' AND icon_emoji IS NULL;
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
