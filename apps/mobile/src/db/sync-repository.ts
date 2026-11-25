import {
  MOBILE_SYNC_PROTOCOL_VERSION,
  type mobileSyncEntityTypes,
  mobileSyncAccountSnapshotSchema,
  mobileSyncBudgetSnapshotSchema,
  mobileSyncCategorySnapshotSchema,
  mobileSyncDebtSnapshotSchema,
  mobileSyncEventSnapshotSchema,
  mobileSyncGoalSnapshotSchema,
  mobileSyncRemittanceSnapshotSchema,
  mobileSyncSubscriptionSnapshotSchema,
  mobileSyncTransactionSnapshotSchema,
  type MobileSyncChange,
  type MobileSyncPullResponse,
} from "@zoption/shared";
import type { SQLiteDatabase } from "expo-sqlite";

import { LocalDatabaseWriter } from "./database-writer";
import { SYNC_ENTITY_TABLES } from "./entity-tables";
import { notifyLocalChanges } from "./local-workspace/change-stream";

export type SyncEntityType = (typeof mobileSyncEntityTypes)[number];

const MOBILE_SYNC_CURSOR_PATTERN = /^v1\.[0-9a-z]+$/;
const PREQUERY_CHUNK_SIZE = 200;

type AccountSnapshot = ReturnType<typeof mobileSyncAccountSnapshotSchema.parse>;
type CategorySnapshot = ReturnType<typeof mobileSyncCategorySnapshotSchema.parse>;
type TransactionSnapshot = ReturnType<typeof mobileSyncTransactionSnapshotSchema.parse>;
type BudgetSnapshot = ReturnType<typeof mobileSyncBudgetSnapshotSchema.parse>;
type GoalSnapshot = ReturnType<typeof mobileSyncGoalSnapshotSchema.parse>;
type DebtSnapshot = ReturnType<typeof mobileSyncDebtSnapshotSchema.parse>;
type SubscriptionSnapshot = ReturnType<typeof mobileSyncSubscriptionSnapshotSchema.parse>;
type EventSnapshot = ReturnType<typeof mobileSyncEventSnapshotSchema.parse>;
type RemittanceSnapshot = ReturnType<typeof mobileSyncRemittanceSnapshotSchema.parse>;

type SyncableEntityType = MobileSyncChange["entityType"];

interface CursorRow {
  server_cursor: string | null;
}

interface CursorAcknowledgementRow extends CursorRow {
  server_acknowledged_cursor: string | null;
  retention_floor_cursor: string | null;
}

interface SyncSummaryRow {
  server_cursor: string | null;
  server_acknowledged_cursor: string | null;
  last_successful_sync_at: string | null;
}

interface EntityStateRow {
  server_revision: number;
  sync_state: "synced" | "pending" | "failed" | "conflicted";
  transfer_group_id?: string | null;
}

interface ConflictStateRow {
  server_revision: number;
}

export interface LocalSyncSummary {
  serverCursor: string | null;
  serverAcknowledgedCursor: string | null;
  lastSyncedAt: string | null;
}

export class LocalSyncApplyError extends Error {
  constructor(
    message: string,
    readonly code: "cursor_mismatch" | "local_conflict" | "invalid_page",
  ) {
    super(message);
    this.name = "LocalSyncApplyError";
  }
}

function isValidCursor(cursor: unknown): cursor is string {
  return (
    typeof cursor === "string" && cursor.length <= 40 && MOBILE_SYNC_CURSOR_PATTERN.test(cursor)
  );
}

function assertPullPageEnvelope(
  expectedCursor: string | null,
  value: MobileSyncPullResponse,
): void {
  if (
    !value ||
    typeof value !== "object" ||
    value.protocolVersion !== MOBILE_SYNC_PROTOCOL_VERSION ||
    !Array.isArray(value.changes) ||
    !isValidCursor(value.nextCursor) ||
    typeof value.hasMore !== "boolean"
  ) {
    throw new LocalSyncApplyError("The pull page failed local validation.", "invalid_page");
  }
  if (value.changes.length === 0 && value.nextCursor !== (expectedCursor ?? "v1.0")) {
    throw new LocalSyncApplyError("An empty pull page advanced its cursor.", "invalid_page");
  }
  for (const change of value.changes) {
    if (
      !change ||
      typeof change !== "object" ||
      !(change.entityType in SYNC_ENTITY_TABLES) ||
      typeof change.entityId !== "string" ||
      change.entityId.length === 0 ||
      !Number.isSafeInteger(change.revision) ||
      change.revision < 1 ||
      typeof change.serverUpdatedAt !== "string" ||
      change.serverUpdatedAt.length === 0
    ) {
      throw new LocalSyncApplyError("The pull page failed local validation.", "invalid_page");
    }
    if (change.operation === "delete") {
      if (change.payload !== null) {
        throw new LocalSyncApplyError("The pull page failed local validation.", "invalid_page");
      }
    } else if (
      change.operation !== "upsert" ||
      !change.payload ||
      typeof change.payload !== "object" ||
      change.payload.id !== change.entityId
    ) {
      throw new LocalSyncApplyError("The pull page failed local validation.", "invalid_page");
    }
  }
}

function chunkIds(ids: readonly string[]): string[][] {
  const chunks: string[][] = [];
  for (let index = 0; index < ids.length; index += PREQUERY_CHUNK_SIZE) {
    chunks.push(ids.slice(index, index + PREQUERY_CHUNK_SIZE));
  }
  return chunks;
}

async function preloadPageState(
  database: SQLiteDatabase,
  changes: readonly MobileSyncChange[],
): Promise<{
  entityStates: Map<string, EntityStateRow>;
  tombstones: Map<string, number>;
}> {
  const idsByType = new Map<SyncableEntityType, Set<string>>();
  for (const change of changes) {
    let set = idsByType.get(change.entityType);
    if (!set) {
      set = new Set<string>();
      idsByType.set(change.entityType, set);
    }
    set.add(change.entityId);
  }

  const entityStates = new Map<string, EntityStateRow>();
  const tombstones = new Map<string, number>();

  for (const [entityType, idSet] of idsByType) {
    const table = SYNC_ENTITY_TABLES[entityType];
    const selectTransferGroup = entityType === "transaction" ? ", transfer_group_id" : "";
    for (const chunk of chunkIds(Array.from(idSet))) {
      const placeholders = chunk.map(() => "?").join(", ");
      const rows = await database.getAllAsync<EntityStateRow & { id: string }>(
        `SELECT id, server_revision, sync_state${selectTransferGroup}
         FROM ${table}
         WHERE id IN (${placeholders})`,
        ...chunk,
      );
      for (const row of rows) {
        entityStates.set(`${entityType}:${row.id}`, {
          server_revision: row.server_revision,
          sync_state: row.sync_state,
          transfer_group_id: row.transfer_group_id,
        });
      }

      if (entityType !== "budget") {
        const tombstoneRows = await database.getAllAsync<{
          entity_id: string;
          server_revision: number;
        }>(
          `SELECT entity_id, server_revision
           FROM sync_tombstones
           WHERE entity_type = ? AND entity_id IN (${placeholders})`,
          entityType,
          ...chunk,
        );
        for (const row of tombstoneRows) {
          tombstones.set(`${entityType}:${row.entity_id}`, row.server_revision);
        }
      }
    }
  }

  return { entityStates, tombstones };
}

async function canApplyPreloadedChange(
  database: SQLiteDatabase,
  change: MobileSyncChange,
  entity: EntityStateRow | undefined,
  tombstoneRevision: number | undefined,
): Promise<boolean> {
  if (tombstoneRevision !== undefined && tombstoneRevision >= change.revision) return false;
  if (entity && entity.server_revision > change.revision) return false;
  if (entity?.sync_state === "conflicted") {
    const conflict = await database.getFirstAsync<ConflictStateRow>(
      `SELECT server_revision
       FROM sync_conflicts
       WHERE entity_type = ? AND entity_id = ? AND resolved_at IS NULL
       ORDER BY created_at DESC
       LIMIT 1`,
      entity.transfer_group_id ? "transfer" : change.entityType,
      entity.transfer_group_id ?? change.entityId,
    );
    if (conflict && conflict.server_revision >= change.revision) return false;
  }
  if (entity && entity.sync_state !== "synced") {
    throw new LocalSyncApplyError(
      "A synchronized server change overlaps unsynchronized work on this device.",
      "local_conflict",
    );
  }
  return true;
}

async function upsertAccount(
  database: SQLiteDatabase,
  account: AccountSnapshot,
  revision: number,
  serverUpdatedAt: string,
): Promise<void> {
  await database.runAsync(
    `INSERT INTO accounts (
      id, name, type, currency, archived, system, interest_json,
      server_revision, server_updated_at, deleted_at, sync_state
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'synced')
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      type = excluded.type,
      currency = excluded.currency,
      archived = excluded.archived,
      system = excluded.system,
      interest_json = excluded.interest_json,
      server_revision = excluded.server_revision,
      server_updated_at = excluded.server_updated_at,
      deleted_at = NULL,
      sync_state = 'synced'`,
    account.id,
    account.name,
    account.type,
    account.currency,
    account.archived ? 1 : 0,
    account.system ? 1 : 0,
    JSON.stringify(account.interest),
    revision,
    serverUpdatedAt,
  );
}

async function upsertCategory(
  database: SQLiteDatabase,
  category: CategorySnapshot,
  revision: number,
  serverUpdatedAt: string,
): Promise<void> {
  await database.runAsync(
    `INSERT INTO categories (
      id, name, kind, color, icon_emoji, archived, system, system_key, origin, required_plan, locked,
      server_revision, server_updated_at, deleted_at, sync_state
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'synced')
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      kind = excluded.kind,
      color = excluded.color,
      icon_emoji = excluded.icon_emoji,
      archived = excluded.archived,
      system = excluded.system,
      system_key = excluded.system_key,
      origin = excluded.origin,
      required_plan = excluded.required_plan,
      locked = excluded.locked,
      server_revision = excluded.server_revision,
      server_updated_at = excluded.server_updated_at,
      deleted_at = NULL,
      sync_state = 'synced'`,
    category.id,
    category.name,
    category.kind,
    category.color,
    category.iconEmoji ?? null,
    category.archived ? 1 : 0,
    category.system ? 1 : 0,
    category.systemKey ?? null,
    category.origin,
    category.requiredPlan,
    category.locked ? 1 : 0,
    revision,
    serverUpdatedAt,
  );
}

async function upsertTransaction(
  database: SQLiteDatabase,
  transaction: TransactionSnapshot,
  revision: number,
  serverUpdatedAt: string,
): Promise<void> {
  await database.runAsync(
    `INSERT INTO transactions (
      id, account_id, category_id, date, description, amount_minor, currency, kind,
      notes, transfer_group_id, transfer_fee_minor, import_fingerprint, debt_id, author_user_id,
      server_revision, server_updated_at, deleted_at, sync_state
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'synced')
    ON CONFLICT(id) DO UPDATE SET
      account_id = excluded.account_id,
      category_id = excluded.category_id,
      date = excluded.date,
      description = excluded.description,
      amount_minor = excluded.amount_minor,
      currency = excluded.currency,
      kind = excluded.kind,
      notes = excluded.notes,
      transfer_group_id = excluded.transfer_group_id,
      transfer_fee_minor = excluded.transfer_fee_minor,
      import_fingerprint = excluded.import_fingerprint,
      debt_id = excluded.debt_id,
      author_user_id = excluded.author_user_id,
      server_revision = excluded.server_revision,
      server_updated_at = excluded.server_updated_at,
      deleted_at = NULL,
      sync_state = 'synced'`,
    transaction.id,
    transaction.accountId,
    transaction.categoryId,
    transaction.date,
    transaction.description,
    transaction.amountMinor,
    transaction.currency,
    transaction.kind,
    transaction.notes,
    transaction.transferGroupId,
    transaction.transferFeeMinor,
    transaction.importFingerprint,
    transaction.debtId ?? null,
    transaction.authorUserId ?? null,
    revision,
    serverUpdatedAt,
  );
}

async function upsertBudget(
  database: SQLiteDatabase,
  budget: BudgetSnapshot,
  revision: number,
  serverUpdatedAt: string,
): Promise<void> {
  await database.runAsync(
    `INSERT INTO budgets (
      id, category_id, month, occasion_id, limit_minor, server_revision, server_updated_at,
      deleted_at, sync_state
    ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 'synced')
    ON CONFLICT(id) DO UPDATE SET
      category_id = excluded.category_id,
      month = excluded.month,
      occasion_id = excluded.occasion_id,
      limit_minor = excluded.limit_minor,
      server_revision = excluded.server_revision,
      server_updated_at = excluded.server_updated_at,
      deleted_at = NULL,
      sync_state = 'synced'`,
    budget.id,
    budget.categoryId,
    budget.month,
    budget.occasionId ?? null,
    budget.limitMinor,
    revision,
    serverUpdatedAt,
  );
}

async function upsertGoal(
  database: SQLiteDatabase,
  goal: GoalSnapshot,
  revision: number,
  serverUpdatedAt: string,
): Promise<void> {
  await database.runAsync(
    `INSERT INTO financial_goals (
      id, name, target_amount_minor, current_amount_minor, target_date, status,
      server_revision, server_updated_at, deleted_at, sync_state
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 'synced')
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      target_amount_minor = excluded.target_amount_minor,
      current_amount_minor = excluded.current_amount_minor,
      target_date = excluded.target_date,
      status = excluded.status,
      server_revision = excluded.server_revision,
      server_updated_at = excluded.server_updated_at,
      deleted_at = NULL,
      sync_state = 'synced'`,
    goal.id,
    goal.name,
    goal.targetAmountMinor,
    goal.currentAmountMinor,
    goal.targetDate,
    goal.status,
    revision,
    serverUpdatedAt,
  );
}

async function upsertDebt(
  database: SQLiteDatabase,
  debt: DebtSnapshot,
  revision: number,
  serverUpdatedAt: string,
): Promise<void> {
  await database.runAsync(
    `INSERT INTO debts (
      id, name, type, balance_minor, apr_basis_points, minimum_payment_minor,
      balance_as_of, status, server_revision, server_updated_at, deleted_at, sync_state
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'synced')
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      type = excluded.type,
      balance_minor = excluded.balance_minor,
      apr_basis_points = excluded.apr_basis_points,
      minimum_payment_minor = excluded.minimum_payment_minor,
      balance_as_of = excluded.balance_as_of,
      status = excluded.status,
      server_revision = excluded.server_revision,
      server_updated_at = excluded.server_updated_at,
      deleted_at = NULL,
      sync_state = 'synced'`,
    debt.id,
    debt.name,
    debt.type,
    debt.balanceMinor,
    debt.aprBasisPoints,
    debt.minimumPaymentMinor,
    debt.balanceAsOf,
    debt.status,
    revision,
    serverUpdatedAt,
  );
}

async function upsertSubscription(
  database: SQLiteDatabase,
  subscription: SubscriptionSnapshot,
  revision: number,
  serverUpdatedAt: string,
): Promise<void> {
  await database.runAsync(
    `INSERT INTO subscriptions (
      id, name, amount_minor, currency, billing_cycle, next_billing_date, status,
      category_id, account_id, server_revision, server_updated_at, deleted_at, sync_state
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'synced')
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      amount_minor = excluded.amount_minor,
      currency = excluded.currency,
      billing_cycle = excluded.billing_cycle,
      next_billing_date = excluded.next_billing_date,
      status = excluded.status,
      category_id = excluded.category_id,
      account_id = excluded.account_id,
      server_revision = excluded.server_revision,
      server_updated_at = excluded.server_updated_at,
      deleted_at = NULL,
      sync_state = 'synced'`,
    subscription.id,
    subscription.name,
    subscription.amountMinor,
    subscription.currency,
    subscription.billingCycle,
    subscription.nextBillingDate,
    subscription.status,
    subscription.categoryId,
    subscription.accountId,
    revision,
    serverUpdatedAt,
  );
}

async function upsertEvent(
  database: SQLiteDatabase,
  event: EventSnapshot,
  revision: number,
  serverUpdatedAt: string,
): Promise<void> {
  await database.runAsync(
    `INSERT INTO calendar_events (
      id, title, date, start_time, end_time, notes,
      server_revision, server_updated_at, deleted_at, sync_state
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 'synced')
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      date = excluded.date,
      start_time = excluded.start_time,
      end_time = excluded.end_time,
      notes = excluded.notes,
      server_revision = excluded.server_revision,
      server_updated_at = excluded.server_updated_at,
      deleted_at = NULL,
      sync_state = 'synced'`,
    event.id,
    event.title,
    event.date,
    event.startTime,
    event.endTime,
    event.notes,
    revision,
    serverUpdatedAt,
  );
}

async function upsertRemittance(
  database: SQLiteDatabase,
  remittance: RemittanceSnapshot,
  revision: number,
  serverUpdatedAt: string,
): Promise<void> {
  await database.runAsync(
    `INSERT INTO remittances (
      id, sent_by_user_id, sent_amount_minor, sent_currency, fee_minor, provider, sent_on, note,
      transaction_id, received_by_user_id, server_revision, server_updated_at, deleted_at,
      sync_state
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'synced')
    ON CONFLICT(id) DO UPDATE SET
      sent_by_user_id = excluded.sent_by_user_id,
      sent_amount_minor = excluded.sent_amount_minor,
      sent_currency = excluded.sent_currency,
      fee_minor = excluded.fee_minor,
      provider = excluded.provider,
      sent_on = excluded.sent_on,
      note = excluded.note,
      transaction_id = excluded.transaction_id,
      received_by_user_id = excluded.received_by_user_id,
      server_revision = excluded.server_revision,
      server_updated_at = excluded.server_updated_at,
      deleted_at = NULL,
      sync_state = 'synced'`,
    remittance.id,
    remittance.sentByUserId,
    remittance.sentAmountMinor,
    remittance.sentCurrency,
    remittance.feeMinor,
    remittance.provider,
    remittance.sentOn,
    remittance.note,
    remittance.transactionId,
    remittance.receivedByUserId,
    revision,
    serverUpdatedAt,
  );
}

async function applyTombstone(database: SQLiteDatabase, change: MobileSyncChange): Promise<void> {
  await database.runAsync(
    `INSERT INTO sync_tombstones (
      entity_type, entity_id, server_revision, server_updated_at
    ) VALUES (?, ?, ?, ?)
    ON CONFLICT(entity_type, entity_id) DO UPDATE SET
      server_revision = excluded.server_revision,
      server_updated_at = excluded.server_updated_at`,
    change.entityType,
    change.entityId,
    change.revision,
    change.serverUpdatedAt,
  );
  await database.runAsync(
    `UPDATE ${SYNC_ENTITY_TABLES[change.entityType]}
     SET server_revision = ?, server_updated_at = ?, deleted_at = ?, sync_state = 'synced'
     WHERE id = ?`,
    change.revision,
    change.serverUpdatedAt,
    change.serverUpdatedAt,
    change.entityId,
  );
}

/**
 * Applies an upsert change to SQLite. Trusted internal page paths skip redundant Zod re-parsing
 * since transport already validated the shared strict contract at the HTTP boundary.
 */
async function applyUpsert(
  database: SQLiteDatabase,
  change: MobileSyncChange,
  validatePayload: boolean,
): Promise<void> {
  if (!change.payload) {
    throw new Error(`invalid_${change.entityType}_change`);
  }
  const payload = change.payload;
  switch (change.entityType) {
    case "account":
      await upsertAccount(
        database,
        validatePayload
          ? mobileSyncAccountSnapshotSchema.parse(payload)
          : (payload as AccountSnapshot),
        change.revision,
        change.serverUpdatedAt,
      );
      return;
    case "category":
      await upsertCategory(
        database,
        validatePayload
          ? mobileSyncCategorySnapshotSchema.parse(payload)
          : (payload as CategorySnapshot),
        change.revision,
        change.serverUpdatedAt,
      );
      return;
    case "transaction":
      await upsertTransaction(
        database,
        validatePayload
          ? mobileSyncTransactionSnapshotSchema.parse(payload)
          : (payload as TransactionSnapshot),
        change.revision,
        change.serverUpdatedAt,
      );
      return;
    case "budget":
      await upsertBudget(
        database,
        validatePayload
          ? mobileSyncBudgetSnapshotSchema.parse(payload)
          : (payload as BudgetSnapshot),
        change.revision,
        change.serverUpdatedAt,
      );
      return;
    case "goal":
      await upsertGoal(
        database,
        validatePayload ? mobileSyncGoalSnapshotSchema.parse(payload) : (payload as GoalSnapshot),
        change.revision,
        change.serverUpdatedAt,
      );
      return;
    case "debt":
      await upsertDebt(
        database,
        validatePayload ? mobileSyncDebtSnapshotSchema.parse(payload) : (payload as DebtSnapshot),
        change.revision,
        change.serverUpdatedAt,
      );
      return;
    case "subscription":
      await upsertSubscription(
        database,
        validatePayload
          ? mobileSyncSubscriptionSnapshotSchema.parse(payload)
          : (payload as SubscriptionSnapshot),
        change.revision,
        change.serverUpdatedAt,
      );
      return;
    case "event":
      await upsertEvent(
        database,
        validatePayload ? mobileSyncEventSnapshotSchema.parse(payload) : (payload as EventSnapshot),
        change.revision,
        change.serverUpdatedAt,
      );
      return;
    case "remittance":
      await upsertRemittance(
        database,
        validatePayload
          ? mobileSyncRemittanceSnapshotSchema.parse(payload)
          : (payload as RemittanceSnapshot),
        change.revision,
        change.serverUpdatedAt,
      );
      return;
  }
}

/**
 * Schedules a post-commit local query refresh for entity tables touched by a committed sync page.
 * Callers must invoke this only after the SQLite transaction commits.
 */
function notifyChangedEntityTables(
  databaseName: string | undefined,
  changes: readonly MobileSyncChange[],
): void {
  if (!databaseName || changes.length === 0) return;
  const tables = [...new Set(changes.map((change) => SYNC_ENTITY_TABLES[change.entityType]))];
  notifyLocalChanges(databaseName, tables);
}

/** Boundary helper for single unvalidated snapshot changes. */
export async function applySnapshotChange(
  database: SQLiteDatabase,
  change: MobileSyncChange,
): Promise<void> {
  if (change.operation !== "upsert" || !change.payload) {
    throw new Error("A full snapshot must contain only live upserts.");
  }
  await applyUpsert(database, change, true);
}

export class LocalSyncRepository {
  constructor(
    private readonly database: SQLiteDatabase,
    private readonly writer = new LocalDatabaseWriter(),
    private readonly databaseName?: string,
  ) {}

  async getCursor(): Promise<string | null> {
    const row = await this.database.getFirstAsync<CursorRow>(
      "SELECT server_cursor FROM sync_metadata WHERE singleton = 1",
    );
    return row?.server_cursor ?? null;
  }

  async getSyncSummary(): Promise<LocalSyncSummary> {
    const row = await this.database.getFirstAsync<SyncSummaryRow>(
      `SELECT server_cursor, server_acknowledged_cursor, last_successful_sync_at
       FROM sync_metadata
       WHERE singleton = 1`,
    );
    return {
      serverCursor: row?.server_cursor ?? null,
      serverAcknowledgedCursor: row?.server_acknowledged_cursor ?? null,
      lastSyncedAt: row?.last_successful_sync_at ?? null,
    };
  }

  /** Whether any synchronized entity row is stored, such as from an interrupted first snapshot. */
  async hasSyncedEntityRows(): Promise<boolean> {
    const row = await this.database.getFirstAsync<{ has_rows: number }>(
      `SELECT (${Object.values(SYNC_ENTITY_TABLES)
        .map((table) => `EXISTS(SELECT 1 FROM ${table})`)
        .join(" OR ")}) AS has_rows`,
    );
    return row?.has_rows === 1;
  }

  async hasPendingSyncWork(): Promise<boolean> {
    const row = await this.database.getFirstAsync<{ has_pending: number }>(
      `SELECT (
         EXISTS(
           SELECT 1 FROM sync_outbox
           WHERE state IN ('pending', 'sending', 'retryable', 'failed', 'conflicted')
         )
         OR EXISTS(SELECT 1 FROM sync_conflicts WHERE resolved_at IS NULL)
         OR EXISTS(SELECT 1 FROM receipt_uploads)
       ) AS has_pending`,
    );
    return row?.has_pending === 1;
  }

  /** How many changes of each kind wait to upload, to tell the user what a refusal dropped. */
  async pendingEntityCounts(): Promise<Partial<Record<SyncEntityType, number>>> {
    const rows = await this.database.getAllAsync<{ entity_type: SyncEntityType; count: number }>(
      "SELECT entity_type, count(*) AS count FROM sync_outbox GROUP BY entity_type",
    );
    return Object.fromEntries(rows.map((row) => [row.entity_type, row.count]));
  }

  recordAcknowledgement(cursor: string, retentionFloorCursor: string): Promise<void> {
    return this.writer.run(async () => {
      await this.database.withTransactionAsync(async () => {
        const row = await this.database.getFirstAsync<CursorAcknowledgementRow>(
          `SELECT server_cursor, server_acknowledged_cursor, retention_floor_cursor
           FROM sync_metadata WHERE singleton = 1`,
        );
        if (row?.server_cursor !== cursor) {
          throw new LocalSyncApplyError(
            "The local cursor changed before its server acknowledgement was recorded.",
            "cursor_mismatch",
          );
        }
        await this.database.runAsync(
          `UPDATE sync_metadata SET server_acknowledged_cursor = ?, retention_floor_cursor = ?
           WHERE singleton = 1`,
          cursor,
          retentionFloorCursor,
        );
      });
    });
  }

  async applySnapshotPage(changes: readonly MobileSyncChange[]): Promise<void> {
    if (changes.length === 0) return;
    for (const change of changes) {
      if (
        !change ||
        change.operation !== "upsert" ||
        !change.payload ||
        change.payload.id !== change.entityId ||
        !(change.entityType in SYNC_ENTITY_TABLES)
      ) {
        throw new Error("A full snapshot must contain only live upserts.");
      }
    }
    await this.writer.run(async () => {
      await this.database.withTransactionAsync(async () => {
        for (const change of changes) {
          await applyUpsert(this.database, change, false);
        }
      });
      notifyChangedEntityTables(this.databaseName, changes);
    });
  }

  recordSnapshotCompletion(cursor: string): Promise<void> {
    if (!isValidCursor(cursor)) {
      return Promise.reject(
        new LocalSyncApplyError(
          "The snapshot resume cursor failed local validation.",
          "invalid_page",
        ),
      );
    }
    const syncedAt = new Date().toISOString();
    return this.writer.run(async () => {
      await this.database.withTransactionAsync(async () => {
        await this.database.runAsync(
          `UPDATE sync_metadata
           SET server_cursor = ?,
               last_successful_sync_at = ?,
               consecutive_failures = 0
           WHERE singleton = 1`,
          cursor,
          syncedAt,
        );
      });
    });
  }

  applyPullPage(expectedCursor: string | null, value: MobileSyncPullResponse): Promise<void> {
    return this.writer.run(async () => {
      assertPullPageEnvelope(expectedCursor, value);
      if (value.changes.length === 0) {
        const meta = await this.database.getFirstAsync<{
          server_cursor: string | null;
          consecutive_failures: number;
        }>("SELECT server_cursor, consecutive_failures FROM sync_metadata WHERE singleton = 1");
        const current = meta?.server_cursor ?? null;
        if (current !== expectedCursor) {
          throw new LocalSyncApplyError(
            "The local synchronization cursor changed before this page was applied.",
            "cursor_mismatch",
          );
        }
        if (current === value.nextCursor && (meta?.consecutive_failures ?? 0) === 0) {
          return;
        }
        await this.database.withTransactionAsync(async () => {
          const currentInTxn = await this.getCursor();
          if (currentInTxn !== expectedCursor) {
            throw new LocalSyncApplyError(
              "The local synchronization cursor changed before this page was applied.",
              "cursor_mismatch",
            );
          }
          await this.database.runAsync(
            `UPDATE sync_metadata
             SET server_cursor = ?,
                 consecutive_failures = 0
             WHERE singleton = 1`,
            value.nextCursor,
          );
        });
        return;
      }

      await this.database.withTransactionAsync(async () => {
        const current = await this.getCursor();
        if (current !== expectedCursor) {
          throw new LocalSyncApplyError(
            "The local synchronization cursor changed before this page was applied.",
            "cursor_mismatch",
          );
        }
        const { entityStates, tombstones } = await preloadPageState(this.database, value.changes);
        for (const change of value.changes) {
          const key = `${change.entityType}:${change.entityId}`;
          const entity = entityStates.get(key);
          const tombstoneRevision = tombstones.get(key);
          if (!(await canApplyPreloadedChange(this.database, change, entity, tombstoneRevision))) {
            continue;
          }
          if (change.operation === "delete") {
            await applyTombstone(this.database, change);
            tombstones.set(key, change.revision);
            entityStates.set(key, {
              server_revision: change.revision,
              sync_state: "synced",
              transfer_group_id: entity?.transfer_group_id,
            });
            continue;
          }
          if (tombstoneRevision !== undefined) {
            await this.database.runAsync(
              "DELETE FROM sync_tombstones WHERE entity_type = ? AND entity_id = ?",
              change.entityType,
              change.entityId,
            );
            tombstones.delete(key);
          }
          await applyUpsert(this.database, change, false);
          entityStates.set(key, {
            server_revision: change.revision,
            sync_state: "synced",
            transfer_group_id:
              change.entityType === "transaction"
                ? ((change.payload as TransactionSnapshot).transferGroupId ?? null)
                : undefined,
          });
        }
        const lastServerTimestamp = value.changes.at(-1)?.serverUpdatedAt ?? null;
        await this.database.runAsync(
          `UPDATE sync_metadata
           SET server_cursor = ?,
               last_successful_sync_at = COALESCE(?, last_successful_sync_at),
               consecutive_failures = 0
           WHERE singleton = 1`,
          value.nextCursor,
          lastServerTimestamp,
        );
      });
      notifyChangedEntityTables(this.databaseName, value.changes);
    });
  }

  recordFailure(): Promise<void> {
    return this.writer.run(async () => {
      await this.database.runAsync(
        `UPDATE sync_metadata
         SET consecutive_failures = consecutive_failures + 1
         WHERE singleton = 1`,
      );
    });
  }
}
