export const LOCAL_BASELINE_VERSION = 20;
export const BASELINE_MIGRATION_NAME = "baseline_v20";

/**
 * Combined v20 baseline DDL for brand-new local databases (`PRAGMA user_version = 0`).
 * Keep strictly identical in tables, column order, constraints, indexes, and initial seed rows
 * to running migrations 1 through 20 sequentially.
 */
export const BASELINE_SCHEMA_SQL = `
  CREATE TABLE workspace_metadata (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  );

  CREATE TABLE accounts (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    currency TEXT NOT NULL,
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
    sync_state TEXT NOT NULL DEFAULT 'synced' CHECK (sync_state IN ('synced', 'pending', 'failed', 'conflicted')),
    icon_emoji TEXT,
    system_key TEXT
  );

  CREATE TABLE transactions (
    id TEXT PRIMARY KEY NOT NULL,
    account_id TEXT REFERENCES accounts(id),
    category_id TEXT NOT NULL REFERENCES categories(id),
    date TEXT NOT NULL,
    description TEXT NOT NULL,
    amount_minor INTEGER NOT NULL,
    currency TEXT NOT NULL,
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
    sync_state TEXT NOT NULL DEFAULT 'synced' CHECK (sync_state IN ('synced', 'pending', 'failed', 'conflicted')),
    debt_id TEXT,
    author_user_id TEXT
  );

  CREATE INDEX transactions_date_idx ON transactions(date DESC, id);
  CREATE INDEX transactions_category_idx ON transactions(category_id, date DESC);
  CREATE INDEX transactions_account_idx ON transactions(account_id, date DESC);
  CREATE UNIQUE INDEX transactions_import_fingerprint_unique
    ON transactions(import_fingerprint)
    WHERE import_fingerprint IS NOT NULL;
  CREATE INDEX transactions_transfer_group_idx
    ON transactions(transfer_group_id)
    WHERE transfer_group_id IS NOT NULL;
  CREATE INDEX transactions_debt_idx
    ON transactions(debt_id)
    WHERE debt_id IS NOT NULL;
  CREATE INDEX transactions_active_date_idx
    ON transactions(date)
    WHERE deleted_at IS NULL;
  CREATE INDEX transactions_account_balance_idx
    ON transactions(account_id, currency, kind, transfer_group_id, amount_minor)
    WHERE deleted_at IS NULL AND account_id IS NOT NULL;

  CREATE TABLE budgets (
    id TEXT PRIMARY KEY NOT NULL,
    category_id TEXT NOT NULL REFERENCES categories(id),
    month TEXT NOT NULL,
    limit_minor INTEGER NOT NULL CHECK (limit_minor >= 0),
    server_revision INTEGER NOT NULL DEFAULT 0 CHECK (server_revision >= 0),
    server_updated_at TEXT,
    deleted_at TEXT,
    sync_state TEXT NOT NULL DEFAULT 'synced' CHECK (sync_state IN ('synced', 'pending', 'failed', 'conflicted')),
    occasion_id TEXT
  );

  CREATE UNIQUE INDEX budgets_period_category_unique
    ON budgets(month, COALESCE(occasion_id, ''), category_id);
  CREATE INDEX budgets_occasion_idx
    ON budgets(occasion_id)
    WHERE occasion_id IS NOT NULL;

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

  CREATE TABLE transaction_photos (
    transaction_id TEXT PRIMARY KEY NOT NULL,
    mime_type TEXT NOT NULL,
    data_base64 TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE remittances (
    id TEXT PRIMARY KEY NOT NULL,
    sent_by_user_id TEXT NOT NULL,
    sent_amount_minor INTEGER NOT NULL CHECK (sent_amount_minor > 0),
    sent_currency TEXT NOT NULL,
    fee_minor INTEGER NOT NULL DEFAULT 0 CHECK (fee_minor >= 0),
    provider TEXT,
    sent_on TEXT NOT NULL,
    note TEXT,
    transaction_id TEXT,
    received_by_user_id TEXT,
    server_revision INTEGER NOT NULL DEFAULT 0 CHECK (server_revision >= 0),
    server_updated_at TEXT,
    deleted_at TEXT,
    sync_state TEXT NOT NULL DEFAULT 'synced'
      CHECK (sync_state IN ('synced', 'pending', 'failed', 'conflicted'))
  );

  CREATE INDEX remittances_sent_on_idx ON remittances(sent_on DESC, id);

  CREATE TABLE receipt_uploads (
    id TEXT PRIMARY KEY NOT NULL,
    transaction_ids_json TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    data_base64 TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE subscription_usage (
    subscription_id TEXT NOT NULL,
    used_on TEXT NOT NULL,
    PRIMARY KEY (subscription_id, used_on)
  );

  CREATE TABLE subscription_usage_tracking (
    subscription_id TEXT PRIMARY KEY NOT NULL,
    tracked INTEGER NOT NULL CHECK (tracked IN (0, 1))
  );

  CREATE TABLE subscription_usage_queue (
    sequence INTEGER PRIMARY KEY AUTOINCREMENT,
    subscription_id TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('check_in', 'undo', 'track', 'untrack')),
    used_on TEXT
  );

  CREATE TABLE sync_outbox (
    operation_id TEXT PRIMARY KEY NOT NULL,
    idempotency_key TEXT NOT NULL UNIQUE,
    entity_type TEXT NOT NULL CHECK (entity_type IN ('account', 'category', 'transaction', 'transfer', 'budget', 'goal', 'debt', 'subscription', 'event', 'remittance')),
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

  CREATE INDEX sync_outbox_ready_idx
    ON sync_outbox(state, next_attempt_at, created_sequence);
  CREATE UNIQUE INDEX sync_outbox_entity_unique
    ON sync_outbox(entity_type, entity_id);

  CREATE TABLE sync_conflicts (
    conflict_id TEXT PRIMARY KEY NOT NULL,
    entity_type TEXT NOT NULL CHECK (entity_type IN ('account', 'category', 'transaction', 'transfer', 'budget', 'goal', 'debt', 'subscription', 'event', 'remittance')),
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

  CREATE INDEX sync_conflicts_entity_idx
    ON sync_conflicts(entity_type, entity_id, resolved_at);

  CREATE TABLE sync_tombstones (
    entity_type TEXT NOT NULL CHECK (entity_type IN ('account', 'category', 'transaction', 'goal', 'debt', 'subscription', 'event', 'remittance')),
    entity_id TEXT NOT NULL,
    server_revision INTEGER NOT NULL CHECK (server_revision > 0),
    server_updated_at TEXT NOT NULL,
    PRIMARY KEY (entity_type, entity_id)
  );

  CREATE INDEX sync_tombstones_revision_idx
    ON sync_tombstones(entity_type, server_revision);

  CREATE TABLE sync_metadata (
    singleton INTEGER PRIMARY KEY NOT NULL DEFAULT 1 CHECK (singleton = 1),
    server_cursor TEXT,
    last_successful_sync_at TEXT,
    consecutive_failures INTEGER NOT NULL DEFAULT 0 CHECK (consecutive_failures >= 0),
    server_acknowledged_cursor TEXT,
    retention_floor_cursor TEXT
  );

  INSERT INTO sync_metadata (singleton) VALUES (1);
`;
