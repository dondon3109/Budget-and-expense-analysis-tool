import * as Crypto from "expo-crypto";
import type { SQLiteDatabase } from "expo-sqlite";
import { z } from "zod";

import type {
  MobileSyncPushRequest,
  MobileSyncPushResponse,
  AccountInput,
  AccountInterestUpdate,
  AccountUpdateWithInterest,
  BudgetQuery,
  CalendarEventInput,
  CategoryInput,
  CategoryUpdate,
  DebtInput,
  DebtUpdate,
  FinancialGoalInput,
  SubscriptionInput,
  SubscriptionStatus,
  SubscriptionUsageList,
  FinancialGoalUpdate,
  TransactionInput,
  TransactionUpdate,
  TransferInput,
  Currency,
  FamilyRemittanceReceiveInput,
  FamilyRemittanceSendInput,
} from "@zoption/shared";

import { LocalDatabaseWriter } from "./database-writer";
import { SYNC_ENTITY_TABLES } from "./entity-tables";
import { notifyLocalChanges } from "./local-workspace/change-stream";
import {
  createAccount,
  retryAccountInterestSync,
  updateAccount,
  updateAccountInterest,
} from "./transaction-mutations/commands/accounts";
import { archiveReferenceEntity } from "./transaction-mutations/commands/archive-reference";
import { setBudgetLimit, setBudgetLimits } from "./transaction-mutations/commands/budgets";
import { createCategory, updateCategory } from "./transaction-mutations/commands/categories";
import { createDebt, deleteDebt, updateDebt } from "./transaction-mutations/commands/debts";
import { createEvent, deleteEvent, updateEvent } from "./transaction-mutations/commands/events";
import { createGoal, deleteGoal, updateGoal } from "./transaction-mutations/commands/goals";
import {
  createSubscription,
  deleteSubscription,
  updateSubscription,
} from "./transaction-mutations/commands/subscriptions";
import {
  createTransaction,
  createTransactions,
  deleteTransaction,
  updateTransaction,
} from "./transaction-mutations/commands/transactions";
import {
  finishQueuedSubscriptionUsage,
  queueSubscriptionUsage,
  readyQueuedSubscriptionUsage,
  replaceSubscriptionUsage,
  type QueuedSubscriptionUsage,
  type SubscriptionUsageAction,
} from "./transaction-mutations/commands/subscription-usage";
import { updateTransfer } from "./transaction-mutations/commands/transfers";
import {
  cancelRemittance,
  discardRemittanceChange,
  receiveRemittance,
  sendRemittance,
} from "./transaction-mutations/commands/remittances";
import type { LocalCommandContext } from "./transaction-mutations/context";
import {
  LocalMutationError,
  uuidSchema,
  type LocalBudgetConflict,
  type LocalDebtConflict,
  type LocalEventConflict,
  type LocalGoalConflict,
  type LocalPushSchedule,
  type LocalReferenceConflict,
  type LocalSubscriptionConflict,
  type LocalTransactionConflict,
  type NonTransferInput,
} from "./transaction-mutations/model";
import { LocalMutationStore } from "./transaction-mutations/store";
import { LocalConflictRepository } from "./transaction-mutations/conflicts";
import { LocalMutationOutbox } from "./transaction-mutations/outbox";

export { LocalMutationError };
export type {
  LocalBudgetConflict,
  LocalBudgetConflictVersion,
  LocalDebtConflict,
  LocalDebtConflictVersion,
  LocalEventConflict,
  LocalEventConflictVersion,
  LocalGoalConflict,
  LocalGoalConflictVersion,
  LocalPushSchedule,
  LocalReferenceConflict,
  LocalReferenceConflictVersion,
  LocalSubscriptionConflict,
  LocalSubscriptionConflictVersion,
  LocalTransactionConflict,
  LocalTransactionConflictVersion,
} from "./transaction-mutations/model";
export type { QueuedSubscriptionUsage, SubscriptionUsageAction };

export class LocalTransactionMutationRepository {
  private readonly conflicts: LocalConflictRepository;
  private readonly outbox: LocalMutationOutbox;
  private readonly store: LocalMutationStore;
  private readonly commands: LocalCommandContext;

  constructor(
    private readonly database: SQLiteDatabase,
    private readonly writer = new LocalDatabaseWriter(),
    private readonly randomUuid: () => string = Crypto.randomUUID,
    private readonly now: () => Date = () => new Date(),
    private readonly random: () => number = Math.random,
    private readonly databaseName?: string,
    private readonly onSyncDirtyChange?: (dirty: boolean) => void,
  ) {
    this.store = new LocalMutationStore(database);
    this.conflicts = new LocalConflictRepository(database, writer, this.store, randomUuid, now);
    this.outbox = new LocalMutationOutbox(
      database,
      writer,
      this.store,
      () => this.clientId(),
      randomUuid,
      now,
      random,
      onSyncDirtyChange,
      () => this.hasPendingSyncWork(),
    );
    this.commands = {
      database,
      writer,
      store: this.store,
      randomUuid,
      now,
      clientId: () => this.clientId(),
    };
  }

  private async markDirty<T>(task: Promise<T>): Promise<T> {
    const result = await task;
    this.onSyncDirtyChange?.(true);
    return result;
  }

  private async refreshDirty<T>(task: Promise<T>): Promise<T> {
    const result = await task;
    if (this.onSyncDirtyChange) {
      this.onSyncDirtyChange(await this.hasPendingSyncWork());
    }
    return result;
  }

  async hasPendingOutbox(): Promise<boolean> {
    const row = await this.database.getFirstAsync<{ has_pending: number }>(
      `SELECT EXISTS(
         SELECT 1 FROM sync_outbox
         WHERE state IN ('pending', 'sending', 'retryable', 'failed', 'conflicted')
       ) AS has_pending`,
    );
    return row?.has_pending === 1;
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

  async clientId(): Promise<string> {
    const current = await this.database.getFirstAsync<{ value: string }>(
      "SELECT value FROM workspace_metadata WHERE key = 'mobile_client_id'",
    );
    if (current) return uuidSchema.parse(current.value);
    const generated = uuidSchema.parse(this.randomUuid());
    await this.database.runAsync(
      "INSERT INTO workspace_metadata (key, value) VALUES ('mobile_client_id', ?)",
      generated,
    );
    return generated;
  }

  createAccount(value: AccountInput, currency?: Currency): Promise<string> {
    return this.markDirty(createAccount(this.commands, value, currency));
  }

  updateAccount(id: string, value: AccountUpdateWithInterest): Promise<void> {
    return this.markDirty(updateAccount(this.commands, id, value));
  }

  /** Requeues a rejected interest change after the user has confirmed their Pro access. */
  retryAccountInterestSync(id: string): Promise<void> {
    return this.markDirty(retryAccountInterestSync(this.commands, id));
  }

  updateAccountInterest(id: string, value: AccountInterestUpdate): Promise<void> {
    return this.markDirty(updateAccountInterest(this.commands, id, value));
  }

  archiveAccount(id: string): Promise<void> {
    return this.refreshDirty(archiveReferenceEntity(this.commands, "account", id));
  }

  createCategory(value: CategoryInput): Promise<string> {
    return this.markDirty(createCategory(this.commands, value));
  }

  updateCategory(id: string, value: CategoryUpdate): Promise<void> {
    return this.markDirty(updateCategory(this.commands, id, value));
  }

  archiveCategory(id: string): Promise<void> {
    return this.refreshDirty(archiveReferenceEntity(this.commands, "category", id));
  }

  setBudgetLimit(period: BudgetQuery, categoryId: string, limitMinor: number): Promise<void> {
    return this.markDirty(setBudgetLimit(this.commands, period, categoryId, limitMinor));
  }

  setBudgetLimits(
    period: BudgetQuery,
    items: ReadonlyArray<{ categoryId: string; limitMinor: number }>,
  ): Promise<void> {
    return setBudgetLimits(this.commands, period, items);
  }

  createGoal(value: FinancialGoalInput): Promise<string> {
    return this.markDirty(createGoal(this.commands, value));
  }

  updateGoal(id: string, value: FinancialGoalUpdate): Promise<void> {
    return this.markDirty(updateGoal(this.commands, id, value));
  }

  deleteGoal(id: string): Promise<void> {
    return this.refreshDirty(deleteGoal(this.commands, id));
  }

  createDebt(value: DebtInput): Promise<string> {
    return this.markDirty(createDebt(this.commands, value));
  }

  updateDebt(id: string, value: DebtUpdate): Promise<void> {
    return this.markDirty(updateDebt(this.commands, id, value));
  }

  deleteDebt(id: string): Promise<void> {
    return this.refreshDirty(deleteDebt(this.commands, id));
  }

  createSubscription(value: SubscriptionInput): Promise<string> {
    return this.markDirty(createSubscription(this.commands, value));
  }

  updateSubscription(
    id: string,
    value: SubscriptionInput & { status?: SubscriptionStatus },
  ): Promise<void> {
    return this.markDirty(updateSubscription(this.commands, id, value));
  }

  deleteSubscription(id: string): Promise<void> {
    return this.refreshDirty(deleteSubscription(this.commands, id));
  }

  createEvent(value: CalendarEventInput): Promise<string> {
    return this.markDirty(createEvent(this.commands, value));
  }

  updateEvent(id: string, value: CalendarEventInput): Promise<void> {
    return this.markDirty(updateEvent(this.commands, id, value));
  }

  deleteEvent(id: string): Promise<void> {
    return this.refreshDirty(deleteEvent(this.commands, id));
  }

  /**
   * Persists a reviewed receipt's entries as one local operation: either every
   * line and its outbox record exist, or none do.
   */
  createTransactions(values: NonTransferInput[]): Promise<string[]> {
    return this.markDirty(createTransactions(this.commands, values));
  }

  createTransaction(value: TransactionInput): Promise<string> {
    return this.markDirty(createTransaction(this.commands, value));
  }

  updateTransfer(id: string, value: TransferInput): Promise<void> {
    return this.markDirty(updateTransfer(this.commands, id, value));
  }

  updateTransaction(id: string, value: TransactionUpdate): Promise<void> {
    return this.markDirty(updateTransaction(this.commands, id, value));
  }

  async deleteTransaction(id: string): Promise<void> {
    await this.refreshDirty(deleteTransaction(this.commands, id));
    await this.setTransactionPhoto(id, null);
  }

  async getTransactionPhoto(id: string): Promise<string | null> {
    const row = await this.database.getFirstAsync<{ mime_type: string; data_base64: string }>(
      "SELECT mime_type, data_base64 FROM transaction_photos WHERE transaction_id = ?",
      id,
    );
    return row ? `data:${row.mime_type};base64,${row.data_base64}` : null;
  }

  /** Stores or clears the device-only picture for a transaction; it never syncs. */
  async setTransactionPhoto(
    id: string,
    photo: { mimeType: string; base64: string } | null,
  ): Promise<void> {
    await this.commands.writer.run(async () => {
      if (!photo) {
        await this.database.runAsync("DELETE FROM transaction_photos WHERE transaction_id = ?", id);
        return;
      }
      await this.database.runAsync(
        `INSERT OR REPLACE INTO transaction_photos (transaction_id, mime_type, data_base64, updated_at)
         VALUES (?, ?, ?, ?)`,
        id,
        photo.mimeType,
        photo.base64,
        this.now().toISOString(),
      );
    });
  }

  /** Records a family remittance sent by `userId`, with its arrival when already known. */
  sendRemittance(userId: string, value: FamilyRemittanceSendInput): Promise<string> {
    return this.markDirty(sendRemittance(this.commands, userId, value));
  }

  receiveRemittance(
    userId: string,
    id: string,
    value: FamilyRemittanceReceiveInput,
  ): Promise<void> {
    return this.markDirty(receiveRemittance(this.commands, userId, id, value));
  }

  cancelRemittance(id: string): Promise<void> {
    return this.refreshDirty(cancelRemittance(this.commands, id));
  }

  /** Drops a refused or conflicting remittance change and puts back the family's version. */
  discardRemittanceChange(id: string): Promise<void> {
    return this.refreshDirty(discardRemittanceChange(this.commands, id));
  }

  /**
   * Keeps a family receipt photo in this encrypted file until its entries have synced; the sync
   * loop then uploads it once for all of them. Several entries share one photo, as for a scan.
   */
  async queueReceiptUpload(
    transactionIds: readonly string[],
    photo: { mimeType: string; base64: string },
  ): Promise<void> {
    await this.commands.writer.run(async () => {
      await this.database.runAsync(
        `INSERT INTO receipt_uploads (id, transaction_ids_json, mime_type, data_base64, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        Crypto.randomUUID(),
        JSON.stringify(transactionIds),
        photo.mimeType,
        photo.base64,
        this.now().toISOString(),
      );
    });
    this.onSyncDirtyChange?.(true);
  }

  /**
   * Queued photos whose entries are all on the server, named by the entries still alive. A photo
   * whose entries were all deleted is dropped, and one with an entry still uploading waits.
   */
  async readyReceiptUploads(): Promise<
    { id: string; transactionIds: string[]; mimeType: string; base64: string }[]
  > {
    const rows = await this.database.getAllAsync<{
      id: string;
      transaction_ids_json: string;
      mime_type: string;
      data_base64: string;
    }>("SELECT id, transaction_ids_json, mime_type, data_base64 FROM receipt_uploads");
    const ready = [];
    for (const row of rows) {
      const ids = z.array(z.string()).parse(JSON.parse(row.transaction_ids_json));
      const entries =
        ids.length === 0
          ? []
          : await this.database.getAllAsync<{ id: string; sync_state: string }>(
              `SELECT id, sync_state FROM transactions
         WHERE deleted_at IS NULL AND id IN (${ids.map(() => "?").join(", ")})`,
              ...ids,
            );
      if (entries.length === 0) {
        await this.finishReceiptUpload(row.id);
        continue;
      }
      if (entries.some((entry) => entry.sync_state !== "synced")) continue;
      ready.push({
        id: row.id,
        transactionIds: entries.map((entry) => entry.id),
        mimeType: row.mime_type,
        base64: row.data_base64,
      });
    }
    return ready;
  }

  async finishReceiptUpload(id: string): Promise<void> {
    await this.commands.writer.run(async () => {
      await this.database.runAsync("DELETE FROM receipt_uploads WHERE id = ?", id);
    });
    if (this.onSyncDirtyChange) {
      this.onSyncDirtyChange(await this.hasPendingSyncWork());
    }
  }

  /** A Subscription ROI tap (check-in, undo, or the Track usage switch), applied and queued. */
  queueSubscriptionUsage(
    subscriptionId: string,
    action: SubscriptionUsageAction,
    usedOn: string | null = null,
  ): Promise<void> {
    return queueSubscriptionUsage(this.commands, subscriptionId, action, usedOn);
  }

  readyQueuedSubscriptionUsage(): Promise<QueuedSubscriptionUsage[]> {
    return readyQueuedSubscriptionUsage(this.commands);
  }

  finishQueuedSubscriptionUsage(sequence: number): Promise<void> {
    return finishQueuedSubscriptionUsage(this.commands, sequence);
  }

  replaceSubscriptionUsage(list: SubscriptionUsageList): Promise<boolean> {
    return replaceSubscriptionUsage(this.commands, list);
  }

  getPushBatch(
    limit = 50,
    options?: { ignoreBackoff?: boolean },
  ): Promise<MobileSyncPushRequest | null> {
    return this.outbox.getPushBatch(limit, options);
  }

  getPushSchedule(): Promise<LocalPushSchedule> {
    return this.outbox.getPushSchedule();
  }

  getConflict(entityId: string): Promise<LocalTransactionConflict | null> {
    return this.conflicts.getConflict(entityId);
  }

  getReferenceConflict(
    entityType: "account" | "category",
    entityId: string,
  ): Promise<LocalReferenceConflict | null> {
    return this.conflicts.getReferenceConflict(entityType, entityId);
  }

  resolveReferenceConflict(
    entityType: "account" | "category",
    entityId: string,
    resolution: "keep_local" | "keep_server",
  ): Promise<void> {
    return this.refreshDirty(
      this.conflicts.resolveReferenceConflict(entityType, entityId, resolution),
    );
  }

  resolveConflict(entityId: string, resolution: "keep_local" | "keep_server"): Promise<void> {
    return this.refreshDirty(this.conflicts.resolveConflict(entityId, resolution));
  }

  getBudgetConflict(entityId: string): Promise<LocalBudgetConflict | null> {
    return this.conflicts.getBudgetConflict(entityId);
  }

  resolveBudgetConflict(entityId: string, resolution: "keep_local" | "keep_server"): Promise<void> {
    return this.refreshDirty(this.conflicts.resolveBudgetConflict(entityId, resolution));
  }

  getGoalConflict(entityId: string): Promise<LocalGoalConflict | null> {
    return this.conflicts.getGoalConflict(entityId);
  }

  resolveGoalConflict(entityId: string, resolution: "keep_local" | "keep_server"): Promise<void> {
    return this.refreshDirty(this.conflicts.resolveGoalConflict(entityId, resolution));
  }

  getDebtConflict(entityId: string): Promise<LocalDebtConflict | null> {
    return this.conflicts.getDebtConflict(entityId);
  }

  resolveDebtConflict(entityId: string, resolution: "keep_local" | "keep_server"): Promise<void> {
    return this.refreshDirty(this.conflicts.resolveDebtConflict(entityId, resolution));
  }

  getSubscriptionConflict(entityId: string): Promise<LocalSubscriptionConflict | null> {
    return this.conflicts.getSubscriptionConflict(entityId);
  }

  resolveSubscriptionConflict(
    entityId: string,
    resolution: "keep_local" | "keep_server",
  ): Promise<void> {
    return this.refreshDirty(this.conflicts.resolveSubscriptionConflict(entityId, resolution));
  }

  getEventConflict(entityId: string): Promise<LocalEventConflict | null> {
    return this.conflicts.getEventConflict(entityId);
  }

  resolveEventConflict(entityId: string, resolution: "keep_local" | "keep_server"): Promise<void> {
    return this.refreshDirty(this.conflicts.resolveEventConflict(entityId, resolution));
  }

  async applyPushResponse(
    request: MobileSyncPushRequest,
    value: MobileSyncPushResponse,
  ): Promise<void> {
    await this.outbox.applyPushResponse(request, value);
    if (this.databaseName && request.operations.length > 0) {
      const tables = new Set<string>(["sync_outbox", "sync_conflicts"]);
      for (const operation of request.operations) {
        tables.add(
          operation.entityType === "transfer"
            ? "transactions"
            : SYNC_ENTITY_TABLES[operation.entityType],
        );
      }
      notifyLocalChanges(this.databaseName, [...tables]);
    }
  }

  recordPushFailure(
    request: MobileSyncPushRequest,
    code: string,
    retryAfterSeconds: number | null,
  ): Promise<void> {
    return this.outbox.recordPushFailure(request, code, retryAfterSeconds);
  }

  recordPushPermanentFailure(request: MobileSyncPushRequest, code: string): Promise<void> {
    return this.outbox.recordPushPermanentFailure(request, code);
  }
}
