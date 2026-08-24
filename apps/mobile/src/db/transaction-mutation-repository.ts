import * as Crypto from "expo-crypto";
import type { SQLiteDatabase } from "expo-sqlite";
import { z } from "zod";

import {
  accountInputSchema,
  accountUpdateWithInterestSchema,
  buildTransferLegs,
  calendarEventInputSchema,
  categoryInputSchema,
  categoryUpdateSchema,
  debtInputSchema,
  debtUpdateSchema,
  financialGoalInputSchema,
  financialGoalUpdateSchema,
  interestUpdateSchema,
  mobileSyncAccountUpdateSchema,
  mobileSyncPushOperationSchema,
  mobileSyncSubscriptionUpdateSchema,
  monthStartSchema,
  normalizeSignedAmount,
  resourceIdSchema,
  subscriptionInputSchema,
  transactionInputSchema,
  transactionUpdateSchema,
  transferInputSchema,
  type MobileSyncPushRequest,
  type MobileSyncPushResponse,
  type AccountInput,
  type AccountInterestUpdate,
  type AccountUpdateWithInterest,
  type CalendarEventInput,
  type CategoryInput,
  type CategoryUpdate,
  type DebtInput,
  type DebtUpdate,
  type FinancialGoalInput,
  type SubscriptionInput,
  type SubscriptionStatus,
  type FinancialGoalUpdate,
  type TransactionInput,
  type TransactionUpdate,
  type TransferInput,
} from "@zoption/shared";

import { LocalDatabaseWriter } from "./database-writer";
import {
  LocalMutationError,
  accountSnapshot,
  asNonTransfer,
  budgetSnapshot,
  categorySnapshot,
  commandFromRow,
  debtSnapshot,
  eventSnapshot,
  fullUpdate,
  goalSnapshot,
  snapshotFromRow,
  subscriptionSnapshot,
  syncEntityTable,
  transferSnapshot,
  uuidSchema,
  validateLocalReferences,
  type LocalBudgetConflict,
  type LocalDebtConflict,
  type LocalEventConflict,
  type LocalGoalConflict,
  type LocalPushSchedule,
  type LocalReferenceConflict,
  type LocalSubscriptionConflict,
  type LocalTransactionConflict,
  type NonTransferInput,
  type accountRowSchema,
  type categoryRowSchema,
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

  createAccount(value: AccountInput): Promise<string> {
    const input = accountInputSchema.parse(value);
    return this.writer.run(async () => {
      let entityId = "";
      await this.database.withTransactionAsync(async () => {
        await this.store.assertUniqueName("account", input.name);
        await this.clientId();
        entityId = uuidSchema.parse(this.randomUuid());
        await this.database.runAsync(
          `INSERT INTO accounts (
            id, name, type, currency, archived, system, interest_json,
            server_revision, server_updated_at, deleted_at, sync_state
          ) VALUES (?, ?, ?, 'PHP', 0, 0, ?, 0, NULL, NULL, 'pending')`,
          entityId,
          input.name,
          input.type,
          JSON.stringify({
            enabled: false,
            annualRateBasisPoints: null,
            frequency: null,
            payDay: null,
          }),
        );
        await this.database.runAsync(
          `INSERT INTO sync_outbox (
            operation_id, idempotency_key, entity_type, entity_id, operation_type,
            base_revision, payload_json, dependency_ids_json, base_json, created_sequence
          ) VALUES (?, ?, 'account', ?, 'create', 0, ?, '[]', '{}', ?)`,
          uuidSchema.parse(this.randomUuid()),
          uuidSchema.parse(this.randomUuid()),
          entityId,
          JSON.stringify(input),
          await this.store.nextSequence(),
        );
      });
      return entityId;
    });
  }

  updateAccount(id: string, value: AccountUpdateWithInterest): Promise<void> {
    const update = accountUpdateWithInterestSchema.parse(value);
    return this.writer.run(async () => {
      await this.database.withTransactionAsync(async () => {
        const current = await this.store.currentAccount(id);
        if (current.sync_state === "failed" || current.sync_state === "conflicted") {
          throw new LocalMutationError(
            "Resolve this account's synchronization state before editing it.",
            "mutation_blocked",
          );
        }
        if (current.system === 1 && update.name !== current.name) {
          throw new LocalMutationError("Permanent accounts cannot be renamed.", "mutation_blocked");
        }
        await this.store.assertUniqueName("account", update.name, id);
        const outbox = await this.store.currentOutbox("account", id);
        if (outbox?.operation_type === "delete") {
          throw new LocalMutationError(
            "This account is already waiting to be archived.",
            "mutation_blocked",
          );
        }
        if (outbox && (outbox.state !== "pending" || outbox.attempt_count > 0)) {
          throw new LocalMutationError(
            "Wait for the current synchronization attempt before editing this account.",
            "mutation_blocked",
          );
        }
        const pending = outbox
          ? mobileSyncAccountUpdateSchema.safeParse(JSON.parse(outbox.payload_json) as unknown)
          : null;
        const next: AccountInput & { interest?: AccountInterestUpdate } = {
          name: update.name,
          type: update.type ?? current.type,
        };
        if (update.interest !== undefined && next.type !== "savings") {
          throw new LocalMutationError("Only savings accounts earn interest.", "mutation_blocked");
        }
        if (update.interest !== undefined) {
          next.interest = update.interest;
        } else if (
          next.type === "savings" &&
          pending?.success &&
          pending.data.interest !== undefined
        ) {
          next.interest = pending.data.interest;
        }
        if (outbox) {
          await this.database.runAsync(
            `UPDATE sync_outbox SET payload_json = ?, state = 'pending', attempt_count = 0,
              next_attempt_at = NULL, last_error_code = NULL WHERE operation_id = ?`,
            JSON.stringify(next),
            outbox.operation_id,
          );
        } else {
          await this.database.runAsync(
            `INSERT INTO sync_outbox (
              operation_id, idempotency_key, entity_type, entity_id, operation_type,
              base_revision, payload_json, dependency_ids_json, base_json, created_sequence
            ) VALUES (?, ?, 'account', ?, 'update', ?, ?, '[]', ?, ?)`,
            uuidSchema.parse(this.randomUuid()),
            uuidSchema.parse(this.randomUuid()),
            id,
            current.server_revision,
            JSON.stringify(next),
            JSON.stringify(accountSnapshot(current)),
            await this.store.nextSequence(),
          );
        }
        if (update.interest !== undefined) {
          await this.database.runAsync(
            "UPDATE accounts SET name = ?, type = ?, interest_json = ?, sync_state = 'pending' WHERE id = ?",
            next.name,
            next.type,
            JSON.stringify({
              enabled: update.interest.enabled,
              annualRateBasisPoints: update.interest.enabled
                ? update.interest.annualRateBasisPoints
                : null,
              frequency: update.interest.enabled ? update.interest.frequency : null,
              payDay: update.interest.enabled ? update.interest.payDay : null,
            }),
            id,
          );
        } else {
          await this.database.runAsync(
            "UPDATE accounts SET name = ?, type = ?, sync_state = 'pending' WHERE id = ?",
            next.name,
            next.type,
            id,
          );
        }
      });
    });
  }

  /** Requeues a rejected interest change after the user has confirmed their Pro access. */
  retryAccountInterestSync(id: string): Promise<void> {
    return this.writer.run(async () => {
      await this.database.withTransactionAsync(async () => {
        const current = await this.store.currentAccount(id);
        const outbox = await this.store.currentOutbox("account", id);
        if (
          current.sync_state !== "failed" ||
          !outbox ||
          outbox.state !== "failed" ||
          outbox.last_error_code !== "plan_limit"
        ) {
          throw new LocalMutationError(
            "This account is not waiting to retry an interest setting.",
            "mutation_blocked",
          );
        }
        let payload: unknown;
        try {
          payload = JSON.parse(outbox.payload_json) as unknown;
        } catch {
          throw new LocalMutationError("The encrypted outbox is invalid.", "invalid_outbox");
        }
        const parsed = mobileSyncAccountUpdateSchema.safeParse(payload);
        if (
          !parsed.success ||
          parsed.data.interest === undefined ||
          (parsed.data.type ?? current.type) !== "savings"
        ) {
          throw new LocalMutationError(
            "This account is not waiting to retry an interest setting.",
            "mutation_blocked",
          );
        }
        await this.database.runAsync(
          `UPDATE sync_outbox SET state = 'pending', attempt_count = 0,
            next_attempt_at = NULL, last_error_code = NULL WHERE operation_id = ?`,
          outbox.operation_id,
        );
        await this.database.runAsync("UPDATE accounts SET sync_state = 'pending' WHERE id = ?", id);
      });
    });
  }

  updateAccountInterest(id: string, value: AccountInterestUpdate): Promise<void> {
    const interest = interestUpdateSchema.parse(value);
    return this.writer.run(async () => {
      await this.database.withTransactionAsync(async () => {
        const current = await this.store.currentAccount(id);
        if (current.sync_state === "failed" || current.sync_state === "conflicted") {
          throw new LocalMutationError(
            "Resolve this account's synchronization state before editing it.",
            "mutation_blocked",
          );
        }
        if (current.type !== "savings") {
          throw new LocalMutationError("Only savings accounts earn interest.", "mutation_blocked");
        }
        const outbox = await this.store.currentOutbox("account", id);
        if (outbox?.operation_type === "delete") {
          throw new LocalMutationError(
            "This account is already waiting to be archived.",
            "mutation_blocked",
          );
        }
        if (outbox && (outbox.state !== "pending" || outbox.attempt_count > 0)) {
          throw new LocalMutationError(
            "Wait for the current synchronization attempt before editing this account.",
            "mutation_blocked",
          );
        }
        const next = outbox
          ? {
              ...mobileSyncAccountUpdateSchema.parse(JSON.parse(outbox.payload_json) as unknown),
              interest,
            }
          : { name: current.name, type: current.type, interest };
        if (outbox) {
          await this.database.runAsync(
            `UPDATE sync_outbox SET payload_json = ?, state = 'pending', attempt_count = 0,
              next_attempt_at = NULL, last_error_code = NULL WHERE operation_id = ?`,
            JSON.stringify(next),
            outbox.operation_id,
          );
        } else {
          await this.database.runAsync(
            `INSERT INTO sync_outbox (
              operation_id, idempotency_key, entity_type, entity_id, operation_type,
              base_revision, payload_json, dependency_ids_json, base_json, created_sequence
            ) VALUES (?, ?, 'account', ?, 'update', ?, ?, '[]', ?, ?)`,
            uuidSchema.parse(this.randomUuid()),
            uuidSchema.parse(this.randomUuid()),
            id,
            current.server_revision,
            JSON.stringify(next),
            JSON.stringify(accountSnapshot(current)),
            await this.store.nextSequence(),
          );
        }
        await this.database.runAsync(
          "UPDATE accounts SET interest_json = ?, sync_state = 'pending' WHERE id = ?",
          JSON.stringify({
            enabled: interest.enabled,
            annualRateBasisPoints: interest.enabled ? interest.annualRateBasisPoints : null,
            frequency: interest.enabled ? interest.frequency : null,
            payDay: interest.enabled ? interest.payDay : null,
          }),
          id,
        );
      });
    });
  }

  archiveAccount(id: string): Promise<void> {
    return this.archiveReferenceEntity("account", id);
  }

  createCategory(value: CategoryInput): Promise<string> {
    const input = categoryInputSchema.parse(value);
    return this.writer.run(async () => {
      let entityId = "";
      await this.database.withTransactionAsync(async () => {
        await this.store.assertUniqueName("category", input.name);
        await this.clientId();
        entityId = uuidSchema.parse(this.randomUuid());
        await this.database.runAsync(
          `INSERT INTO categories (
            id, name, kind, color, icon_emoji, archived, system, origin, required_plan, locked,
            server_revision, server_updated_at, deleted_at, sync_state
          ) VALUES (?, ?, ?, ?, ?, 0, 0, 'custom', 'free', 0, 0, NULL, NULL, 'pending')`,
          entityId,
          input.name,
          input.kind,
          input.color,
          input.iconEmoji ?? null,
        );
        await this.database.runAsync(
          `INSERT INTO sync_outbox (
            operation_id, idempotency_key, entity_type, entity_id, operation_type,
            base_revision, payload_json, dependency_ids_json, base_json, created_sequence
          ) VALUES (?, ?, 'category', ?, 'create', 0, ?, '[]', '{}', ?)`,
          uuidSchema.parse(this.randomUuid()),
          uuidSchema.parse(this.randomUuid()),
          entityId,
          JSON.stringify(input),
          await this.store.nextSequence(),
        );
      });
      return entityId;
    });
  }

  updateCategory(id: string, value: CategoryUpdate): Promise<void> {
    const update = categoryUpdateSchema.parse(value);
    return this.writer.run(async () => {
      await this.database.withTransactionAsync(async () => {
        const current = await this.store.currentCategory(id);
        if (
          current.system === 1 ||
          current.sync_state === "failed" ||
          current.sync_state === "conflicted"
        ) {
          throw new LocalMutationError(
            "This category cannot be edited until its synchronization state is resolved.",
            "mutation_blocked",
          );
        }
        const next: CategoryUpdate = {
          ...(update.name !== undefined ? { name: update.name } : {}),
          ...(update.color !== undefined ? { color: update.color } : {}),
          ...(update.iconEmoji !== undefined ? { iconEmoji: update.iconEmoji } : {}),
          ...(update.archived !== undefined ? { archived: update.archived } : {}),
        };
        if (next.name) await this.store.assertUniqueName("category", next.name, id);
        const outbox = await this.store.currentOutbox("category", id);
        if (outbox?.operation_type === "delete") {
          throw new LocalMutationError(
            "This category is already waiting to be archived.",
            "mutation_blocked",
          );
        }
        if (outbox && (outbox.state !== "pending" || outbox.attempt_count > 0)) {
          throw new LocalMutationError(
            "Wait for the current synchronization attempt before editing this category.",
            "mutation_blocked",
          );
        }
        const merged: CategoryInput = {
          name: next.name ?? current.name,
          kind: current.kind,
          color: next.color ?? current.color,
          iconEmoji: next.iconEmoji !== undefined ? next.iconEmoji : current.icon_emoji,
        };
        if (outbox) {
          await this.database.runAsync(
            `UPDATE sync_outbox SET payload_json = ?, state = 'pending', attempt_count = 0,
              next_attempt_at = NULL, last_error_code = NULL WHERE operation_id = ?`,
            JSON.stringify(
              outbox.operation_type === "create"
                ? merged
                : {
                    name: merged.name,
                    color: merged.color,
                    iconEmoji: merged.iconEmoji ?? null,
                    archived: next.archived ?? current.archived === 1,
                  },
            ),
            outbox.operation_id,
          );
        } else {
          await this.database.runAsync(
            `INSERT INTO sync_outbox (
              operation_id, idempotency_key, entity_type, entity_id, operation_type,
              base_revision, payload_json, dependency_ids_json, base_json, created_sequence
            ) VALUES (?, ?, 'category', ?, 'update', ?, ?, '[]', ?, ?)`,
            uuidSchema.parse(this.randomUuid()),
            uuidSchema.parse(this.randomUuid()),
            id,
            current.server_revision,
            JSON.stringify({
              name: merged.name,
              color: merged.color,
              iconEmoji: merged.iconEmoji ?? null,
              archived: next.archived ?? current.archived === 1,
            }),
            JSON.stringify(categorySnapshot(current)),
            await this.store.nextSequence(),
          );
        }
        await this.database.runAsync(
          `UPDATE categories SET name = ?, color = ?, icon_emoji = ?, archived = ?, sync_state = 'pending'
           WHERE id = ?`,
          merged.name,
          merged.color,
          merged.iconEmoji ?? null,
          (next.archived ?? current.archived === 1) ? 1 : 0,
          id,
        );
      });
    });
  }

  archiveCategory(id: string): Promise<void> {
    return this.archiveReferenceEntity("category", id);
  }

  setBudgetLimit(month: string, categoryId: string, limitMinor: number): Promise<void> {
    const monthValue = monthStartSchema.parse(month);
    const category = resourceIdSchema.parse(categoryId);
    const limit = z.number().int().safe().min(0).max(1_000_000_000_00).parse(limitMinor);
    return this.writer.run(async () => {
      await this.database.withTransactionAsync(async () => {
        await this.clientId();
        const categoryRow = await this.store.currentCategory(category);
        if (categoryRow.kind !== "expense" || categoryRow.archived === 1) {
          throw new LocalMutationError("Choose an active expense category.", "invalid_reference");
        }
        const existing = await this.store.currentBudget(monthValue, category);
        if (existing) {
          if (existing.sync_state === "failed" || existing.sync_state === "conflicted") {
            throw new LocalMutationError(
              "Resolve this budget's synchronization state before editing it.",
              "mutation_blocked",
            );
          }
          const outbox = await this.store.currentOutbox("budget", existing.id);
          if (outbox && (outbox.state !== "pending" || outbox.attempt_count > 0)) {
            throw new LocalMutationError(
              "Wait for the current synchronization attempt before editing this budget.",
              "mutation_blocked",
            );
          }
          const payload = { limitMinor: limit };
          if (outbox) {
            await this.database.runAsync(
              `UPDATE sync_outbox SET payload_json = ?, state = 'pending', attempt_count = 0,
                next_attempt_at = NULL, last_error_code = NULL WHERE operation_id = ?`,
              JSON.stringify(payload),
              outbox.operation_id,
            );
          } else {
            await this.database.runAsync(
              `INSERT INTO sync_outbox (
                operation_id, idempotency_key, entity_type, entity_id, operation_type,
                base_revision, payload_json, dependency_ids_json, base_json, created_sequence
              ) VALUES (?, ?, 'budget', ?, 'update', ?, ?, '[]', ?, ?)`,
              uuidSchema.parse(this.randomUuid()),
              uuidSchema.parse(this.randomUuid()),
              existing.id,
              existing.server_revision,
              JSON.stringify(payload),
              JSON.stringify(budgetSnapshot(existing)),
              await this.store.nextSequence(),
            );
          }
          await this.database.runAsync(
            "UPDATE budgets SET limit_minor = ?, sync_state = 'pending' WHERE id = ?",
            limit,
            existing.id,
          );
          return;
        }
        if (limit === 0) return;
        const entityId = uuidSchema.parse(this.randomUuid());
        await this.database.runAsync(
          `INSERT INTO budgets (
            id, category_id, month, limit_minor, server_revision, server_updated_at, deleted_at, sync_state
          ) VALUES (?, ?, ?, ?, 0, NULL, NULL, 'pending')`,
          entityId,
          category,
          monthValue,
          limit,
        );
        await this.database.runAsync(
          `INSERT INTO sync_outbox (
            operation_id, idempotency_key, entity_type, entity_id, operation_type,
            base_revision, payload_json, dependency_ids_json, base_json, created_sequence
          ) VALUES (?, ?, 'budget', ?, 'create', 0, ?, '[]', '{}', ?)`,
          uuidSchema.parse(this.randomUuid()),
          uuidSchema.parse(this.randomUuid()),
          entityId,
          JSON.stringify({ categoryId: category, month: monthValue, limitMinor: limit }),
          await this.store.nextSequence(),
        );
      });
    });
  }

  createGoal(value: FinancialGoalInput): Promise<string> {
    const input = financialGoalInputSchema.parse(value);
    return this.writer.run(async () => {
      let entityId = "";
      await this.database.withTransactionAsync(async () => {
        await this.store.assertUniqueName("goal", input.name);
        await this.clientId();
        entityId = uuidSchema.parse(this.randomUuid());
        await this.database.runAsync(
          `INSERT INTO financial_goals (
            id, name, target_amount_minor, current_amount_minor, target_date, status,
            server_revision, server_updated_at, deleted_at, sync_state
          ) VALUES (?, ?, ?, ?, ?, ?, 0, NULL, NULL, 'pending')`,
          entityId,
          input.name,
          input.targetAmountMinor,
          input.currentAmountMinor,
          input.targetDate,
          input.status,
        );
        await this.database.runAsync(
          `INSERT INTO sync_outbox (
            operation_id, idempotency_key, entity_type, entity_id, operation_type,
            base_revision, payload_json, dependency_ids_json, base_json, created_sequence
          ) VALUES (?, ?, 'goal', ?, 'create', 0, ?, '[]', '{}', ?)`,
          uuidSchema.parse(this.randomUuid()),
          uuidSchema.parse(this.randomUuid()),
          entityId,
          JSON.stringify({
            name: input.name,
            targetAmountMinor: input.targetAmountMinor,
            currentAmountMinor: input.currentAmountMinor,
            targetDate: input.targetDate,
            status: input.status,
          }),
          await this.store.nextSequence(),
        );
      });
      return entityId;
    });
  }

  updateGoal(id: string, value: FinancialGoalUpdate): Promise<void> {
    const update = financialGoalUpdateSchema.parse(value);
    return this.writer.run(async () => {
      await this.database.withTransactionAsync(async () => {
        const current = await this.store.currentGoalById(id);
        if (current.sync_state === "failed" || current.sync_state === "conflicted") {
          throw new LocalMutationError(
            "Resolve this goal's synchronization state before editing it.",
            "mutation_blocked",
          );
        }
        const outbox = await this.store.currentOutbox("goal", id);
        if (outbox?.operation_type === "delete") {
          throw new LocalMutationError(
            "This goal is already waiting to be deleted.",
            "mutation_blocked",
          );
        }
        if (outbox && (outbox.state !== "pending" || outbox.attempt_count > 0)) {
          throw new LocalMutationError(
            "Wait for the current synchronization attempt before editing this goal.",
            "mutation_blocked",
          );
        }
        const merged = {
          name: update.name ?? current.name,
          targetAmountMinor: update.targetAmountMinor ?? current.target_amount_minor,
          currentAmountMinor: update.currentAmountMinor ?? current.current_amount_minor,
          targetDate: update.targetDate ?? current.target_date,
          status: update.status ?? current.status,
        };
        if (merged.currentAmountMinor > merged.targetAmountMinor) {
          throw new LocalMutationError(
            "Current savings cannot exceed the target amount.",
            "mutation_blocked",
          );
        }
        if (update.name) await this.store.assertUniqueName("goal", update.name, id);
        if (outbox) {
          await this.database.runAsync(
            `UPDATE sync_outbox SET payload_json = ?, state = 'pending', attempt_count = 0,
              next_attempt_at = NULL, last_error_code = NULL WHERE operation_id = ?`,
            JSON.stringify(merged),
            outbox.operation_id,
          );
        } else {
          await this.database.runAsync(
            `INSERT INTO sync_outbox (
              operation_id, idempotency_key, entity_type, entity_id, operation_type,
              base_revision, payload_json, dependency_ids_json, base_json, created_sequence
            ) VALUES (?, ?, 'goal', ?, 'update', ?, ?, '[]', ?, ?)`,
            uuidSchema.parse(this.randomUuid()),
            uuidSchema.parse(this.randomUuid()),
            id,
            current.server_revision,
            JSON.stringify(merged),
            JSON.stringify(goalSnapshot(current)),
            await this.store.nextSequence(),
          );
        }
        await this.database.runAsync(
          `UPDATE financial_goals SET
            name = ?, target_amount_minor = ?, current_amount_minor = ?, target_date = ?,
            status = ?, sync_state = 'pending' WHERE id = ?`,
          merged.name,
          merged.targetAmountMinor,
          merged.currentAmountMinor,
          merged.targetDate,
          merged.status,
          id,
        );
      });
    });
  }

  deleteGoal(id: string): Promise<void> {
    return this.writer.run(async () => {
      await this.database.withTransactionAsync(async () => {
        const current = await this.store.currentGoalById(id);
        if (current.sync_state === "failed" || current.sync_state === "conflicted") {
          throw new LocalMutationError(
            "Resolve this goal's synchronization state before deleting it.",
            "mutation_blocked",
          );
        }
        const outbox = await this.store.currentOutbox("goal", id);
        if (outbox && (outbox.state !== "pending" || outbox.attempt_count > 0)) {
          throw new LocalMutationError(
            "Wait for the current synchronization attempt before deleting this goal.",
            "mutation_blocked",
          );
        }
        if (current.server_revision === 0 && outbox?.operation_type === "create") {
          await this.database.runAsync(
            "DELETE FROM sync_outbox WHERE operation_id = ?",
            outbox.operation_id,
          );
          await this.database.runAsync("DELETE FROM financial_goals WHERE id = ?", id);
          return;
        }
        if (outbox) {
          await this.database.runAsync(
            `UPDATE sync_outbox SET operation_type = 'delete', payload_json = '{}',
              state = 'pending', attempt_count = 0, next_attempt_at = NULL,
              last_error_code = NULL WHERE operation_id = ?`,
            outbox.operation_id,
          );
        } else {
          await this.database.runAsync(
            `INSERT INTO sync_outbox (
              operation_id, idempotency_key, entity_type, entity_id, operation_type,
              base_revision, payload_json, dependency_ids_json, base_json, created_sequence
            ) VALUES (?, ?, 'goal', ?, 'delete', ?, '{}', '[]', ?, ?)`,
            uuidSchema.parse(this.randomUuid()),
            uuidSchema.parse(this.randomUuid()),
            id,
            current.server_revision,
            JSON.stringify(goalSnapshot(current)),
            await this.store.nextSequence(),
          );
        }
        await this.database.runAsync(
          "UPDATE financial_goals SET deleted_at = ?, sync_state = 'pending' WHERE id = ?",
          this.now().toISOString(),
          id,
        );
      });
    });
  }

  createDebt(value: DebtInput): Promise<string> {
    const input = debtInputSchema.parse(value);
    return this.writer.run(async () => {
      let entityId = "";
      await this.database.withTransactionAsync(async () => {
        await this.store.assertUniqueName("debt", input.name);
        await this.clientId();
        entityId = uuidSchema.parse(this.randomUuid());
        await this.database.runAsync(
          `INSERT INTO debts (
            id, name, type, balance_minor, apr_basis_points, minimum_payment_minor,
            balance_as_of, status, server_revision, server_updated_at, deleted_at, sync_state
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, NULL, 'pending')`,
          entityId,
          input.name,
          input.type,
          input.balanceMinor,
          input.aprBasisPoints,
          input.minimumPaymentMinor,
          input.balanceAsOf,
          input.status,
        );
        await this.database.runAsync(
          `INSERT INTO sync_outbox (
            operation_id, idempotency_key, entity_type, entity_id, operation_type,
            base_revision, payload_json, dependency_ids_json, base_json, created_sequence
          ) VALUES (?, ?, 'debt', ?, 'create', 0, ?, '[]', '{}', ?)`,
          uuidSchema.parse(this.randomUuid()),
          uuidSchema.parse(this.randomUuid()),
          entityId,
          JSON.stringify({
            name: input.name,
            type: input.type,
            balanceMinor: input.balanceMinor,
            aprBasisPoints: input.aprBasisPoints,
            minimumPaymentMinor: input.minimumPaymentMinor,
            balanceAsOf: input.balanceAsOf,
            status: input.status,
          }),
          await this.store.nextSequence(),
        );
      });
      return entityId;
    });
  }

  updateDebt(id: string, value: DebtUpdate): Promise<void> {
    const update = debtUpdateSchema.parse(value);
    return this.writer.run(async () => {
      await this.database.withTransactionAsync(async () => {
        const current = await this.store.currentDebtById(id);
        if (current.sync_state === "failed" || current.sync_state === "conflicted") {
          throw new LocalMutationError(
            "Resolve this debt's synchronization state before editing it.",
            "mutation_blocked",
          );
        }
        const outbox = await this.store.currentOutbox("debt", id);
        if (outbox?.operation_type === "delete") {
          throw new LocalMutationError(
            "This debt is already waiting to be deleted.",
            "mutation_blocked",
          );
        }
        if (outbox && (outbox.state !== "pending" || outbox.attempt_count > 0)) {
          throw new LocalMutationError(
            "Wait for the current synchronization attempt before editing this debt.",
            "mutation_blocked",
          );
        }
        const merged = {
          name: update.name ?? current.name,
          type: update.type ?? current.type,
          balanceMinor: update.balanceMinor ?? current.balance_minor,
          aprBasisPoints: update.aprBasisPoints ?? current.apr_basis_points,
          minimumPaymentMinor: update.minimumPaymentMinor ?? current.minimum_payment_minor,
          balanceAsOf: update.balanceAsOf ?? current.balance_as_of,
          status: update.status ?? current.status,
        };
        if (update.name) await this.store.assertUniqueName("debt", update.name, id);
        if (outbox) {
          await this.database.runAsync(
            `UPDATE sync_outbox SET payload_json = ?, state = 'pending', attempt_count = 0,
              next_attempt_at = NULL, last_error_code = NULL WHERE operation_id = ?`,
            JSON.stringify(merged),
            outbox.operation_id,
          );
        } else {
          await this.database.runAsync(
            `INSERT INTO sync_outbox (
              operation_id, idempotency_key, entity_type, entity_id, operation_type,
              base_revision, payload_json, dependency_ids_json, base_json, created_sequence
            ) VALUES (?, ?, 'debt', ?, 'update', ?, ?, '[]', ?, ?)`,
            uuidSchema.parse(this.randomUuid()),
            uuidSchema.parse(this.randomUuid()),
            id,
            current.server_revision,
            JSON.stringify(merged),
            JSON.stringify(debtSnapshot(current)),
            await this.store.nextSequence(),
          );
        }
        await this.database.runAsync(
          `UPDATE debts SET
            name = ?, type = ?, balance_minor = ?, apr_basis_points = ?,
            minimum_payment_minor = ?, balance_as_of = ?, status = ?, sync_state = 'pending'
           WHERE id = ?`,
          merged.name,
          merged.type,
          merged.balanceMinor,
          merged.aprBasisPoints,
          merged.minimumPaymentMinor,
          merged.balanceAsOf,
          merged.status,
          id,
        );
      });
    });
  }

  deleteDebt(id: string): Promise<void> {
    return this.writer.run(async () => {
      await this.database.withTransactionAsync(async () => {
        const current = await this.store.currentDebtById(id);
        if (current.sync_state === "failed" || current.sync_state === "conflicted") {
          throw new LocalMutationError(
            "Resolve this debt's synchronization state before deleting it.",
            "mutation_blocked",
          );
        }
        const outbox = await this.store.currentOutbox("debt", id);
        if (outbox && (outbox.state !== "pending" || outbox.attempt_count > 0)) {
          throw new LocalMutationError(
            "Wait for the current synchronization attempt before deleting this debt.",
            "mutation_blocked",
          );
        }
        if (current.server_revision === 0 && outbox?.operation_type === "create") {
          await this.database.runAsync(
            "DELETE FROM sync_outbox WHERE operation_id = ?",
            outbox.operation_id,
          );
          await this.database.runAsync("DELETE FROM debts WHERE id = ?", id);
          return;
        }
        if (outbox) {
          await this.database.runAsync(
            `UPDATE sync_outbox SET operation_type = 'delete', payload_json = '{}',
              state = 'pending', attempt_count = 0, next_attempt_at = NULL,
              last_error_code = NULL WHERE operation_id = ?`,
            outbox.operation_id,
          );
        } else {
          await this.database.runAsync(
            `INSERT INTO sync_outbox (
              operation_id, idempotency_key, entity_type, entity_id, operation_type,
              base_revision, payload_json, dependency_ids_json, base_json, created_sequence
            ) VALUES (?, ?, 'debt', ?, 'delete', ?, '{}', '[]', ?, ?)`,
            uuidSchema.parse(this.randomUuid()),
            uuidSchema.parse(this.randomUuid()),
            id,
            current.server_revision,
            JSON.stringify(debtSnapshot(current)),
            await this.store.nextSequence(),
          );
        }
        await this.database.runAsync(
          "UPDATE debts SET deleted_at = ?, sync_state = 'pending' WHERE id = ?",
          this.now().toISOString(),
          id,
        );
      });
    });
  }

  createSubscription(value: SubscriptionInput): Promise<string> {
    const input = subscriptionInputSchema.parse(value);
    return this.writer.run(async () => {
      let entityId = "";
      await this.database.withTransactionAsync(async () => {
        await this.store.validateSubscriptionReferences(input);
        await this.clientId();
        entityId = uuidSchema.parse(this.randomUuid());
        await this.database.runAsync(
          `INSERT INTO subscriptions (
            id, name, amount_minor, currency, billing_cycle, next_billing_date, status,
            category_id, account_id, server_revision, server_updated_at, deleted_at, sync_state
          ) VALUES (?, ?, ?, 'PHP', ?, ?, 'active', ?, ?, 0, NULL, NULL, 'pending')`,
          entityId,
          input.name,
          input.amountMinor,
          input.billingCycle,
          input.nextBillingDate,
          input.categoryId,
          input.accountId,
        );
        await this.database.runAsync(
          `INSERT INTO sync_outbox (
            operation_id, idempotency_key, entity_type, entity_id, operation_type,
            base_revision, payload_json, dependency_ids_json, base_json, created_sequence
          ) VALUES (?, ?, 'subscription', ?, 'create', 0, ?, '[]', '{}', ?)`,
          uuidSchema.parse(this.randomUuid()),
          uuidSchema.parse(this.randomUuid()),
          entityId,
          JSON.stringify({
            name: input.name,
            amountMinor: input.amountMinor,
            billingCycle: input.billingCycle,
            nextBillingDate: input.nextBillingDate,
            categoryId: input.categoryId,
            accountId: input.accountId,
          }),
          await this.store.nextSequence(),
        );
      });
      return entityId;
    });
  }

  updateSubscription(
    id: string,
    value: SubscriptionInput & { status?: SubscriptionStatus },
  ): Promise<void> {
    const update = mobileSyncSubscriptionUpdateSchema.parse(value);
    return this.writer.run(async () => {
      await this.database.withTransactionAsync(async () => {
        const current = await this.store.currentSubscriptionById(id);
        if (current.sync_state === "failed" || current.sync_state === "conflicted") {
          throw new LocalMutationError(
            "Resolve this subscription's synchronization state before editing it.",
            "mutation_blocked",
          );
        }
        const outbox = await this.store.currentOutbox("subscription", id);
        if (outbox?.operation_type === "delete") {
          throw new LocalMutationError(
            "This subscription is already waiting to be deleted.",
            "mutation_blocked",
          );
        }
        if (outbox && (outbox.state !== "pending" || outbox.attempt_count > 0)) {
          throw new LocalMutationError(
            "Wait for the current synchronization attempt before editing this subscription.",
            "mutation_blocked",
          );
        }
        const merged = {
          name: update.name ?? current.name,
          amountMinor: update.amountMinor ?? current.amount_minor,
          billingCycle: update.billingCycle ?? current.billing_cycle,
          nextBillingDate: update.nextBillingDate ?? current.next_billing_date,
          categoryId: update.categoryId ?? current.category_id,
          accountId: update.accountId ?? current.account_id,
          status: update.status ?? current.status,
        };
        await this.store.validateSubscriptionReferences(merged);
        if (outbox) {
          await this.database.runAsync(
            `UPDATE sync_outbox SET payload_json = ?, state = 'pending', attempt_count = 0,
              next_attempt_at = NULL, last_error_code = NULL WHERE operation_id = ?`,
            JSON.stringify(merged),
            outbox.operation_id,
          );
        } else {
          await this.database.runAsync(
            `INSERT INTO sync_outbox (
              operation_id, idempotency_key, entity_type, entity_id, operation_type,
              base_revision, payload_json, dependency_ids_json, base_json, created_sequence
            ) VALUES (?, ?, 'subscription', ?, 'update', ?, ?, '[]', ?, ?)`,
            uuidSchema.parse(this.randomUuid()),
            uuidSchema.parse(this.randomUuid()),
            id,
            current.server_revision,
            JSON.stringify(merged),
            JSON.stringify(subscriptionSnapshot(current)),
            await this.store.nextSequence(),
          );
        }
        await this.database.runAsync(
          `UPDATE subscriptions SET
            name = ?, amount_minor = ?, billing_cycle = ?, next_billing_date = ?,
            status = ?, category_id = ?, account_id = ?, sync_state = 'pending'
           WHERE id = ?`,
          merged.name,
          merged.amountMinor,
          merged.billingCycle,
          merged.nextBillingDate,
          merged.status,
          merged.categoryId,
          merged.accountId,
          id,
        );
      });
    });
  }

  deleteSubscription(id: string): Promise<void> {
    return this.writer.run(async () => {
      await this.database.withTransactionAsync(async () => {
        const current = await this.store.currentSubscriptionById(id);
        if (current.sync_state === "failed" || current.sync_state === "conflicted") {
          throw new LocalMutationError(
            "Resolve this subscription's synchronization state before deleting it.",
            "mutation_blocked",
          );
        }
        const outbox = await this.store.currentOutbox("subscription", id);
        if (outbox && (outbox.state !== "pending" || outbox.attempt_count > 0)) {
          throw new LocalMutationError(
            "Wait for the current synchronization attempt before deleting this subscription.",
            "mutation_blocked",
          );
        }
        if (current.server_revision === 0 && outbox?.operation_type === "create") {
          await this.database.runAsync(
            "DELETE FROM sync_outbox WHERE operation_id = ?",
            outbox.operation_id,
          );
          await this.database.runAsync("DELETE FROM subscriptions WHERE id = ?", id);
          return;
        }
        if (outbox) {
          await this.database.runAsync(
            `UPDATE sync_outbox SET operation_type = 'delete', payload_json = '{}',
              state = 'pending', attempt_count = 0, next_attempt_at = NULL,
              last_error_code = NULL WHERE operation_id = ?`,
            outbox.operation_id,
          );
        } else {
          await this.database.runAsync(
            `INSERT INTO sync_outbox (
              operation_id, idempotency_key, entity_type, entity_id, operation_type,
              base_revision, payload_json, dependency_ids_json, base_json, created_sequence
            ) VALUES (?, ?, 'subscription', ?, 'delete', ?, '{}', '[]', ?, ?)`,
            uuidSchema.parse(this.randomUuid()),
            uuidSchema.parse(this.randomUuid()),
            id,
            current.server_revision,
            JSON.stringify(subscriptionSnapshot(current)),
            await this.store.nextSequence(),
          );
        }
        await this.database.runAsync(
          "UPDATE subscriptions SET deleted_at = ?, sync_state = 'pending' WHERE id = ?",
          this.now().toISOString(),
          id,
        );
      });
    });
  }

  createEvent(value: CalendarEventInput): Promise<string> {
    const input = calendarEventInputSchema.parse(value);
    return this.writer.run(async () => {
      let entityId = "";
      await this.database.withTransactionAsync(async () => {
        await this.clientId();
        entityId = uuidSchema.parse(this.randomUuid());
        await this.database.runAsync(
          `INSERT INTO calendar_events (
            id, title, date, start_time, end_time, notes,
            server_revision, server_updated_at, deleted_at, sync_state
          ) VALUES (?, ?, ?, ?, ?, ?, 0, NULL, NULL, 'pending')`,
          entityId,
          input.title,
          input.date,
          input.startTime ?? null,
          input.endTime ?? null,
          input.notes ?? null,
        );
        await this.database.runAsync(
          `INSERT INTO sync_outbox (
            operation_id, idempotency_key, entity_type, entity_id, operation_type,
            base_revision, payload_json, dependency_ids_json, base_json, created_sequence
          ) VALUES (?, ?, 'event', ?, 'create', 0, ?, '[]', '{}', ?)`,
          uuidSchema.parse(this.randomUuid()),
          uuidSchema.parse(this.randomUuid()),
          entityId,
          JSON.stringify({
            title: input.title,
            date: input.date,
            startTime: input.startTime ?? null,
            endTime: input.endTime ?? null,
            notes: input.notes ?? null,
          }),
          await this.store.nextSequence(),
        );
      });
      return entityId;
    });
  }

  updateEvent(id: string, value: CalendarEventInput): Promise<void> {
    const update = calendarEventInputSchema.parse(value);
    return this.writer.run(async () => {
      await this.database.withTransactionAsync(async () => {
        const current = await this.store.currentEventById(id);
        if (current.sync_state === "failed" || current.sync_state === "conflicted") {
          throw new LocalMutationError(
            "Resolve this event's synchronization state before editing it.",
            "mutation_blocked",
          );
        }
        const outbox = await this.store.currentOutbox("event", id);
        if (outbox?.operation_type === "delete") {
          throw new LocalMutationError(
            "This event is already waiting to be deleted.",
            "mutation_blocked",
          );
        }
        if (outbox && (outbox.state !== "pending" || outbox.attempt_count > 0)) {
          throw new LocalMutationError(
            "Wait for the current synchronization attempt before editing this event.",
            "mutation_blocked",
          );
        }
        const merged = {
          title: update.title,
          date: update.date,
          startTime: update.startTime ?? null,
          endTime: update.endTime ?? null,
          notes: update.notes ?? null,
        };
        if (outbox) {
          await this.database.runAsync(
            `UPDATE sync_outbox SET payload_json = ?, state = 'pending', attempt_count = 0,
              next_attempt_at = NULL, last_error_code = NULL WHERE operation_id = ?`,
            JSON.stringify(merged),
            outbox.operation_id,
          );
        } else {
          await this.database.runAsync(
            `INSERT INTO sync_outbox (
              operation_id, idempotency_key, entity_type, entity_id, operation_type,
              base_revision, payload_json, dependency_ids_json, base_json, created_sequence
            ) VALUES (?, ?, 'event', ?, 'update', ?, ?, '[]', ?, ?)`,
            uuidSchema.parse(this.randomUuid()),
            uuidSchema.parse(this.randomUuid()),
            id,
            current.server_revision,
            JSON.stringify(merged),
            JSON.stringify(eventSnapshot(current)),
            await this.store.nextSequence(),
          );
        }
        await this.database.runAsync(
          `UPDATE calendar_events SET
            title = ?, date = ?, start_time = ?, end_time = ?, notes = ?, sync_state = 'pending'
           WHERE id = ?`,
          merged.title,
          merged.date,
          merged.startTime,
          merged.endTime,
          merged.notes,
          id,
        );
      });
    });
  }

  deleteEvent(id: string): Promise<void> {
    return this.writer.run(async () => {
      await this.database.withTransactionAsync(async () => {
        const current = await this.store.currentEventById(id);
        if (current.sync_state === "failed" || current.sync_state === "conflicted") {
          throw new LocalMutationError(
            "Resolve this event's synchronization state before deleting it.",
            "mutation_blocked",
          );
        }
        const outbox = await this.store.currentOutbox("event", id);
        if (outbox && (outbox.state !== "pending" || outbox.attempt_count > 0)) {
          throw new LocalMutationError(
            "Wait for the current synchronization attempt before deleting this event.",
            "mutation_blocked",
          );
        }
        if (current.server_revision === 0 && outbox?.operation_type === "create") {
          await this.database.runAsync(
            "DELETE FROM sync_outbox WHERE operation_id = ?",
            outbox.operation_id,
          );
          await this.database.runAsync("DELETE FROM calendar_events WHERE id = ?", id);
          return;
        }
        if (outbox) {
          await this.database.runAsync(
            `UPDATE sync_outbox SET operation_type = 'delete', payload_json = '{}',
              state = 'pending', attempt_count = 0, next_attempt_at = NULL,
              last_error_code = NULL WHERE operation_id = ?`,
            outbox.operation_id,
          );
        } else {
          await this.database.runAsync(
            `INSERT INTO sync_outbox (
              operation_id, idempotency_key, entity_type, entity_id, operation_type,
              base_revision, payload_json, dependency_ids_json, base_json, created_sequence
            ) VALUES (?, ?, 'event', ?, 'delete', ?, '{}', '[]', ?, ?)`,
            uuidSchema.parse(this.randomUuid()),
            uuidSchema.parse(this.randomUuid()),
            id,
            current.server_revision,
            JSON.stringify(eventSnapshot(current)),
            await this.store.nextSequence(),
          );
        }
        await this.database.runAsync(
          "UPDATE calendar_events SET deleted_at = ?, sync_state = 'pending' WHERE id = ?",
          this.now().toISOString(),
          id,
        );
      });
    });
  }

  private archiveReferenceEntity(entityType: "account" | "category", id: string): Promise<void> {
    return this.writer.run(async () => {
      await this.database.withTransactionAsync(async () => {
        const current =
          entityType === "account"
            ? await this.store.currentAccount(id)
            : await this.store.currentCategory(id);
        if (current.system === 1) {
          throw new LocalMutationError(
            `Permanent ${entityType}s cannot be archived.`,
            "mutation_blocked",
          );
        }
        if (current.sync_state === "failed" || current.sync_state === "conflicted") {
          throw new LocalMutationError(
            `Resolve this ${entityType}'s synchronization state before archiving it.`,
            "mutation_blocked",
          );
        }
        const outbox = await this.store.currentOutbox(entityType, id);
        if (outbox && (outbox.state !== "pending" || outbox.attempt_count > 0)) {
          throw new LocalMutationError(
            `Wait for the current synchronization attempt before archiving this ${entityType}.`,
            "mutation_blocked",
          );
        }
        if (current.server_revision === 0 && outbox?.operation_type === "create") {
          await this.store.assertNoOutboxDependents(outbox.operation_id);
          await this.database.runAsync(
            "DELETE FROM sync_outbox WHERE operation_id = ?",
            outbox.operation_id,
          );
          await this.database.runAsync(
            `DELETE FROM ${syncEntityTable(entityType)} WHERE id = ?`,
            id,
          );
          return;
        }
        if (outbox) {
          await this.database.runAsync(
            `UPDATE sync_outbox SET operation_type = 'delete', payload_json = '{}',
              state = 'pending', attempt_count = 0, next_attempt_at = NULL,
              last_error_code = NULL WHERE operation_id = ?`,
            outbox.operation_id,
          );
        } else {
          await this.database.runAsync(
            `INSERT INTO sync_outbox (
              operation_id, idempotency_key, entity_type, entity_id, operation_type,
              base_revision, payload_json, dependency_ids_json, base_json, created_sequence
            ) VALUES (?, ?, ?, ?, 'delete', ?, '{}', '[]', ?, ?)`,
            uuidSchema.parse(this.randomUuid()),
            uuidSchema.parse(this.randomUuid()),
            entityType,
            id,
            current.server_revision,
            JSON.stringify(
              entityType === "account"
                ? accountSnapshot(current as z.infer<typeof accountRowSchema>)
                : categorySnapshot(current as z.infer<typeof categoryRowSchema>),
            ),
            await this.store.nextSequence(),
          );
        }
        await this.database.runAsync(
          `UPDATE ${syncEntityTable(entityType)} SET archived = 1, sync_state = 'pending' WHERE id = ?`,
          id,
        );
      });
    });
  }

  /** Writes one ordinary transaction while the caller owns the SQLite transaction. */
  private async createNonTransfer(input: NonTransferInput): Promise<string> {
    const dependencyIds = await validateLocalReferences(this.database, input, true);
    await this.clientId();
    const transactionId = uuidSchema.parse(this.randomUuid());
    const operationId = uuidSchema.parse(this.randomUuid());
    const idempotencyKey = uuidSchema.parse(this.randomUuid());
    const sequence = await this.store.nextSequence();
    await this.database.runAsync(
      `INSERT INTO transactions (
        id, account_id, category_id, date, description, amount_minor, currency, kind,
        notes, server_revision, server_updated_at, deleted_at, sync_state
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, NULL, 'pending')`,
      transactionId,
      input.accountId,
      input.categoryId,
      input.date,
      input.description,
      normalizeSignedAmount(input.amountMinor, input.kind),
      input.currency,
      input.kind,
      input.notes || null,
    );
    await this.database.runAsync(
      `INSERT INTO sync_outbox (
        operation_id, idempotency_key, entity_type, entity_id, operation_type,
        base_revision, payload_json, dependency_ids_json, base_json, created_sequence
      ) VALUES (?, ?, 'transaction', ?, 'create', 0, ?, ?, '{}', ?)`,
      operationId,
      idempotencyKey,
      transactionId,
      JSON.stringify(input),
      JSON.stringify(dependencyIds),
      sequence,
    );
    return transactionId;
  }

  /**
   * Persists a reviewed receipt's entries as one local operation: either every
   * line and its outbox record exist, or none do.
   */
  createTransactions(values: NonTransferInput[]): Promise<string[]> {
    const inputs = z
      .array(transactionInputSchema)
      .min(1, "Add at least one receipt item.")
      .max(30, "A receipt can contain at most 30 items.")
      .parse(values)
      .map((input) => {
        if (input.kind === "transfer") {
          throw new LocalMutationError(
            "Receipt items must be income or expense transactions.",
            "mutation_blocked",
          );
        }
        return input;
      });
    return this.writer.run(async () => {
      const transactionIds: string[] = [];
      await this.database.withTransactionAsync(async () => {
        for (const input of inputs) transactionIds.push(await this.createNonTransfer(input));
      });
      return transactionIds;
    });
  }

  createTransaction(value: TransactionInput): Promise<string> {
    const input = transactionInputSchema.parse(value);
    return this.writer.run(async () => {
      let transactionId = "";
      await this.database.withTransactionAsync(async () => {
        if (input.kind === "transfer") {
          await this.store.validateTransferReferences(input);
          await this.clientId();
          const groupId = uuidSchema.parse(this.randomUuid());
          const fromId = uuidSchema.parse(this.randomUuid());
          const toId = uuidSchema.parse(this.randomUuid());
          const operationId = uuidSchema.parse(this.randomUuid());
          const idempotencyKey = uuidSchema.parse(this.randomUuid());
          const [fromLeg, toLeg] = buildTransferLegs(input);
          const sequence = await this.store.nextSequence();
          for (const [id, leg] of [
            [fromId, fromLeg],
            [toId, toLeg],
          ] as const) {
            await this.database.runAsync(
              `INSERT INTO transactions (
                id, account_id, category_id, date, description, amount_minor, currency, kind,
                notes, transfer_group_id, transfer_fee_minor, server_revision,
                server_updated_at, deleted_at, sync_state
              ) VALUES (?, ?, ?, ?, ?, ?, ?, 'transfer', ?, ?, ?, 0, NULL, NULL, 'pending')`,
              id,
              leg.accountId,
              input.categoryId,
              input.date,
              leg.description,
              leg.amountMinor,
              input.currency,
              input.notes || null,
              groupId,
              leg.transferFeeMinor,
            );
          }
          await this.database.runAsync(
            `INSERT INTO sync_outbox (
              operation_id, idempotency_key, entity_type, entity_id, operation_type,
              base_revision, payload_json, dependency_ids_json, base_json, created_sequence
            ) VALUES (?, ?, 'transfer', ?, 'create', 0, ?, '[]', '{}', ?)`,
            operationId,
            idempotencyKey,
            groupId,
            JSON.stringify({ fromTransactionId: fromId, toTransactionId: toId, transfer: input }),
            sequence,
          );
          transactionId = fromId;
          return;
        }
        transactionId = await this.createNonTransfer(asNonTransfer(input));
      });
      return transactionId;
    });
  }

  updateTransfer(id: string, value: TransferInput): Promise<void> {
    const input = transferInputSchema.parse(value);
    return this.writer.run(async () => {
      await this.database.withTransactionAsync(async () => {
        const pair = await this.store.currentTransfer(id);
        if (
          pair.from.deleted_at ||
          pair.to.deleted_at ||
          pair.from.sync_state === "failed" ||
          pair.to.sync_state === "failed" ||
          pair.from.sync_state === "conflicted" ||
          pair.to.sync_state === "conflicted"
        ) {
          throw new LocalMutationError(
            "Resolve this transfer's synchronization state before editing it.",
            "mutation_blocked",
          );
        }
        await this.store.validateTransferReferences(input);
        const outbox = await this.store.currentOutbox("transfer", pair.groupId);
        if (outbox?.operation_type === "delete") {
          throw new LocalMutationError(
            "This transfer is already waiting to be deleted.",
            "mutation_blocked",
          );
        }
        if (outbox && (outbox.state !== "pending" || outbox.attempt_count > 0)) {
          throw new LocalMutationError(
            "Wait for the current synchronization attempt before editing this transfer.",
            "mutation_blocked",
          );
        }
        if (outbox) {
          let payload: unknown;
          try {
            payload = JSON.parse(outbox.payload_json) as unknown;
          } catch {
            throw new LocalMutationError("The encrypted outbox is invalid.", "invalid_outbox");
          }
          const operation = mobileSyncPushOperationSchema.parse({
            operationId: outbox.operation_id,
            idempotencyKey: outbox.idempotency_key,
            entityType: "transfer",
            entityId: pair.groupId,
            operationType: outbox.operation_type,
            baseRevision: outbox.base_revision,
            dependencyIds: [],
            payload,
          });
          if (operation.entityType !== "transfer" || operation.operationType === "delete") {
            throw new LocalMutationError("The encrypted outbox is invalid.", "invalid_outbox");
          }
          await this.database.runAsync(
            `UPDATE sync_outbox SET payload_json = ?, state = 'pending', attempt_count = 0,
              next_attempt_at = NULL, last_error_code = NULL WHERE operation_id = ?`,
            JSON.stringify(
              operation.operationType === "create"
                ? { ...operation.payload, transfer: input }
                : { transfer: input },
            ),
            operation.operationId,
          );
        } else {
          await this.database.runAsync(
            `INSERT INTO sync_outbox (
              operation_id, idempotency_key, entity_type, entity_id, operation_type,
              base_revision, payload_json, dependency_ids_json, base_json, created_sequence
            ) VALUES (?, ?, 'transfer', ?, 'update', ?, ?, '[]', ?, ?)`,
            uuidSchema.parse(this.randomUuid()),
            uuidSchema.parse(this.randomUuid()),
            pair.groupId,
            pair.from.server_revision,
            JSON.stringify({ transfer: input }),
            JSON.stringify(transferSnapshot(pair)),
            await this.store.nextSequence(),
          );
        }
        const [fromLeg, toLeg] = buildTransferLegs(input);
        for (const [row, leg] of [
          [pair.from, fromLeg],
          [pair.to, toLeg],
        ] as const) {
          await this.database.runAsync(
            `UPDATE transactions SET account_id = ?, category_id = ?, date = ?,
              description = ?, amount_minor = ?, currency = ?, notes = ?,
              transfer_fee_minor = ?, sync_state = 'pending' WHERE id = ?`,
            leg.accountId,
            input.categoryId,
            input.date,
            leg.description,
            leg.amountMinor,
            input.currency,
            input.notes || null,
            leg.transferFeeMinor,
            row.id,
          );
        }
      });
    });
  }

  updateTransaction(id: string, value: TransactionUpdate): Promise<void> {
    const update = transactionUpdateSchema.parse(value);
    return this.writer.run(async () => {
      await this.database.withTransactionAsync(async () => {
        const current = await this.store.currentTransaction(id);
        if (
          current.deleted_at ||
          current.sync_state === "failed" ||
          current.sync_state === "conflicted"
        ) {
          throw new LocalMutationError(
            "Resolve this transaction's synchronization state before editing it.",
            "mutation_blocked",
          );
        }
        const existing = commandFromRow(current);
        const merged = asNonTransfer(
          transactionInputSchema.parse({
            ...existing,
            ...update,
            amountMinor: Math.abs(update.amountMinor ?? existing.amountMinor),
            notes: update.notes !== undefined ? update.notes : existing.notes,
          }),
        );
        const outbox = await this.store.currentOutbox("transaction", id);
        if (outbox?.operation_type === "delete") {
          throw new LocalMutationError(
            "This transaction is already waiting to be deleted.",
            "mutation_blocked",
          );
        }
        if (outbox && (outbox.state !== "pending" || outbox.attempt_count > 0)) {
          throw new LocalMutationError(
            "Wait for the current synchronization attempt before editing this transaction.",
            "mutation_blocked",
          );
        }
        const dependencyIds = await validateLocalReferences(
          this.database,
          merged,
          current.server_revision === 0 && outbox?.operation_type === "create",
        );
        if (outbox) {
          await this.database.runAsync(
            `UPDATE sync_outbox
             SET payload_json = ?, dependency_ids_json = ?, state = 'pending', attempt_count = 0,
                 next_attempt_at = NULL, last_error_code = NULL
             WHERE operation_id = ?`,
            JSON.stringify(outbox.operation_type === "create" ? merged : fullUpdate(merged)),
            JSON.stringify(dependencyIds),
            outbox.operation_id,
          );
        } else {
          const operationId = uuidSchema.parse(this.randomUuid());
          const idempotencyKey = uuidSchema.parse(this.randomUuid());
          await this.database.runAsync(
            `INSERT INTO sync_outbox (
              operation_id, idempotency_key, entity_type, entity_id, operation_type,
              base_revision, payload_json, dependency_ids_json, base_json, created_sequence
            ) VALUES (?, ?, 'transaction', ?, 'update', ?, ?, '[]', ?, ?)`,
            operationId,
            idempotencyKey,
            id,
            current.server_revision,
            JSON.stringify(fullUpdate(merged)),
            JSON.stringify(snapshotFromRow(current)),
            await this.store.nextSequence(),
          );
        }
        await this.database.runAsync(
          `UPDATE transactions SET
            account_id = ?, category_id = ?, date = ?, description = ?, amount_minor = ?,
            currency = ?, kind = ?, notes = ?, sync_state = 'pending'
           WHERE id = ?`,
          merged.accountId,
          merged.categoryId,
          merged.date,
          merged.description,
          normalizeSignedAmount(merged.amountMinor, merged.kind),
          merged.currency,
          merged.kind,
          merged.notes || null,
          id,
        );
      });
    });
  }

  deleteTransaction(id: string): Promise<void> {
    return this.writer.run(async () => {
      await this.database.withTransactionAsync(async () => {
        const current = await this.store.currentTransaction(id);
        if (current.kind === "transfer" && current.transfer_group_id) {
          const pair = await this.store.currentTransfer(id);
          if (pair.from.deleted_at && pair.to.deleted_at) return;
          if (
            pair.from.sync_state === "failed" ||
            pair.to.sync_state === "failed" ||
            pair.from.sync_state === "conflicted" ||
            pair.to.sync_state === "conflicted"
          ) {
            throw new LocalMutationError(
              "Resolve this transfer's synchronization state before deleting it.",
              "mutation_blocked",
            );
          }
          const outbox = await this.store.currentOutbox("transfer", pair.groupId);
          if (outbox && (outbox.state !== "pending" || outbox.attempt_count > 0)) {
            throw new LocalMutationError(
              "Wait for the current synchronization attempt before deleting this transfer.",
              "mutation_blocked",
            );
          }
          if (pair.from.server_revision === 0 && outbox?.operation_type === "create") {
            await this.database.runAsync(
              "DELETE FROM sync_outbox WHERE operation_id = ?",
              outbox.operation_id,
            );
            await this.database.runAsync(
              "DELETE FROM transactions WHERE transfer_group_id = ?",
              pair.groupId,
            );
            return;
          }
          if (outbox) {
            await this.database.runAsync(
              `UPDATE sync_outbox SET operation_type = 'delete', payload_json = '{}',
                state = 'pending', attempt_count = 0, next_attempt_at = NULL,
                last_error_code = NULL WHERE operation_id = ?`,
              outbox.operation_id,
            );
          } else {
            await this.database.runAsync(
              `INSERT INTO sync_outbox (
                operation_id, idempotency_key, entity_type, entity_id, operation_type,
                base_revision, payload_json, dependency_ids_json, base_json, created_sequence
              ) VALUES (?, ?, 'transfer', ?, 'delete', ?, '{}', '[]', ?, ?)`,
              uuidSchema.parse(this.randomUuid()),
              uuidSchema.parse(this.randomUuid()),
              pair.groupId,
              pair.from.server_revision,
              JSON.stringify(transferSnapshot(pair)),
              await this.store.nextSequence(),
            );
          }
          await this.database.runAsync(
            `UPDATE transactions SET deleted_at = ?, sync_state = 'pending'
             WHERE transfer_group_id = ?`,
            this.now().toISOString(),
            pair.groupId,
          );
          return;
        }
        if (current.deleted_at) return;
        if (current.sync_state === "failed" || current.sync_state === "conflicted") {
          throw new LocalMutationError(
            "Resolve this transaction's synchronization state before deleting it.",
            "mutation_blocked",
          );
        }
        const outbox = await this.store.currentOutbox("transaction", id);
        if (outbox && (outbox.state !== "pending" || outbox.attempt_count > 0)) {
          throw new LocalMutationError(
            "Wait for the current synchronization attempt before deleting this transaction.",
            "mutation_blocked",
          );
        }
        if (current.server_revision === 0 && outbox?.operation_type === "create") {
          await this.database.runAsync(
            "DELETE FROM sync_outbox WHERE operation_id = ?",
            outbox.operation_id,
          );
          await this.database.runAsync("DELETE FROM transactions WHERE id = ?", id);
          return;
        }
        if (outbox) {
          await this.database.runAsync(
            `UPDATE sync_outbox
             SET operation_type = 'delete', payload_json = '{}', state = 'pending',
                 attempt_count = 0, next_attempt_at = NULL, last_error_code = NULL
             WHERE operation_id = ?`,
            outbox.operation_id,
          );
        } else {
          await this.database.runAsync(
            `INSERT INTO sync_outbox (
              operation_id, idempotency_key, entity_type, entity_id, operation_type,
              base_revision, payload_json, dependency_ids_json, base_json, created_sequence
            ) VALUES (?, ?, 'transaction', ?, 'delete', ?, '{}', '[]', ?, ?)`,
            uuidSchema.parse(this.randomUuid()),
            uuidSchema.parse(this.randomUuid()),
            id,
            current.server_revision,
            JSON.stringify(snapshotFromRow(current)),
            await this.store.nextSequence(),
          );
        }
        await this.database.runAsync(
          "UPDATE transactions SET deleted_at = ?, sync_state = 'pending' WHERE id = ?",
          this.now().toISOString(),
          id,
        );
      });
    });
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
