import * as Crypto from "expo-crypto";
import type { SQLiteDatabase } from "expo-sqlite";

import type {
  MobileSyncPushRequest,
  MobileSyncPushResponse,
  AccountInput,
  AccountInterestUpdate,
  AccountUpdateWithInterest,
  CalendarEventInput,
  CategoryInput,
  CategoryUpdate,
  DebtInput,
  DebtUpdate,
  FinancialGoalInput,
  SubscriptionInput,
  SubscriptionStatus,
  FinancialGoalUpdate,
  TransactionInput,
  TransactionUpdate,
  TransferInput,
  Currency,
} from "@zoption/shared";

import { LocalDatabaseWriter } from "./database-writer";
import {
  createAccount,
  retryAccountInterestSync,
  updateAccount,
  updateAccountInterest,
} from "./transaction-mutations/commands/accounts";
import { archiveReferenceEntity } from "./transaction-mutations/commands/archive-reference";
import { setBudgetLimit } from "./transaction-mutations/commands/budgets";
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
import { updateTransfer } from "./transaction-mutations/commands/transfers";
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
    return createAccount(this.commands, value, currency);
  }

  updateAccount(id: string, value: AccountUpdateWithInterest): Promise<void> {
    return updateAccount(this.commands, id, value);
  }

  /** Requeues a rejected interest change after the user has confirmed their Pro access. */
  retryAccountInterestSync(id: string): Promise<void> {
    return retryAccountInterestSync(this.commands, id);
  }

  updateAccountInterest(id: string, value: AccountInterestUpdate): Promise<void> {
    return updateAccountInterest(this.commands, id, value);
  }

  archiveAccount(id: string): Promise<void> {
    return archiveReferenceEntity(this.commands, "account", id);
  }

  createCategory(value: CategoryInput): Promise<string> {
    return createCategory(this.commands, value);
  }

  updateCategory(id: string, value: CategoryUpdate): Promise<void> {
    return updateCategory(this.commands, id, value);
  }

  archiveCategory(id: string): Promise<void> {
    return archiveReferenceEntity(this.commands, "category", id);
  }

  setBudgetLimit(month: string, categoryId: string, limitMinor: number): Promise<void> {
    return setBudgetLimit(this.commands, month, categoryId, limitMinor);
  }

  createGoal(value: FinancialGoalInput): Promise<string> {
    return createGoal(this.commands, value);
  }

  updateGoal(id: string, value: FinancialGoalUpdate): Promise<void> {
    return updateGoal(this.commands, id, value);
  }

  deleteGoal(id: string): Promise<void> {
    return deleteGoal(this.commands, id);
  }

  createDebt(value: DebtInput): Promise<string> {
    return createDebt(this.commands, value);
  }

  updateDebt(id: string, value: DebtUpdate): Promise<void> {
    return updateDebt(this.commands, id, value);
  }

  deleteDebt(id: string): Promise<void> {
    return deleteDebt(this.commands, id);
  }

  createSubscription(value: SubscriptionInput): Promise<string> {
    return createSubscription(this.commands, value);
  }

  updateSubscription(
    id: string,
    value: SubscriptionInput & { status?: SubscriptionStatus },
  ): Promise<void> {
    return updateSubscription(this.commands, id, value);
  }

  deleteSubscription(id: string): Promise<void> {
    return deleteSubscription(this.commands, id);
  }

  createEvent(value: CalendarEventInput): Promise<string> {
    return createEvent(this.commands, value);
  }

  updateEvent(id: string, value: CalendarEventInput): Promise<void> {
    return updateEvent(this.commands, id, value);
  }

  deleteEvent(id: string): Promise<void> {
    return deleteEvent(this.commands, id);
  }

  /**
   * Persists a reviewed receipt's entries as one local operation: either every
   * line and its outbox record exist, or none do.
   */
  createTransactions(values: NonTransferInput[]): Promise<string[]> {
    return createTransactions(this.commands, values);
  }

  createTransaction(value: TransactionInput): Promise<string> {
    return createTransaction(this.commands, value);
  }

  updateTransfer(id: string, value: TransferInput): Promise<void> {
    return updateTransfer(this.commands, id, value);
  }

  updateTransaction(id: string, value: TransactionUpdate): Promise<void> {
    return updateTransaction(this.commands, id, value);
  }

  deleteTransaction(id: string): Promise<void> {
    return deleteTransaction(this.commands, id);
  }

  getPushBatch(limit = 50): Promise<MobileSyncPushRequest | null> {
    return this.outbox.getPushBatch(limit);
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
    return this.conflicts.resolveReferenceConflict(entityType, entityId, resolution);
  }

  resolveConflict(entityId: string, resolution: "keep_local" | "keep_server"): Promise<void> {
    return this.conflicts.resolveConflict(entityId, resolution);
  }

  getBudgetConflict(entityId: string): Promise<LocalBudgetConflict | null> {
    return this.conflicts.getBudgetConflict(entityId);
  }

  resolveBudgetConflict(entityId: string, resolution: "keep_local" | "keep_server"): Promise<void> {
    return this.conflicts.resolveBudgetConflict(entityId, resolution);
  }

  getGoalConflict(entityId: string): Promise<LocalGoalConflict | null> {
    return this.conflicts.getGoalConflict(entityId);
  }

  resolveGoalConflict(entityId: string, resolution: "keep_local" | "keep_server"): Promise<void> {
    return this.conflicts.resolveGoalConflict(entityId, resolution);
  }

  getDebtConflict(entityId: string): Promise<LocalDebtConflict | null> {
    return this.conflicts.getDebtConflict(entityId);
  }

  resolveDebtConflict(entityId: string, resolution: "keep_local" | "keep_server"): Promise<void> {
    return this.conflicts.resolveDebtConflict(entityId, resolution);
  }

  getSubscriptionConflict(entityId: string): Promise<LocalSubscriptionConflict | null> {
    return this.conflicts.getSubscriptionConflict(entityId);
  }

  resolveSubscriptionConflict(
    entityId: string,
    resolution: "keep_local" | "keep_server",
  ): Promise<void> {
    return this.conflicts.resolveSubscriptionConflict(entityId, resolution);
  }

  getEventConflict(entityId: string): Promise<LocalEventConflict | null> {
    return this.conflicts.getEventConflict(entityId);
  }

  resolveEventConflict(entityId: string, resolution: "keep_local" | "keep_server"): Promise<void> {
    return this.conflicts.resolveEventConflict(entityId, resolution);
  }

  applyPushResponse(request: MobileSyncPushRequest, value: MobileSyncPushResponse): Promise<void> {
    return this.outbox.applyPushResponse(request, value);
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
