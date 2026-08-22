import type { SQLiteDatabase } from "expo-sqlite";
import { z } from "zod";

import {
  buildTransferLegs,
  type MobileSyncPushOperation,
  type SubscriptionInput,
  type TransferInput,
} from "@zoption/shared";

import {
  LocalMutationError,
  accountRowSchema,
  budgetRowSchema,
  categoryRowSchema,
  conflictRowSchema,
  debtRowSchema,
  eventRowSchema,
  goalRowSchema,
  outboxRowSchema,
  sequenceRowSchema,
  subscriptionRowSchema,
  transactionRowSchema,
  transferPairFromRows,
  uuidSchema,
  type LocalTransferPair,
} from "./model";

/** Database lookup and validation boundary shared by local mutation domains. */
export class LocalMutationStore {
  constructor(private readonly database: SQLiteDatabase) {}

  async nextSequence(): Promise<number> {
    return sequenceRowSchema.parse(
      await this.database.getFirstAsync(
        "SELECT COALESCE(MAX(created_sequence), 0) + 1 AS next_sequence FROM sync_outbox",
      ),
    ).next_sequence;
  }

  async currentAccount(id: string) {
    const decoded = accountRowSchema.safeParse(
      await this.database.getFirstAsync(
        `SELECT id, name, type, currency, archived, system, interest_json,
          server_revision, server_updated_at, deleted_at, sync_state
         FROM accounts WHERE id = ?`,
        id,
      ),
    );
    if (!decoded.success || decoded.data.deleted_at) {
      throw new LocalMutationError("Account not found on this device.", "account_missing");
    }
    return decoded.data;
  }

  async currentCategory(id: string) {
    const decoded = categoryRowSchema.safeParse(
      await this.database.getFirstAsync(
        `SELECT id, name, kind, color, archived, system, origin, required_plan, locked,
          server_revision, server_updated_at, deleted_at, sync_state
         FROM categories WHERE id = ?`,
        id,
      ),
    );
    if (!decoded.success || decoded.data.deleted_at) {
      throw new LocalMutationError("Category not found on this device.", "category_missing");
    }
    return decoded.data;
  }

  async currentBudget(month: string, categoryId: string) {
    const decoded = budgetRowSchema.safeParse(
      await this.database.getFirstAsync(
        `SELECT id, category_id, month, limit_minor, server_revision, server_updated_at,
          deleted_at, sync_state
         FROM budgets WHERE month = ? AND category_id = ? AND deleted_at IS NULL`,
        month,
        categoryId,
      ),
    );
    if (!decoded.success) return null;
    return decoded.data;
  }

  async currentBudgetById(id: string) {
    const decoded = budgetRowSchema.safeParse(
      await this.database.getFirstAsync(
        `SELECT id, category_id, month, limit_minor, server_revision, server_updated_at,
          deleted_at, sync_state
         FROM budgets WHERE id = ?`,
        id,
      ),
    );
    if (!decoded.success || decoded.data.deleted_at) {
      throw new LocalMutationError("Budget not found on this device.", "budget_missing");
    }
    return decoded.data;
  }

  async currentGoalById(id: string) {
    const decoded = goalRowSchema.safeParse(
      await this.database.getFirstAsync(
        `SELECT id, name, target_amount_minor, current_amount_minor, target_date, status,
          server_revision, server_updated_at, deleted_at, sync_state
         FROM financial_goals WHERE id = ?`,
        id,
      ),
    );
    if (!decoded.success || decoded.data.deleted_at) {
      throw new LocalMutationError("Goal not found on this device.", "goal_missing");
    }
    return decoded.data;
  }

  async currentGoalRowById(id: string) {
    const decoded = goalRowSchema.safeParse(
      await this.database.getFirstAsync(
        `SELECT id, name, target_amount_minor, current_amount_minor, target_date, status,
          server_revision, server_updated_at, deleted_at, sync_state
         FROM financial_goals WHERE id = ?`,
        id,
      ),
    );
    if (!decoded.success) {
      throw new LocalMutationError("Goal not found on this device.", "goal_missing");
    }
    return decoded.data;
  }

  async currentDebtById(id: string) {
    const decoded = debtRowSchema.safeParse(
      await this.database.getFirstAsync(
        `SELECT id, name, type, balance_minor, apr_basis_points, minimum_payment_minor,
          balance_as_of, status, server_revision, server_updated_at, deleted_at, sync_state
         FROM debts WHERE id = ?`,
        id,
      ),
    );
    if (!decoded.success || decoded.data.deleted_at) {
      throw new LocalMutationError("Debt not found on this device.", "debt_missing");
    }
    return decoded.data;
  }

  async currentDebtRowById(id: string) {
    const decoded = debtRowSchema.safeParse(
      await this.database.getFirstAsync(
        `SELECT id, name, type, balance_minor, apr_basis_points, minimum_payment_minor,
          balance_as_of, status, server_revision, server_updated_at, deleted_at, sync_state
         FROM debts WHERE id = ?`,
        id,
      ),
    );
    if (!decoded.success) {
      throw new LocalMutationError("Debt not found on this device.", "debt_missing");
    }
    return decoded.data;
  }

  async currentSubscriptionById(id: string) {
    const decoded = subscriptionRowSchema.safeParse(
      await this.database.getFirstAsync(
        `SELECT id, name, amount_minor, currency, billing_cycle, next_billing_date, status,
          category_id, account_id, server_revision, server_updated_at, deleted_at, sync_state
         FROM subscriptions WHERE id = ?`,
        id,
      ),
    );
    if (!decoded.success || decoded.data.deleted_at) {
      throw new LocalMutationError(
        "Subscription not found on this device.",
        "subscription_missing",
      );
    }
    return decoded.data;
  }

  async currentSubscriptionRowById(id: string) {
    const decoded = subscriptionRowSchema.safeParse(
      await this.database.getFirstAsync(
        `SELECT id, name, amount_minor, currency, billing_cycle, next_billing_date, status,
          category_id, account_id, server_revision, server_updated_at, deleted_at, sync_state
         FROM subscriptions WHERE id = ?`,
        id,
      ),
    );
    if (!decoded.success) {
      throw new LocalMutationError(
        "Subscription not found on this device.",
        "subscription_missing",
      );
    }
    return decoded.data;
  }

  async currentEventById(id: string) {
    const decoded = eventRowSchema.safeParse(
      await this.database.getFirstAsync(
        `SELECT id, title, date, start_time, end_time, notes,
          server_revision, server_updated_at, deleted_at, sync_state
         FROM calendar_events WHERE id = ?`,
        id,
      ),
    );
    if (!decoded.success || decoded.data.deleted_at) {
      throw new LocalMutationError("Event not found on this device.", "event_missing");
    }
    return decoded.data;
  }

  async currentEventRowById(id: string) {
    const decoded = eventRowSchema.safeParse(
      await this.database.getFirstAsync(
        `SELECT id, title, date, start_time, end_time, notes,
          server_revision, server_updated_at, deleted_at, sync_state
         FROM calendar_events WHERE id = ?`,
        id,
      ),
    );
    if (!decoded.success) {
      throw new LocalMutationError("Event not found on this device.", "event_missing");
    }
    return decoded.data;
  }

  async validateSubscriptionReferences(input: SubscriptionInput): Promise<void> {
    const [category, account] = await Promise.all([
      this.database.getFirstAsync<{ kind: string; archived: number; locked: number }>(
        `SELECT kind, archived, locked FROM categories WHERE id = ? LIMIT 1`,
        input.categoryId,
      ),
      this.database.getFirstAsync<{ archived: number }>(
        "SELECT archived FROM accounts WHERE id = ? LIMIT 1",
        input.accountId,
      ),
    ]);
    if (
      !category ||
      category.kind !== "expense" ||
      category.archived === 1 ||
      category.locked === 1
    ) {
      throw new LocalMutationError(
        "Choose an available expense category for this subscription.",
        "invalid_reference",
      );
    }
    if (!account || account.archived === 1) {
      throw new LocalMutationError(
        "Choose an active account for this subscription.",
        "invalid_reference",
      );
    }
  }

  async assertUniqueName(
    entityType: "account" | "category" | "goal" | "debt",
    name: string,
    excludeId?: string,
  ): Promise<void> {
    const table =
      entityType === "account"
        ? "accounts"
        : entityType === "category"
          ? "categories"
          : entityType === "goal"
            ? "financial_goals"
            : "debts";
    const duplicate = await this.database.getFirstAsync<{ id: string }>(
      `SELECT id FROM ${table}
       WHERE deleted_at IS NULL AND lower(name) = lower(?)${excludeId ? " AND id != ?" : ""}
       LIMIT 1`,
      name,
      ...(excludeId ? [excludeId] : []),
    );
    if (duplicate) {
      throw new LocalMutationError(
        `A ${entityType} with that name already exists on this device.`,
        "name_conflict",
      );
    }
  }

  async currentTransaction(id: string) {
    const row = await this.database.getFirstAsync(
      `SELECT id, account_id, category_id, date, description, amount_minor, currency, kind,
        notes, transfer_group_id, transfer_fee_minor, import_fingerprint, server_revision,
        server_updated_at, deleted_at, sync_state
       FROM transactions WHERE id = ?`,
      id,
    );
    const decoded = transactionRowSchema.safeParse(row);
    if (!decoded.success) {
      throw new LocalMutationError("Transaction not found on this device.", "transaction_missing");
    }
    return decoded.data;
  }

  async currentTransfer(id: string): Promise<LocalTransferPair> {
    const selected = await this.currentTransaction(id);
    if (selected.kind !== "transfer" || !selected.transfer_group_id) {
      throw new LocalMutationError("Transfer not found on this device.", "transaction_missing");
    }
    const rows = z.array(transactionRowSchema).parse(
      await this.database.getAllAsync(
        `SELECT id, account_id, category_id, date, description, amount_minor, currency, kind,
          notes, transfer_group_id, transfer_fee_minor, import_fingerprint, server_revision,
          server_updated_at, deleted_at, sync_state
         FROM transactions WHERE transfer_group_id = ? ORDER BY amount_minor, id`,
        selected.transfer_group_id,
      ),
    );
    return transferPairFromRows(rows);
  }

  async validateTransferReferences(input: TransferInput): Promise<void> {
    const [category, fromAccount, toAccount] = await Promise.all([
      this.currentCategory(input.categoryId),
      this.currentAccount(input.fromAccountId),
      this.currentAccount(input.toAccountId),
    ]);
    if (
      category.kind !== "transfer" ||
      category.archived === 1 ||
      category.locked === 1 ||
      category.server_revision < 1 ||
      fromAccount.archived === 1 ||
      fromAccount.server_revision < 1 ||
      toAccount.archived === 1 ||
      toAccount.server_revision < 1
    ) {
      throw new LocalMutationError(
        "Choose synchronized active accounts and an available transfer category.",
        "invalid_reference",
      );
    }
  }

  async replaceTransferRows(
    groupId: string,
    fromId: string,
    toId: string,
    input: TransferInput,
    serverRevision: number,
    serverUpdatedAt: string | null,
    syncState: "synced" | "pending",
  ): Promise<void> {
    await this.database.runAsync("DELETE FROM transactions WHERE transfer_group_id = ?", groupId);
    const [fromLeg, toLeg] = buildTransferLegs(input);
    for (const [id, leg] of [
      [fromId, fromLeg],
      [toId, toLeg],
    ] as const) {
      await this.database.runAsync(
        `INSERT INTO transactions (
          id, account_id, category_id, date, description, amount_minor, currency, kind,
          notes, transfer_group_id, transfer_fee_minor, server_revision,
          server_updated_at, deleted_at, sync_state
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'transfer', ?, ?, ?, ?, ?, NULL, ?)`,
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
        serverRevision,
        serverUpdatedAt,
        syncState,
      );
    }
  }

  async currentOutbox(entityType: MobileSyncPushOperation["entityType"], entityId: string) {
    const row = await this.database.getFirstAsync(
      `SELECT operation_id, idempotency_key, entity_type, entity_id, operation_type,
        base_revision, payload_json, dependency_ids_json, base_json, state, attempt_count,
        last_error_code
       FROM sync_outbox WHERE entity_type = ? AND entity_id = ?`,
      entityType,
      entityId,
    );
    if (!row) return null;
    const decoded = outboxRowSchema.safeParse(row);
    if (!decoded.success) {
      throw new LocalMutationError("The encrypted outbox is invalid.", "invalid_outbox");
    }
    return decoded.data;
  }

  async assertNoOutboxDependents(operationId: string): Promise<void> {
    const rows = await this.database.getAllAsync<{ dependency_ids_json: string }>(
      "SELECT dependency_ids_json FROM sync_outbox WHERE operation_id != ?",
      operationId,
    );
    for (const row of rows) {
      let dependencyIds: unknown;
      try {
        dependencyIds = JSON.parse(row.dependency_ids_json) as unknown;
      } catch {
        throw new LocalMutationError("The encrypted outbox is invalid.", "invalid_outbox");
      }
      if (z.array(uuidSchema).max(20).parse(dependencyIds).includes(operationId)) {
        throw new LocalMutationError(
          "Delete the dependent offline transaction before removing this new setup item.",
          "mutation_blocked",
        );
      }
    }
  }

  async currentConflict(
    entityType:
      | "account"
      | "category"
      | "transaction"
      | "transfer"
      | "budget"
      | "goal"
      | "debt"
      | "subscription"
      | "event",
    entityId: string,
  ) {
    const decoded = conflictRowSchema.safeParse(
      await this.database.getFirstAsync(
        `SELECT conflict_id, operation_id, base_json, local_json, server_json,
          server_revision, created_at
         FROM sync_conflicts
         WHERE entity_type = ? AND entity_id = ? AND resolved_at IS NULL
         ORDER BY created_at DESC
         LIMIT 1`,
        entityType,
        entityId,
      ),
    );
    if (!decoded.success) {
      throw new LocalMutationError(
        "No unresolved transaction conflict was found.",
        "mutation_blocked",
      );
    }
    return decoded.data;
  }
}
