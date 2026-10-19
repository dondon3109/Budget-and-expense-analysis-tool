/**
 * Local schema 18: what a family workspace needs, applied to every workspace file so personal
 * and family files share one schema. A personal file simply never fills these.
 *
 * - `transactions.author_user_id`: who added a family entry, from the Worker's `authorUserId`.
 * - `remittances`: money sent home and who confirmed it arrived; once received,
 *   `transaction_id` is its income entry.
 * - The outbox, conflicts, and tombstones accept `remittance`, rebuilt as schema 10 did.
 * - `receipt_uploads`: a receipt photo waiting for its entries to sync before it uploads.
 */
export const familyWorkspaceMigration = {
  version: 18,
  name: "family_workspaces",
  sql: `
    ALTER TABLE transactions ADD COLUMN author_user_id TEXT;

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

    CREATE TABLE sync_outbox_v18 (
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

    CREATE TABLE sync_conflicts_v18 (
      conflict_id TEXT PRIMARY KEY NOT NULL,
      entity_type TEXT NOT NULL CHECK (entity_type IN ('account', 'category', 'transaction', 'transfer', 'budget', 'goal', 'debt', 'subscription', 'event', 'remittance')),
      entity_id TEXT NOT NULL,
      operation_id TEXT REFERENCES sync_outbox_v18(operation_id),
      base_json TEXT NOT NULL,
      local_json TEXT NOT NULL,
      server_json TEXT NOT NULL,
      server_revision INTEGER NOT NULL CHECK (server_revision >= 0),
      created_at TEXT NOT NULL,
      resolved_at TEXT,
      resolution TEXT CHECK (resolution IS NULL OR resolution IN ('keep_local', 'keep_server', 'merged'))
    );

    CREATE TABLE sync_tombstones_v18 (
      entity_type TEXT NOT NULL CHECK (entity_type IN ('account', 'category', 'transaction', 'goal', 'debt', 'subscription', 'event', 'remittance')),
      entity_id TEXT NOT NULL,
      server_revision INTEGER NOT NULL CHECK (server_revision > 0),
      server_updated_at TEXT NOT NULL,
      PRIMARY KEY (entity_type, entity_id)
    );

    INSERT INTO sync_outbox_v18 (
      operation_id, idempotency_key, entity_type, entity_id, operation_type,
      base_revision, payload_json, dependency_ids_json, state, attempt_count,
      next_attempt_at, last_error_code, created_sequence, base_json
    )
    SELECT
      operation_id, idempotency_key, entity_type, entity_id, operation_type,
      base_revision, payload_json, dependency_ids_json, state, attempt_count,
      next_attempt_at, last_error_code, created_sequence, base_json
    FROM sync_outbox;

    INSERT INTO sync_conflicts_v18 (
      conflict_id, entity_type, entity_id, operation_id, base_json, local_json,
      server_json, server_revision, created_at, resolved_at, resolution
    )
    SELECT
      conflict_id, entity_type, entity_id, operation_id, base_json, local_json,
      server_json, server_revision, created_at, resolved_at, resolution
    FROM sync_conflicts;

    INSERT INTO sync_tombstones_v18 (
      entity_type, entity_id, server_revision, server_updated_at
    )
    SELECT entity_type, entity_id, server_revision, server_updated_at
    FROM sync_tombstones;

    DROP TABLE sync_tombstones;
    DROP TABLE sync_conflicts;
    DROP TABLE sync_outbox;

    ALTER TABLE sync_tombstones_v18 RENAME TO sync_tombstones;
    ALTER TABLE sync_conflicts_v18 RENAME TO sync_conflicts;
    ALTER TABLE sync_outbox_v18 RENAME TO sync_outbox;

    CREATE INDEX sync_outbox_ready_idx
      ON sync_outbox(state, next_attempt_at, created_sequence);
    CREATE UNIQUE INDEX sync_outbox_entity_unique
      ON sync_outbox(entity_type, entity_id);
    CREATE INDEX sync_tombstones_revision_idx
      ON sync_tombstones(entity_type, server_revision);
  `,
} as const;
