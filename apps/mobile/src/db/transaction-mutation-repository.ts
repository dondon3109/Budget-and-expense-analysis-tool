import * as Crypto from "expo-crypto";
import type { SQLiteDatabase } from "expo-sqlite";
import { z } from "zod";

import {
  MOBILE_SYNC_PROTOCOL_VERSION,
  accountInputSchema,
  accountUpdateSchema,
  categoryInputSchema,
  categoryUpdateSchema,
  mobileSyncPushOperationSchema,
  mobileSyncPushResponseSchema,
  mobileSyncTransactionSnapshotSchema,
  normalizeSignedAmount,
  transactionInputSchema,
  transactionUpdateSchema,
  type MobileSyncPushRequest,
  type MobileSyncPushOperation,
  type MobileSyncPushResponse,
  type AccountInput,
  type AccountUpdate,
  type CategoryInput,
  type CategoryUpdate,
  type TransactionInput,
  type TransactionUpdate,
} from "@zoption/shared";

import { LocalDatabaseWriter } from "./database-writer";

type NonTransferInput = Extract<TransactionInput, { kind: "income" | "expense" }>;

const uuidSchema = z.string().uuid();
const referenceRowSchema = z.object({
  category_kind: z.enum(["income", "expense", "transfer"]),
  category_archived: z.number().int().min(0).max(1),
  category_locked: z.number().int().min(0).max(1),
  category_server_revision: z.number().int().nonnegative(),
  account_archived: z.number().int().min(0).max(1),
  account_server_revision: z.number().int().nonnegative(),
});
const transactionRowSchema = z.object({
  id: z.string(),
  account_id: z.string().nullable(),
  category_id: z.string(),
  date: z.string(),
  description: z.string(),
  amount_minor: z.number().int().safe(),
  currency: z.enum(["PHP", "USD"]),
  kind: z.enum(["income", "expense", "transfer"]),
  notes: z.string().nullable(),
  transfer_group_id: z.string().nullable(),
  transfer_fee_minor: z.number().int().safe().nullable(),
  import_fingerprint: z.string().nullable(),
  server_revision: z.number().int().nonnegative(),
  server_updated_at: z.string().nullable(),
  deleted_at: z.string().nullable(),
  sync_state: z.enum(["synced", "pending", "failed", "conflicted"]),
});
const accountRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(["cash", "checking", "savings", "credit", "other"]),
  currency: z.enum(["PHP", "USD"]),
  archived: z.number().int().min(0).max(1),
  system: z.number().int().min(0).max(1),
  interest_json: z.string().nullable(),
  server_revision: z.number().int().nonnegative(),
  server_updated_at: z.string().nullable(),
  deleted_at: z.string().nullable(),
  sync_state: z.enum(["synced", "pending", "failed", "conflicted"]),
});
const categoryRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(["income", "expense", "transfer"]),
  color: z.string(),
  archived: z.number().int().min(0).max(1),
  system: z.number().int().min(0).max(1),
  origin: z.enum(["starter", "custom", "system"]),
  required_plan: z.enum(["free", "zoption_pro"]),
  locked: z.number().int().min(0).max(1),
  server_revision: z.number().int().nonnegative(),
  server_updated_at: z.string().nullable(),
  deleted_at: z.string().nullable(),
  sync_state: z.enum(["synced", "pending", "failed", "conflicted"]),
});
const outboxRowSchema = z.object({
  operation_id: uuidSchema,
  idempotency_key: uuidSchema,
  entity_type: z.enum(["account", "category", "transaction", "transfer"]),
  entity_id: z.string(),
  operation_type: z.enum(["create", "update", "delete"]),
  base_revision: z.number().int().nonnegative().nullable(),
  payload_json: z.string(),
  dependency_ids_json: z.string(),
  base_json: z.string(),
  state: z.enum(["pending", "sending", "retryable", "failed", "conflicted"]),
  attempt_count: z.number().int().nonnegative(),
});
const sequenceRowSchema = z.object({ next_sequence: z.number().int().positive() });
const pushScheduleRowSchema = z.object({
  outstanding_count: z.number().int().nonnegative(),
  blocked_count: z.number().int().nonnegative(),
  next_attempt_at: z.string().nullable(),
});
const conflictRowSchema = z.object({
  conflict_id: uuidSchema,
  operation_id: uuidSchema.nullable(),
  base_json: z.string(),
  local_json: z.string(),
  server_json: z.string(),
  server_revision: z.number().int().nonnegative(),
  created_at: z.string(),
});

export interface LocalPushSchedule {
  outstandingCount: number;
  blockedCount: number;
  nextAttemptAt: string | null;
}

export interface LocalTransactionConflictVersion {
  input: NonTransferInput;
  deleted: boolean;
}

export interface LocalTransactionConflict {
  id: string;
  entityId: string;
  local: LocalTransactionConflictVersion;
  server: LocalTransactionConflictVersion | null;
  serverRevision: number;
  createdAt: string;
}

export class LocalMutationError extends Error {
  constructor(
    message: string,
    readonly code:
      | "invalid_reference"
      | "unsupported_transfer"
      | "transaction_missing"
      | "account_missing"
      | "category_missing"
      | "name_conflict"
      | "mutation_blocked"
      | "invalid_outbox",
  ) {
    super(message);
    this.name = "LocalMutationError";
  }
}

function syncEntityTable(entityType: MobileSyncPushOperation["entityType"]): string {
  switch (entityType) {
    case "account":
      return "accounts";
    case "category":
      return "categories";
    case "transaction":
      return "transactions";
  }
}

function accountSnapshot(row: z.infer<typeof accountRowSchema>): Record<string, unknown> {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    currency: row.currency,
    archived: row.archived === 1,
    system: row.system === 1,
    interest: row.interest_json
      ? (JSON.parse(row.interest_json) as unknown)
      : { enabled: false, annualRateBasisPoints: null, frequency: null, payDay: null },
    revision: row.server_revision,
    updatedAt: row.server_updated_at,
  };
}

function categorySnapshot(row: z.infer<typeof categoryRowSchema>): Record<string, unknown> {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    color: row.color,
    archived: row.archived === 1,
    system: row.system === 1,
    origin: row.origin,
    requiredPlan: row.required_plan,
    locked: row.locked === 1,
    revision: row.server_revision,
    updatedAt: row.server_updated_at,
  };
}

function asNonTransfer(input: TransactionInput): NonTransferInput {
  if (input.kind === "transfer") {
    throw new LocalMutationError(
      "Offline transfers will be enabled only with the atomic transfer protocol.",
      "unsupported_transfer",
    );
  }
  return input;
}

function commandFromRow(row: z.infer<typeof transactionRowSchema>): NonTransferInput {
  if (row.kind === "transfer" || !row.account_id) {
    throw new LocalMutationError(
      "This transaction cannot be edited safely with the current offline protocol.",
      "unsupported_transfer",
    );
  }
  return {
    kind: row.kind,
    accountId: row.account_id,
    categoryId: row.category_id,
    date: row.date,
    description: row.description,
    amountMinor: Math.abs(row.amount_minor),
    currency: row.currency,
    notes: row.notes ?? undefined,
  };
}

function snapshotFromRow(row: z.infer<typeof transactionRowSchema>): Record<string, unknown> {
  return {
    id: row.id,
    accountId: row.account_id,
    categoryId: row.category_id,
    date: row.date,
    description: row.description,
    amountMinor: row.amount_minor,
    currency: row.currency,
    kind: row.kind,
    notes: row.notes,
    transferGroupId: row.transfer_group_id,
    transferFeeMinor: row.transfer_fee_minor,
    importFingerprint: row.import_fingerprint,
    revision: row.server_revision,
    updatedAt: row.server_updated_at,
  };
}

function fullUpdate(input: NonTransferInput): TransactionUpdate {
  return {
    kind: input.kind,
    accountId: input.accountId,
    categoryId: input.categoryId,
    date: input.date,
    description: input.description,
    amountMinor: input.amountMinor,
    currency: input.currency,
    notes: input.notes ?? "",
  };
}

function commandFromSnapshot(value: unknown): NonTransferInput {
  const snapshot = mobileSyncTransactionSnapshotSchema.parse(value);
  if (snapshot.kind === "transfer" || !snapshot.accountId || snapshot.transferGroupId) {
    throw new LocalMutationError(
      "This conflict cannot be resolved with the non-transfer protocol.",
      "unsupported_transfer",
    );
  }
  return {
    kind: snapshot.kind,
    accountId: snapshot.accountId,
    categoryId: snapshot.categoryId,
    date: snapshot.date,
    description: snapshot.description,
    amountMinor: Math.abs(snapshot.amountMinor),
    currency: snapshot.currency,
    notes: snapshot.notes ?? undefined,
  };
}

async function validateLocalReferences(
  database: SQLiteDatabase,
  input: NonTransferInput,
): Promise<void> {
  const decoded = referenceRowSchema.safeParse(
    await database.getFirstAsync(
      `SELECT
        category.kind AS category_kind,
        category.archived AS category_archived,
        category.locked AS category_locked,
        category.server_revision AS category_server_revision,
        account.archived AS account_archived,
        account.server_revision AS account_server_revision
       FROM categories category
       INNER JOIN accounts account ON account.id = ? AND account.deleted_at IS NULL
       WHERE category.id = ? AND category.deleted_at IS NULL`,
      input.accountId,
      input.categoryId,
    ),
  );
  if (
    !decoded.success ||
    decoded.data.category_archived === 1 ||
    decoded.data.account_archived === 1 ||
    decoded.data.category_locked === 1 ||
    decoded.data.category_server_revision === 0 ||
    decoded.data.account_server_revision === 0 ||
    decoded.data.category_kind !== input.kind
  ) {
    throw new LocalMutationError(
      "Choose an active account and an available category of the same type.",
      "invalid_reference",
    );
  }
}

export class LocalTransactionMutationRepository {
  constructor(
    private readonly database: SQLiteDatabase,
    private readonly writer = new LocalDatabaseWriter(),
    private readonly randomUuid: () => string = Crypto.randomUUID,
    private readonly now: () => Date = () => new Date(),
    private readonly random: () => number = Math.random,
  ) {}

  private async clientId(): Promise<string> {
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

  private async nextSequence(): Promise<number> {
    return sequenceRowSchema.parse(
      await this.database.getFirstAsync(
        "SELECT COALESCE(MAX(created_sequence), 0) + 1 AS next_sequence FROM sync_outbox",
      ),
    ).next_sequence;
  }

  private async currentAccount(id: string) {
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

  private async currentCategory(id: string) {
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

  private async assertUniqueName(
    entityType: "account" | "category",
    name: string,
    excludeId?: string,
  ): Promise<void> {
    const table = entityType === "account" ? "accounts" : "categories";
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

  private async currentTransaction(id: string) {
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

  private async currentOutbox(entityType: MobileSyncPushOperation["entityType"], entityId: string) {
    const row = await this.database.getFirstAsync(
      `SELECT operation_id, idempotency_key, entity_type, entity_id, operation_type,
        base_revision, payload_json, dependency_ids_json, base_json, state, attempt_count
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

  private async currentConflict(entityId: string) {
    const decoded = conflictRowSchema.safeParse(
      await this.database.getFirstAsync(
        `SELECT conflict_id, operation_id, base_json, local_json, server_json,
          server_revision, created_at
         FROM sync_conflicts
         WHERE entity_type = 'transaction' AND entity_id = ? AND resolved_at IS NULL
         ORDER BY created_at DESC
         LIMIT 1`,
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

  createAccount(value: AccountInput): Promise<string> {
    const input = accountInputSchema.parse(value);
    return this.writer.run(async () => {
      let entityId = "";
      await this.database.withTransactionAsync(async () => {
        await this.assertUniqueName("account", input.name);
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
          await this.nextSequence(),
        );
      });
      return entityId;
    });
  }

  updateAccount(id: string, value: AccountUpdate): Promise<void> {
    const update = accountUpdateSchema.parse(value);
    return this.writer.run(async () => {
      await this.database.withTransactionAsync(async () => {
        const current = await this.currentAccount(id);
        if (current.sync_state === "failed" || current.sync_state === "conflicted") {
          throw new LocalMutationError(
            "Resolve this account's synchronization state before editing it.",
            "mutation_blocked",
          );
        }
        if (current.system === 1 && update.name !== current.name) {
          throw new LocalMutationError("Permanent accounts cannot be renamed.", "mutation_blocked");
        }
        await this.assertUniqueName("account", update.name, id);
        const outbox = await this.currentOutbox("account", id);
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
        const next: AccountInput = {
          name: update.name,
          type: update.type ?? current.type,
        };
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
            await this.nextSequence(),
          );
        }
        await this.database.runAsync(
          "UPDATE accounts SET name = ?, type = ?, sync_state = 'pending' WHERE id = ?",
          next.name,
          next.type,
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
        await this.assertUniqueName("category", input.name);
        await this.clientId();
        entityId = uuidSchema.parse(this.randomUuid());
        await this.database.runAsync(
          `INSERT INTO categories (
            id, name, kind, color, archived, system, origin, required_plan, locked,
            server_revision, server_updated_at, deleted_at, sync_state
          ) VALUES (?, ?, ?, ?, 0, 0, 'custom', 'free', 0, 0, NULL, NULL, 'pending')`,
          entityId,
          input.name,
          input.kind,
          input.color,
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
          await this.nextSequence(),
        );
      });
      return entityId;
    });
  }

  updateCategory(id: string, value: CategoryUpdate): Promise<void> {
    const update = categoryUpdateSchema.parse(value);
    return this.writer.run(async () => {
      await this.database.withTransactionAsync(async () => {
        const current = await this.currentCategory(id);
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
          ...(update.archived !== undefined ? { archived: update.archived } : {}),
        };
        if (next.name) await this.assertUniqueName("category", next.name, id);
        const outbox = await this.currentOutbox("category", id);
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
              archived: next.archived ?? current.archived === 1,
            }),
            JSON.stringify(categorySnapshot(current)),
            await this.nextSequence(),
          );
        }
        await this.database.runAsync(
          `UPDATE categories SET name = ?, color = ?, archived = ?, sync_state = 'pending'
           WHERE id = ?`,
          merged.name,
          merged.color,
          (next.archived ?? current.archived === 1) ? 1 : 0,
          id,
        );
      });
    });
  }

  archiveCategory(id: string): Promise<void> {
    return this.archiveReferenceEntity("category", id);
  }

  private archiveReferenceEntity(entityType: "account" | "category", id: string): Promise<void> {
    return this.writer.run(async () => {
      await this.database.withTransactionAsync(async () => {
        const current =
          entityType === "account" ? await this.currentAccount(id) : await this.currentCategory(id);
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
        const outbox = await this.currentOutbox(entityType, id);
        if (outbox && (outbox.state !== "pending" || outbox.attempt_count > 0)) {
          throw new LocalMutationError(
            `Wait for the current synchronization attempt before archiving this ${entityType}.`,
            "mutation_blocked",
          );
        }
        if (current.server_revision === 0 && outbox?.operation_type === "create") {
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
            await this.nextSequence(),
          );
        }
        await this.database.runAsync(
          `UPDATE ${syncEntityTable(entityType)} SET archived = 1, sync_state = 'pending' WHERE id = ?`,
          id,
        );
      });
    });
  }

  createTransaction(value: TransactionInput): Promise<string> {
    const input = asNonTransfer(transactionInputSchema.parse(value));
    return this.writer.run(async () => {
      let transactionId = "";
      await this.database.withTransactionAsync(async () => {
        await validateLocalReferences(this.database, input);
        await this.clientId();
        transactionId = uuidSchema.parse(this.randomUuid());
        const operationId = uuidSchema.parse(this.randomUuid());
        const idempotencyKey = uuidSchema.parse(this.randomUuid());
        const sequence = await this.nextSequence();
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
          ) VALUES (?, ?, 'transaction', ?, 'create', 0, ?, '[]', '{}', ?)`,
          operationId,
          idempotencyKey,
          transactionId,
          JSON.stringify(input),
          sequence,
        );
      });
      return transactionId;
    });
  }

  updateTransaction(id: string, value: TransactionUpdate): Promise<void> {
    const update = transactionUpdateSchema.parse(value);
    return this.writer.run(async () => {
      await this.database.withTransactionAsync(async () => {
        const current = await this.currentTransaction(id);
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
        await validateLocalReferences(this.database, merged);
        const outbox = await this.currentOutbox("transaction", id);
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
        if (outbox) {
          await this.database.runAsync(
            `UPDATE sync_outbox
             SET payload_json = ?, state = 'pending', attempt_count = 0,
                 next_attempt_at = NULL, last_error_code = NULL
             WHERE operation_id = ?`,
            JSON.stringify(outbox.operation_type === "create" ? merged : fullUpdate(merged)),
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
            await this.nextSequence(),
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
        const current = await this.currentTransaction(id);
        if (current.deleted_at) return;
        if (current.sync_state === "failed" || current.sync_state === "conflicted") {
          throw new LocalMutationError(
            "Resolve this transaction's synchronization state before deleting it.",
            "mutation_blocked",
          );
        }
        const outbox = await this.currentOutbox("transaction", id);
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
            await this.nextSequence(),
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

  async getPushBatch(limit = 50): Promise<MobileSyncPushRequest | null> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) {
      throw new Error("Choose a synchronization push size from 1 to 50.");
    }
    return this.writer.run(async () => {
      let request: MobileSyncPushRequest | null = null;
      await this.database.withTransactionAsync(async () => {
        const rows = await this.database.getAllAsync(
          `SELECT operation_id, idempotency_key, entity_type, entity_id, operation_type,
            base_revision, payload_json, dependency_ids_json, base_json, state, attempt_count
           FROM sync_outbox
           WHERE state = 'sending'
              OR (state IN ('pending', 'retryable')
                AND (next_attempt_at IS NULL OR next_attempt_at <= ?))
           ORDER BY CASE WHEN state = 'sending' THEN 0 ELSE 1 END, created_sequence
           LIMIT ?`,
          this.now().toISOString(),
          limit,
        );
        if (rows.length === 0) return;
        const operations = rows.map((value) => {
          const row = outboxRowSchema.parse(value);
          let payload: unknown;
          let dependencyIds: unknown;
          try {
            payload = JSON.parse(row.payload_json) as unknown;
            dependencyIds = JSON.parse(row.dependency_ids_json) as unknown;
          } catch {
            throw new LocalMutationError("The encrypted outbox is invalid.", "invalid_outbox");
          }
          return mobileSyncPushOperationSchema.parse({
            operationId: row.operation_id,
            idempotencyKey: row.idempotency_key,
            entityType: row.entity_type,
            entityId: row.entity_id,
            operationType: row.operation_type,
            baseRevision: row.base_revision,
            payload,
            dependencyIds,
          });
        });
        for (const operation of operations) {
          await this.database.runAsync(
            "UPDATE sync_outbox SET state = 'sending' WHERE operation_id = ?",
            operation.operationId,
          );
        }
        request = {
          protocolVersion: MOBILE_SYNC_PROTOCOL_VERSION,
          clientId: await this.clientId(),
          operations,
        };
      });
      return request;
    });
  }

  getPushSchedule(): Promise<LocalPushSchedule> {
    return this.writer.run(async () => {
      const row = pushScheduleRowSchema.parse(
        await this.database.getFirstAsync(
          `SELECT
            count(*) AS outstanding_count,
            coalesce(sum(CASE WHEN state IN ('failed', 'conflicted') THEN 1 ELSE 0 END), 0) AS blocked_count,
            min(CASE WHEN state = 'retryable' THEN next_attempt_at END) AS next_attempt_at
           FROM sync_outbox
           WHERE state IN ('pending', 'sending', 'retryable', 'failed', 'conflicted')`,
        ),
      );
      if (row.next_attempt_at !== null && !Number.isFinite(Date.parse(row.next_attempt_at))) {
        throw new LocalMutationError("The encrypted outbox is invalid.", "invalid_outbox");
      }
      return {
        outstandingCount: row.outstanding_count,
        blockedCount: row.blocked_count,
        nextAttemptAt: row.next_attempt_at,
      };
    });
  }

  getConflict(entityId: string): Promise<LocalTransactionConflict | null> {
    return this.writer.run(async () => {
      const row = await this.database.getFirstAsync(
        `SELECT conflict_id, operation_id, base_json, local_json, server_json,
          server_revision, created_at
         FROM sync_conflicts
         WHERE entity_type = 'transaction' AND entity_id = ? AND resolved_at IS NULL
         ORDER BY created_at DESC
         LIMIT 1`,
        entityId,
      );
      if (!row) return null;
      const conflict = conflictRowSchema.parse(row);
      const localRow = await this.currentTransaction(entityId);
      let serverValue: unknown;
      try {
        serverValue = JSON.parse(conflict.server_json) as unknown;
      } catch {
        throw new LocalMutationError("The preserved conflict is invalid.", "invalid_outbox");
      }
      return {
        id: conflict.conflict_id,
        entityId,
        local: {
          input: commandFromRow(localRow),
          deleted: localRow.deleted_at !== null,
        },
        server:
          serverValue === null
            ? null
            : {
                input: commandFromSnapshot(serverValue),
                deleted: false,
              },
        serverRevision: conflict.server_revision,
        createdAt: conflict.created_at,
      };
    });
  }

  resolveConflict(entityId: string, resolution: "keep_local" | "keep_server"): Promise<void> {
    return this.writer.run(async () => {
      await this.database.withTransactionAsync(async () => {
        const conflict = await this.currentConflict(entityId);
        const current = await this.currentTransaction(entityId);
        const outbox = await this.currentOutbox("transaction", entityId);
        if (
          !outbox ||
          outbox.operation_id !== conflict.operation_id ||
          outbox.state !== "conflicted"
        ) {
          throw new LocalMutationError(
            "The preserved conflict changed before it could be resolved.",
            "mutation_blocked",
          );
        }
        let serverValue: unknown;
        try {
          serverValue = JSON.parse(conflict.server_json) as unknown;
        } catch {
          throw new LocalMutationError("The preserved conflict is invalid.", "invalid_outbox");
        }
        const serverSnapshot =
          serverValue === null ? null : mobileSyncTransactionSnapshotSchema.parse(serverValue);

        await this.database.runAsync(
          `UPDATE sync_conflicts
           SET resolved_at = ?, resolution = ?, operation_id = NULL
           WHERE conflict_id = ? AND resolved_at IS NULL`,
          this.now().toISOString(),
          resolution,
          conflict.conflict_id,
        );
        await this.database.runAsync(
          "DELETE FROM sync_outbox WHERE operation_id = ?",
          outbox.operation_id,
        );

        if (resolution === "keep_server") {
          if (!serverSnapshot) {
            await this.database.runAsync("DELETE FROM transactions WHERE id = ?", entityId);
            return;
          }
          await this.database.runAsync(
            `UPDATE transactions SET
              account_id = ?, category_id = ?, date = ?, description = ?, amount_minor = ?,
              currency = ?, kind = ?, notes = ?, transfer_group_id = ?,
              transfer_fee_minor = ?, import_fingerprint = ?, server_revision = ?,
              server_updated_at = ?, deleted_at = NULL, sync_state = 'synced'
             WHERE id = ?`,
            serverSnapshot.accountId,
            serverSnapshot.categoryId,
            serverSnapshot.date,
            serverSnapshot.description,
            serverSnapshot.amountMinor,
            serverSnapshot.currency,
            serverSnapshot.kind,
            serverSnapshot.notes,
            serverSnapshot.transferGroupId,
            serverSnapshot.transferFeeMinor,
            serverSnapshot.importFingerprint,
            serverSnapshot.revision,
            serverSnapshot.updatedAt,
            entityId,
          );
          return;
        }

        if (current.deleted_at && !serverSnapshot) {
          await this.database.runAsync("DELETE FROM transactions WHERE id = ?", entityId);
          return;
        }

        const operationId = uuidSchema.parse(this.randomUuid());
        const idempotencyKey = uuidSchema.parse(this.randomUuid());
        const operationType = current.deleted_at ? "delete" : serverSnapshot ? "update" : "create";
        const localInput = commandFromRow(current);
        const payload =
          operationType === "delete"
            ? {}
            : operationType === "update"
              ? fullUpdate(localInput)
              : localInput;
        await this.database.runAsync(
          `INSERT INTO sync_outbox (
            operation_id, idempotency_key, entity_type, entity_id, operation_type,
            base_revision, payload_json, dependency_ids_json, base_json, created_sequence
          ) VALUES (?, ?, 'transaction', ?, ?, ?, ?, '[]', ?, ?)`,
          operationId,
          idempotencyKey,
          entityId,
          operationType,
          serverSnapshot?.revision ?? 0,
          JSON.stringify(payload),
          serverSnapshot ? JSON.stringify(serverSnapshot) : "{}",
          await this.nextSequence(),
        );
        await this.database.runAsync(
          "UPDATE transactions SET sync_state = 'pending' WHERE id = ?",
          entityId,
        );
      });
    });
  }

  applyPushResponse(request: MobileSyncPushRequest, value: MobileSyncPushResponse): Promise<void> {
    const response = mobileSyncPushResponseSchema.parse(value);
    const operations = new Map(
      request.operations.map((operation) => [operation.operationId, operation]),
    );
    if (operations.size !== response.results.length) {
      throw new LocalMutationError("The push result did not match its request.", "invalid_outbox");
    }
    for (const result of response.results) {
      const operation = operations.get(result.operationId);
      if (
        !operation ||
        operation.entityType !== result.entityType ||
        operation.entityId !== result.entityId
      ) {
        throw new LocalMutationError(
          "The push result did not match its request.",
          "invalid_outbox",
        );
      }
      operations.delete(result.operationId);
    }
    if (operations.size > 0) {
      throw new LocalMutationError("The push result did not match its request.", "invalid_outbox");
    }

    return this.writer.run(async () => {
      await this.database.withTransactionAsync(async () => {
        for (const result of response.results) {
          const operation = request.operations.find(
            (item) => item.operationId === result.operationId,
          )!;
          const outbox = await this.currentOutbox(operation.entityType, operation.entityId);
          if (!outbox || outbox.operation_id !== operation.operationId) {
            throw new LocalMutationError(
              "The encrypted outbox changed before acknowledgement.",
              "invalid_outbox",
            );
          }
          if (result.status === "acknowledged") {
            await this.database.runAsync(
              `UPDATE ${syncEntityTable(result.entityType)}
               SET server_revision = ?, sync_state = 'synced' WHERE id = ?`,
              result.revision,
              result.entityId,
            );
            await this.database.runAsync(
              "DELETE FROM sync_outbox WHERE operation_id = ?",
              result.operationId,
            );
            continue;
          }
          if (result.status === "conflict") {
            await this.database.runAsync(
              `INSERT INTO sync_conflicts (
                conflict_id, entity_type, entity_id, operation_id, base_json, local_json,
                server_json, server_revision, created_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              uuidSchema.parse(this.randomUuid()),
              result.entityType,
              result.entityId,
              result.operationId,
              outbox.base_json,
              outbox.payload_json,
              JSON.stringify(result.serverPayload),
              result.serverRevision ?? 0,
              this.now().toISOString(),
            );
            await this.database.runAsync(
              "UPDATE sync_outbox SET state = 'conflicted', last_error_code = ? WHERE operation_id = ?",
              result.code,
              result.operationId,
            );
            await this.database.runAsync(
              `UPDATE ${syncEntityTable(result.entityType)}
               SET sync_state = 'conflicted' WHERE id = ?`,
              result.entityId,
            );
            continue;
          }
          await this.database.runAsync(
            "UPDATE sync_outbox SET state = 'failed', last_error_code = ? WHERE operation_id = ?",
            result.code,
            result.operationId,
          );
          await this.database.runAsync(
            `UPDATE ${syncEntityTable(result.entityType)} SET sync_state = 'failed' WHERE id = ?`,
            result.entityId,
          );
        }
      });
    });
  }

  recordPushFailure(
    request: MobileSyncPushRequest,
    code: string,
    retryAfterSeconds: number | null,
  ): Promise<void> {
    return this.writer.run(async () => {
      await this.database.withTransactionAsync(async () => {
        for (const operation of request.operations) {
          const outbox = await this.currentOutbox(operation.entityType, operation.entityId);
          if (!outbox || outbox.operation_id !== operation.operationId) continue;
          const exponentialCap = Math.min(15 * 2 ** outbox.attempt_count, 60 * 60);
          const delaySeconds = Math.min(
            retryAfterSeconds ?? this.random() * exponentialCap,
            24 * 60 * 60,
          );
          await this.database.runAsync(
            `UPDATE sync_outbox
             SET state = 'retryable', attempt_count = attempt_count + 1,
                 next_attempt_at = ?, last_error_code = ?
             WHERE operation_id = ?`,
            new Date(this.now().getTime() + delaySeconds * 1000).toISOString(),
            code,
            operation.operationId,
          );
        }
      });
    });
  }

  recordPushPermanentFailure(request: MobileSyncPushRequest, code: string): Promise<void> {
    return this.writer.run(async () => {
      await this.database.withTransactionAsync(async () => {
        for (const operation of request.operations) {
          const outbox = await this.currentOutbox(operation.entityType, operation.entityId);
          if (!outbox || outbox.operation_id !== operation.operationId) continue;
          await this.database.runAsync(
            "UPDATE sync_outbox SET state = 'failed', last_error_code = ? WHERE operation_id = ?",
            code,
            operation.operationId,
          );
          await this.database.runAsync(
            `UPDATE ${syncEntityTable(operation.entityType)}
             SET sync_state = 'failed' WHERE id = ?`,
            operation.entityId,
          );
        }
      });
    });
  }
}
