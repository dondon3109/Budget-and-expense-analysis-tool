import {
  mobileSyncAccountSnapshotSchema,
  mobileSyncBudgetSnapshotSchema,
  mobileSyncCategorySnapshotSchema,
  mobileSyncDebtSnapshotSchema,
  mobileSyncGoalSnapshotSchema,
  mobileSyncPullResponseSchema,
  mobileSyncTransactionSnapshotSchema,
  type MobileSyncChange,
  type MobileSyncPullResponse,
} from "@zoption/shared";
import type { SQLiteDatabase } from "expo-sqlite";

import { LocalDatabaseWriter } from "./database-writer";

interface CursorRow {
  server_cursor: string | null;
}

interface CursorAcknowledgementRow extends CursorRow {
  server_acknowledged_cursor: string | null;
  retention_floor_cursor: string | null;
}

interface EntityStateRow {
  server_revision: number;
  sync_state: "synced" | "pending" | "failed" | "conflicted";
}

interface TombstoneRow {
  server_revision: number;
}

interface ConflictStateRow {
  server_revision: number;
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

function entityTable(entityType: MobileSyncChange["entityType"]): string {
  switch (entityType) {
    case "account":
      return "accounts";
    case "category":
      return "categories";
    case "transaction":
      return "transactions";
    case "budget":
      return "budgets";
    case "goal":
      return "financial_goals";
    case "debt":
      return "debts";
  }
}

async function currentEntityState(
  database: SQLiteDatabase,
  change: MobileSyncChange,
): Promise<EntityStateRow | null> {
  return database.getFirstAsync<EntityStateRow>(
    `SELECT server_revision, sync_state FROM ${entityTable(change.entityType)} WHERE id = ?`,
    change.entityId,
  );
}

async function assertCanApply(
  database: SQLiteDatabase,
  change: MobileSyncChange,
): Promise<boolean> {
  const entity = await currentEntityState(database, change);
  const tombstone = await database.getFirstAsync<TombstoneRow>(
    "SELECT server_revision FROM sync_tombstones WHERE entity_type = ? AND entity_id = ?",
    change.entityType,
    change.entityId,
  );
  if (tombstone && tombstone.server_revision >= change.revision) return false;
  if (entity && entity.server_revision > change.revision) return false;
  if (entity?.sync_state === "conflicted") {
    const transferGroup =
      change.entityType === "transaction"
        ? await database.getFirstAsync<{ transfer_group_id: string | null }>(
            "SELECT transfer_group_id FROM transactions WHERE id = ?",
            change.entityId,
          )
        : null;
    const conflict = await database.getFirstAsync<ConflictStateRow>(
      `SELECT server_revision
       FROM sync_conflicts
       WHERE entity_type = ? AND entity_id = ? AND resolved_at IS NULL
       ORDER BY created_at DESC
       LIMIT 1`,
      transferGroup?.transfer_group_id ? "transfer" : change.entityType,
      transferGroup?.transfer_group_id ?? change.entityId,
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

async function applyAccount(database: SQLiteDatabase, change: MobileSyncChange): Promise<void> {
  if (change.entityType !== "account" || !change.payload) throw new Error("invalid_account_change");
  const account = mobileSyncAccountSnapshotSchema.parse(change.payload);
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
    change.revision,
    change.serverUpdatedAt,
  );
}

async function applyCategory(database: SQLiteDatabase, change: MobileSyncChange): Promise<void> {
  if (change.entityType !== "category" || !change.payload) {
    throw new Error("invalid_category_change");
  }
  const category = mobileSyncCategorySnapshotSchema.parse(change.payload);
  await database.runAsync(
    `INSERT INTO categories (
      id, name, kind, color, archived, system, origin, required_plan, locked,
      server_revision, server_updated_at, deleted_at, sync_state
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'synced')
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      kind = excluded.kind,
      color = excluded.color,
      archived = excluded.archived,
      system = excluded.system,
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
    category.archived ? 1 : 0,
    category.system ? 1 : 0,
    category.origin,
    category.requiredPlan,
    category.locked ? 1 : 0,
    change.revision,
    change.serverUpdatedAt,
  );
}

async function applyTransaction(database: SQLiteDatabase, change: MobileSyncChange): Promise<void> {
  if (change.entityType !== "transaction" || !change.payload) {
    throw new Error("invalid_transaction_change");
  }
  const transaction = mobileSyncTransactionSnapshotSchema.parse(change.payload);
  await database.runAsync(
    `INSERT INTO transactions (
      id, account_id, category_id, date, description, amount_minor, currency, kind,
      notes, transfer_group_id, transfer_fee_minor, import_fingerprint,
      server_revision, server_updated_at, deleted_at, sync_state
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'synced')
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
    change.revision,
    change.serverUpdatedAt,
  );
}

async function applyBudget(database: SQLiteDatabase, change: MobileSyncChange): Promise<void> {
  if (change.entityType !== "budget" || !change.payload) {
    throw new Error("invalid_budget_change");
  }
  const budget = mobileSyncBudgetSnapshotSchema.parse(change.payload);
  await database.runAsync(
    `INSERT INTO budgets (
      id, category_id, month, limit_minor, server_revision, server_updated_at, deleted_at, sync_state
    ) VALUES (?, ?, ?, ?, ?, ?, NULL, 'synced')
    ON CONFLICT(id) DO UPDATE SET
      category_id = excluded.category_id,
      month = excluded.month,
      limit_minor = excluded.limit_minor,
      server_revision = excluded.server_revision,
      server_updated_at = excluded.server_updated_at,
      deleted_at = NULL,
      sync_state = 'synced'`,
    budget.id,
    budget.categoryId,
    budget.month,
    budget.limitMinor,
    change.revision,
    change.serverUpdatedAt,
  );
}

async function applyGoal(database: SQLiteDatabase, change: MobileSyncChange): Promise<void> {
  if (change.entityType !== "goal" || !change.payload) {
    throw new Error("invalid_goal_change");
  }
  const goal = mobileSyncGoalSnapshotSchema.parse(change.payload);
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
    change.revision,
    change.serverUpdatedAt,
  );
}

async function applyDebt(database: SQLiteDatabase, change: MobileSyncChange): Promise<void> {
  if (change.entityType !== "debt" || !change.payload) {
    throw new Error("invalid_debt_change");
  }
  const debt = mobileSyncDebtSnapshotSchema.parse(change.payload);
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
    change.revision,
    change.serverUpdatedAt,
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
    `UPDATE ${entityTable(change.entityType)}
     SET server_revision = ?, server_updated_at = ?, deleted_at = ?, sync_state = 'synced'
     WHERE id = ?`,
    change.revision,
    change.serverUpdatedAt,
    change.serverUpdatedAt,
    change.entityId,
  );
}

async function applyChange(database: SQLiteDatabase, change: MobileSyncChange): Promise<void> {
  if (!(await assertCanApply(database, change))) return;
  if (change.operation === "delete") {
    await applyTombstone(database, change);
    return;
  }
  await database.runAsync(
    "DELETE FROM sync_tombstones WHERE entity_type = ? AND entity_id = ?",
    change.entityType,
    change.entityId,
  );
  switch (change.entityType) {
    case "account":
      await applyAccount(database, change);
      return;
    case "category":
      await applyCategory(database, change);
      return;
    case "transaction":
      await applyTransaction(database, change);
      return;
    case "budget":
      await applyBudget(database, change);
      return;
    case "goal":
      await applyGoal(database, change);
      return;
    case "debt":
      await applyDebt(database, change);
  }
}

export async function applySnapshotChange(
  database: SQLiteDatabase,
  change: MobileSyncChange,
): Promise<void> {
  if (change.operation !== "upsert" || !change.payload) {
    throw new Error("A full snapshot must contain only live upserts.");
  }
  switch (change.entityType) {
    case "account":
      await applyAccount(database, change);
      return;
    case "category":
      await applyCategory(database, change);
      return;
    case "transaction":
      await applyTransaction(database, change);
      return;
    case "budget":
      await applyBudget(database, change);
      return;
    case "goal":
      await applyGoal(database, change);
      return;
    case "debt":
      await applyDebt(database, change);
  }
}

export class LocalSyncRepository {
  constructor(
    private readonly database: SQLiteDatabase,
    private readonly writer = new LocalDatabaseWriter(),
  ) {}

  async getCursor(): Promise<string | null> {
    const row = await this.database.getFirstAsync<CursorRow>(
      "SELECT server_cursor FROM sync_metadata WHERE singleton = 1",
    );
    return row?.server_cursor ?? null;
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

  applyPullPage(expectedCursor: string | null, value: MobileSyncPullResponse): Promise<void> {
    return this.writer.run(async () => {
      const parsed = mobileSyncPullResponseSchema.safeParse(value);
      if (!parsed.success) {
        throw new LocalSyncApplyError("The pull page failed local validation.", "invalid_page");
      }
      if (
        parsed.data.changes.length === 0 &&
        parsed.data.nextCursor !== (expectedCursor ?? "v1.0")
      ) {
        throw new LocalSyncApplyError("An empty pull page advanced its cursor.", "invalid_page");
      }
      await this.database.withTransactionAsync(async () => {
        const current = await this.getCursor();
        if (current !== expectedCursor) {
          throw new LocalSyncApplyError(
            "The local synchronization cursor changed before this page was applied.",
            "cursor_mismatch",
          );
        }
        for (const change of parsed.data.changes) await applyChange(this.database, change);
        const lastServerTimestamp = parsed.data.changes.at(-1)?.serverUpdatedAt ?? null;
        await this.database.runAsync(
          `UPDATE sync_metadata
           SET server_cursor = ?,
               last_successful_sync_at = COALESCE(?, last_successful_sync_at),
               consecutive_failures = 0
           WHERE singleton = 1`,
          parsed.data.nextCursor,
          lastServerTimestamp,
        );
      });
    });
  }

  async recordFailure(): Promise<void> {
    await this.database.runAsync(
      `UPDATE sync_metadata
       SET consecutive_failures = consecutive_failures + 1
       WHERE singleton = 1`,
    );
  }
}
