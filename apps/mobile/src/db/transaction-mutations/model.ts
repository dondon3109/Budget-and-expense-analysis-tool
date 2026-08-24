import type { SQLiteDatabase } from "expo-sqlite";
import { z } from "zod";

import {
  mobileSyncTransactionSnapshotSchema,
  mobileSyncTransferSnapshotSchema,
  transferInputSchema,
  type MobileSyncPushOperation,
  type AccountInterestUpdate,
  type DebtStatus,
  type DebtType,
  type SubscriptionBillingCycle,
  type SubscriptionStatus,
  type FinancialGoalStatus,
  type TransactionInput,
  type TransactionUpdate,
  type TransferInput,
  type mobileSyncAccountSnapshotSchema,
  type mobileSyncCategorySnapshotSchema,
} from "@zoption/shared";

export type NonTransferInput = Extract<TransactionInput, { kind: "income" | "expense" }>;

export const uuidSchema = z.string().uuid();
export const referenceRowSchema = z.object({
  category_kind: z.enum(["income", "expense", "transfer"]),
  category_archived: z.number().int().min(0).max(1),
  category_locked: z.number().int().min(0).max(1),
  category_server_revision: z.number().int().nonnegative(),
  category_operation_id: uuidSchema.nullable(),
  category_operation_type: z.enum(["create", "update", "delete"]).nullable(),
  category_operation_state: z
    .enum(["pending", "sending", "retryable", "failed", "conflicted"])
    .nullable(),
  category_attempt_count: z.number().int().nonnegative().nullable(),
  account_archived: z.number().int().min(0).max(1),
  account_server_revision: z.number().int().nonnegative(),
  account_operation_id: uuidSchema.nullable(),
  account_operation_type: z.enum(["create", "update", "delete"]).nullable(),
  account_operation_state: z
    .enum(["pending", "sending", "retryable", "failed", "conflicted"])
    .nullable(),
  account_attempt_count: z.number().int().nonnegative().nullable(),
});
export const transactionRowSchema = z.object({
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
export type TransactionRow = z.infer<typeof transactionRowSchema>;

export interface LocalTransferPair {
  groupId: string;
  from: TransactionRow;
  to: TransactionRow;
  input: TransferInput;
}
export const accountRowSchema = z.object({
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
export const categoryRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(["income", "expense", "transfer"]),
  color: z.string(),
  icon_emoji: z.string().nullable().optional(),
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
export const budgetRowSchema = z.object({
  id: z.string(),
  category_id: z.string(),
  month: z.string(),
  limit_minor: z.number().int().safe(),
  server_revision: z.number().int().nonnegative(),
  server_updated_at: z.string().nullable(),
  deleted_at: z.string().nullable(),
  sync_state: z.enum(["synced", "pending", "failed", "conflicted"]),
});
export const goalRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  target_amount_minor: z.number().int().safe(),
  current_amount_minor: z.number().int().safe(),
  target_date: z.string(),
  status: z.enum(["active", "paused", "completed"]),
  server_revision: z.number().int().nonnegative(),
  server_updated_at: z.string().nullable(),
  deleted_at: z.string().nullable(),
  sync_state: z.enum(["synced", "pending", "failed", "conflicted"]),
});
export const subscriptionRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  amount_minor: z.number().int().safe(),
  currency: z.string(),
  billing_cycle: z.enum(["monthly", "yearly"]),
  next_billing_date: z.string(),
  status: z.enum(["active", "canceled"]),
  category_id: z.string().nullable(),
  account_id: z.string().nullable(),
  server_revision: z.number().int().nonnegative(),
  server_updated_at: z.string().nullable(),
  deleted_at: z.string().nullable(),
  sync_state: z.enum(["synced", "pending", "failed", "conflicted"]),
});
export const eventRowSchema = z.object({
  id: z.string(),
  title: z.string(),
  date: z.string(),
  start_time: z.string().nullable(),
  end_time: z.string().nullable(),
  notes: z.string().nullable(),
  server_revision: z.number().int().nonnegative(),
  server_updated_at: z.string().nullable(),
  deleted_at: z.string().nullable(),
  sync_state: z.enum(["synced", "pending", "failed", "conflicted"]),
});
export const debtRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(["credit_card", "personal_loan", "auto_loan", "mortgage", "other"]),
  balance_minor: z.number().int().safe(),
  apr_basis_points: z.number().int(),
  minimum_payment_minor: z.number().int().safe(),
  balance_as_of: z.string(),
  status: z.enum(["active", "paid"]),
  server_revision: z.number().int().nonnegative(),
  server_updated_at: z.string().nullable(),
  deleted_at: z.string().nullable(),
  sync_state: z.enum(["synced", "pending", "failed", "conflicted"]),
});
export const outboxRowSchema = z.object({
  operation_id: uuidSchema,
  idempotency_key: uuidSchema,
  entity_type: z.enum([
    "account",
    "category",
    "transaction",
    "transfer",
    "budget",
    "goal",
    "debt",
    "subscription",
    "event",
  ]),
  entity_id: z.string(),
  operation_type: z.enum(["create", "update", "delete"]),
  base_revision: z.number().int().nonnegative().nullable(),
  payload_json: z.string(),
  dependency_ids_json: z.string(),
  base_json: z.string(),
  state: z.enum(["pending", "sending", "retryable", "failed", "conflicted"]),
  attempt_count: z.number().int().nonnegative(),
  last_error_code: z.string().nullable().optional(),
});
export const outboxGraphRowSchema = z.object({
  operation_id: uuidSchema,
  dependency_ids_json: z.string(),
  state: z.enum(["pending", "sending", "retryable", "failed", "conflicted"]),
  next_attempt_at: z.string().nullable(),
  created_sequence: z.number().int().positive(),
});
export type OutboxGraphNode = z.infer<typeof outboxGraphRowSchema> & { dependencyIds: string[] };
export const sequenceRowSchema = z.object({ next_sequence: z.number().int().positive() });
export const pushScheduleRowSchema = z.object({
  outstanding_count: z.number().int().nonnegative(),
  blocked_count: z.number().int().nonnegative(),
  next_attempt_at: z.string().nullable(),
});
export const conflictRowSchema = z.object({
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
  input: TransactionInput;
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

export interface LocalReferenceConflictVersion {
  name: string;
  detail: string;
  color: string | null;
  archived: boolean;
}

export interface LocalReferenceConflict {
  id: string;
  entityType: "account" | "category";
  entityId: string;
  local: LocalReferenceConflictVersion;
  server: LocalReferenceConflictVersion | null;
  serverRevision: number;
  createdAt: string;
}

export interface LocalBudgetConflictVersion {
  month: string;
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  limitMinor: number;
}

export interface LocalBudgetConflict {
  id: string;
  entityId: string;
  local: LocalBudgetConflictVersion;
  server: LocalBudgetConflictVersion | null;
  serverRevision: number;
  createdAt: string;
}

export interface LocalGoalConflictVersion {
  name: string;
  targetAmountMinor: number;
  currentAmountMinor: number;
  targetDate: string;
  status: FinancialGoalStatus;
}

export interface LocalGoalConflict {
  id: string;
  entityId: string;
  local: LocalGoalConflictVersion;
  server: LocalGoalConflictVersion | null;
  serverRevision: number;
  createdAt: string;
}

export interface LocalDebtConflictVersion {
  name: string;
  type: DebtType;
  balanceMinor: number;
  aprBasisPoints: number;
  minimumPaymentMinor: number;
  balanceAsOf: string;
  status: DebtStatus;
}

export interface LocalSubscriptionConflictVersion {
  name: string;
  amountMinor: number;
  billingCycle: SubscriptionBillingCycle;
  nextBillingDate: string;
  status: SubscriptionStatus;
  categoryId: string | null;
  accountId: string | null;
}

export interface LocalSubscriptionConflict {
  id: string;
  entityId: string;
  local: LocalSubscriptionConflictVersion;
  server: LocalSubscriptionConflictVersion | null;
  serverRevision: number;
  createdAt: string;
}

export interface LocalEventConflictVersion {
  title: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  notes: string | null;
}

export interface LocalEventConflict {
  id: string;
  entityId: string;
  local: LocalEventConflictVersion;
  server: LocalEventConflictVersion | null;
  serverRevision: number;
  createdAt: string;
}

export interface LocalDebtConflict {
  id: string;
  entityId: string;
  local: LocalDebtConflictVersion;
  server: LocalDebtConflictVersion | null;
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
      | "budget_missing"
      | "goal_missing"
      | "debt_missing"
      | "subscription_missing"
      | "event_missing"
      | "name_conflict"
      | "mutation_blocked"
      | "invalid_outbox",
  ) {
    super(message);
    this.name = "LocalMutationError";
  }
}

export function syncEntityTable(entityType: MobileSyncPushOperation["entityType"]): string {
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
    case "subscription":
      return "subscriptions";
    case "event":
      return "calendar_events";
    case "transfer":
      throw new LocalMutationError(
        "Transfers update two transaction rows and do not have a single entity table.",
        "invalid_outbox",
      );
  }
}

export function accountSnapshot(row: z.infer<typeof accountRowSchema>): Record<string, unknown> {
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

export function categorySnapshot(row: z.infer<typeof categoryRowSchema>): Record<string, unknown> {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    color: row.color,
    iconEmoji: row.icon_emoji ?? null,
    archived: row.archived === 1,
    system: row.system === 1,
    origin: row.origin,
    requiredPlan: row.required_plan,
    locked: row.locked === 1,
    revision: row.server_revision,
    updatedAt: row.server_updated_at,
  };
}

export function budgetSnapshot(row: z.infer<typeof budgetRowSchema>): Record<string, unknown> {
  return {
    id: row.id,
    categoryId: row.category_id,
    month: row.month,
    limitMinor: row.limit_minor,
    revision: row.server_revision,
    updatedAt: row.server_updated_at,
  };
}

export function goalSnapshot(row: z.infer<typeof goalRowSchema>): Record<string, unknown> {
  return {
    id: row.id,
    name: row.name,
    targetAmountMinor: row.target_amount_minor,
    currentAmountMinor: row.current_amount_minor,
    targetDate: row.target_date,
    status: row.status,
    revision: row.server_revision,
    updatedAt: row.server_updated_at,
  };
}

export function debtSnapshot(row: z.infer<typeof debtRowSchema>): Record<string, unknown> {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    balanceMinor: row.balance_minor,
    aprBasisPoints: row.apr_basis_points,
    minimumPaymentMinor: row.minimum_payment_minor,
    balanceAsOf: row.balance_as_of,
    status: row.status,
    revision: row.server_revision,
    updatedAt: row.server_updated_at,
  };
}

export function subscriptionSnapshot(
  row: z.infer<typeof subscriptionRowSchema>,
): Record<string, unknown> {
  return {
    id: row.id,
    name: row.name,
    amountMinor: row.amount_minor,
    currency: row.currency,
    billingCycle: row.billing_cycle,
    nextBillingDate: row.next_billing_date,
    status: row.status,
    categoryId: row.category_id,
    accountId: row.account_id,
    revision: row.server_revision,
    updatedAt: row.server_updated_at,
  };
}

export function eventSnapshot(row: z.infer<typeof eventRowSchema>): Record<string, unknown> {
  return {
    id: row.id,
    title: row.title,
    date: row.date,
    startTime: row.start_time,
    endTime: row.end_time,
    notes: row.notes,
    revision: row.server_revision,
    updatedAt: row.server_updated_at,
  };
}

export const interestLocalSchema = z.object({
  enabled: z.boolean(),
  annualRateBasisPoints: z.number().int().min(0).max(1_000_000).nullable(),
  frequency: z.enum(["daily", "monthly", "yearly"]).nullable(),
  payDay: z.number().int().min(1).max(31).nullable(),
});

export function localInterestInput(json: string | null): AccountInterestUpdate | null {
  if (!json) return null;
  try {
    const parsed = interestLocalSchema.parse(JSON.parse(json) as unknown);
    if (!parsed.enabled) {
      return {
        enabled: false,
        annualRateBasisPoints: 0,
        frequency: parsed.frequency ?? "monthly",
        payDay: parsed.payDay ?? 15,
      };
    }
    return {
      enabled: true,
      annualRateBasisPoints: parsed.annualRateBasisPoints ?? 0,
      frequency: parsed.frequency ?? "monthly",
      payDay: parsed.payDay ?? null,
    };
  } catch {
    return null;
  }
}

export function accountConflictVersion(
  value:
    z.infer<typeof accountRowSchema> | ReturnType<typeof mobileSyncAccountSnapshotSchema.parse>,
): LocalReferenceConflictVersion {
  return {
    name: value.name,
    detail: `${value.type[0]!.toUpperCase()}${value.type.slice(1)} · ${value.currency}`,
    color: null,
    archived: typeof value.archived === "number" ? value.archived === 1 : value.archived,
  };
}

export function categoryConflictVersion(
  value:
    z.infer<typeof categoryRowSchema> | ReturnType<typeof mobileSyncCategorySnapshotSchema.parse>,
): LocalReferenceConflictVersion {
  return {
    name: value.name,
    detail: `${value.kind[0]!.toUpperCase()}${value.kind.slice(1)}`,
    color: value.color,
    archived: typeof value.archived === "number" ? value.archived === 1 : value.archived,
  };
}

export function asNonTransfer(input: TransactionInput): NonTransferInput {
  if (input.kind === "transfer") {
    throw new LocalMutationError(
      "Offline transfers will be enabled only with the atomic transfer protocol.",
      "unsupported_transfer",
    );
  }
  return input;
}

export function commandFromRow(row: z.infer<typeof transactionRowSchema>): NonTransferInput {
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

export function snapshotFromRow(
  row: z.infer<typeof transactionRowSchema>,
): Record<string, unknown> {
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

export function transferPairFromRows(rows: TransactionRow[]): LocalTransferPair {
  if (rows.length !== 2) {
    throw new LocalMutationError(
      "This transfer does not contain exactly two protected ledger rows.",
      "unsupported_transfer",
    );
  }
  const from = rows.find((row) => row.amount_minor < 0);
  const to = rows.find((row) => row.amount_minor > 0);
  const groupId = from?.transfer_group_id;
  if (
    !from ||
    !to ||
    !groupId ||
    to.transfer_group_id !== groupId ||
    !from.account_id ||
    !to.account_id ||
    from.server_revision !== to.server_revision ||
    from.category_id !== to.category_id ||
    from.date !== to.date ||
    from.description !== to.description ||
    from.currency !== to.currency ||
    (from.notes ?? "") !== (to.notes ?? "")
  ) {
    throw new LocalMutationError(
      "This transfer's ledger rows cannot be edited as one atomic operation.",
      "unsupported_transfer",
    );
  }
  const input = transferInputSchema.parse({
    kind: "transfer",
    fromAccountId: from.account_id,
    toAccountId: to.account_id,
    categoryId: from.category_id,
    date: from.date,
    description: from.description,
    amountMinor: Math.abs(from.amount_minor),
    transferFeeMinor: from.transfer_fee_minor ?? 0,
    currency: from.currency,
    notes: from.notes ?? undefined,
  });
  if (to.amount_minor !== input.amountMinor - (input.transferFeeMinor ?? 0)) {
    throw new LocalMutationError(
      "This transfer's fee and receiving amount do not balance.",
      "unsupported_transfer",
    );
  }
  return { groupId, from, to, input };
}

export function transferSnapshot(pair: LocalTransferPair): Record<string, unknown> {
  const updatedAt =
    [pair.from.server_updated_at, pair.to.server_updated_at]
      .filter((value): value is string => value !== null)
      .sort()
      .at(-1) ?? "1970-01-01 00:00:00";
  if (pair.from.server_revision < 1) {
    throw new LocalMutationError("The synchronized transfer base is incomplete.", "invalid_outbox");
  }
  return mobileSyncTransferSnapshotSchema.parse({
    id: pair.groupId,
    fromTransactionId: pair.from.id,
    toTransactionId: pair.to.id,
    fromAccountId: pair.input.fromAccountId,
    toAccountId: pair.input.toAccountId,
    categoryId: pair.input.categoryId,
    date: pair.input.date,
    description: pair.input.description?.trim() || "Transfer",
    amountMinor: pair.input.amountMinor,
    currency: pair.input.currency,
    notes: pair.input.notes ?? null,
    transferFeeMinor: pair.input.transferFeeMinor ?? 0,
    revision: pair.from.server_revision,
    updatedAt,
  });
}

export function fullUpdate(input: NonTransferInput): TransactionUpdate {
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

export function commandFromSnapshot(value: unknown): NonTransferInput {
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

export function transferCommandFromSnapshot(value: unknown): TransferInput {
  const snapshot = mobileSyncTransferSnapshotSchema.parse(value);
  return transferInputSchema.parse({
    kind: "transfer",
    fromAccountId: snapshot.fromAccountId,
    toAccountId: snapshot.toAccountId,
    categoryId: snapshot.categoryId,
    date: snapshot.date,
    description: snapshot.description,
    amountMinor: snapshot.amountMinor,
    transferFeeMinor: snapshot.transferFeeMinor,
    currency: snapshot.currency,
    notes: snapshot.notes ?? undefined,
  });
}

export async function validateLocalReferences(
  database: SQLiteDatabase,
  input: NonTransferInput,
  allowPendingCreates = false,
): Promise<string[]> {
  const decoded = referenceRowSchema.safeParse(
    await database.getFirstAsync(
      `SELECT
        category.kind AS category_kind,
        category.archived AS category_archived,
        category.locked AS category_locked,
        category.server_revision AS category_server_revision,
        category_operation.operation_id AS category_operation_id,
        category_operation.operation_type AS category_operation_type,
        category_operation.state AS category_operation_state,
        category_operation.attempt_count AS category_attempt_count,
        account.archived AS account_archived,
        account.server_revision AS account_server_revision,
        account_operation.operation_id AS account_operation_id,
        account_operation.operation_type AS account_operation_type,
        account_operation.state AS account_operation_state,
        account_operation.attempt_count AS account_attempt_count
       FROM categories category
       INNER JOIN accounts account ON account.id = ? AND account.deleted_at IS NULL
       LEFT JOIN sync_outbox category_operation
         ON category_operation.entity_type = 'category'
         AND category_operation.entity_id = category.id
       LEFT JOIN sync_outbox account_operation
         ON account_operation.entity_type = 'account'
         AND account_operation.entity_id = account.id
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
    decoded.data.category_kind !== input.kind
  ) {
    throw new LocalMutationError(
      "Choose an active account and an available category of the same type.",
      "invalid_reference",
    );
  }
  const pendingDependency = (
    revision: number,
    operationId: string | null,
    operationType: "create" | "update" | "delete" | null,
    state: "pending" | "sending" | "retryable" | "failed" | "conflicted" | null,
    attemptCount: number | null,
  ): string | null => {
    if (revision > 0) return null;
    if (
      !allowPendingCreates ||
      !operationId ||
      operationType !== "create" ||
      state !== "pending" ||
      attemptCount !== 0
    ) {
      throw new LocalMutationError(
        "Wait for the selected account and category to finish synchronizing.",
        "invalid_reference",
      );
    }
    return operationId;
  };
  return [
    pendingDependency(
      decoded.data.account_server_revision,
      decoded.data.account_operation_id,
      decoded.data.account_operation_type,
      decoded.data.account_operation_state,
      decoded.data.account_attempt_count,
    ),
    pendingDependency(
      decoded.data.category_server_revision,
      decoded.data.category_operation_id,
      decoded.data.category_operation_type,
      decoded.data.category_operation_state,
      decoded.data.category_attempt_count,
    ),
  ].filter((value): value is string => value !== null);
}
