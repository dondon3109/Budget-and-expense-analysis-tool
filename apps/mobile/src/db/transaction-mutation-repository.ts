import * as Crypto from "expo-crypto";
import type { SQLiteDatabase } from "expo-sqlite";
import { z } from "zod";

import {
  MOBILE_SYNC_PROTOCOL_VERSION,
  accountInputSchema,
  accountUpdateSchema,
  buildTransferLegs,
  calendarEventInputSchema,
  categoryInputSchema,
  categoryUpdateSchema,
  debtInputSchema,
  debtUpdateSchema,
  financialGoalInputSchema,
  financialGoalUpdateSchema,
  interestUpdateSchema,
  mobileSyncAccountSnapshotSchema,
  mobileSyncAccountUpdateSchema,
  mobileSyncBudgetSnapshotSchema,
  mobileSyncCategorySnapshotSchema,
  mobileSyncEventSnapshotSchema,
  mobileSyncDebtSnapshotSchema,
  mobileSyncGoalSnapshotSchema,
  mobileSyncPushOperationSchema,
  mobileSyncSubscriptionSnapshotSchema,
  mobileSyncSubscriptionUpdateSchema,
  mobileSyncPushRequestSchema,
  mobileSyncPushResponseSchema,
  mobileSyncTransactionSnapshotSchema,
  mobileSyncTransferSnapshotSchema,
  monthStartSchema,
  normalizeSignedAmount,
  resourceIdSchema,
  subscriptionInputSchema,
  transactionInputSchema,
  transactionUpdateSchema,
  transferInputSchema,
  type MobileSyncPushRequest,
  type MobileSyncPushOperation,
  type MobileSyncPushResponse,
  type AccountInput,
  type AccountInterestUpdate,
  type AccountUpdate,
  type CalendarEventInput,
  type CategoryInput,
  type CategoryUpdate,
  type DebtInput,
  type DebtStatus,
  type DebtType,
  type DebtUpdate,
  type FinancialGoalInput,
  type SubscriptionBillingCycle,
  type SubscriptionInput,
  type SubscriptionStatus,
  type FinancialGoalStatus,
  type FinancialGoalUpdate,
  type TransactionInput,
  type TransactionUpdate,
  type TransferInput,
} from "@zoption/shared";

import { LocalDatabaseWriter } from "./database-writer";

type NonTransferInput = Extract<TransactionInput, { kind: "income" | "expense" }>;

const uuidSchema = z.string().uuid();
const referenceRowSchema = z.object({
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
type TransactionRow = z.infer<typeof transactionRowSchema>;

interface LocalTransferPair {
  groupId: string;
  from: TransactionRow;
  to: TransactionRow;
  input: TransferInput;
}
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
const budgetRowSchema = z.object({
  id: z.string(),
  category_id: z.string(),
  month: z.string(),
  limit_minor: z.number().int().safe(),
  server_revision: z.number().int().nonnegative(),
  server_updated_at: z.string().nullable(),
  deleted_at: z.string().nullable(),
  sync_state: z.enum(["synced", "pending", "failed", "conflicted"]),
});
const goalRowSchema = z.object({
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
const subscriptionRowSchema = z.object({
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
const eventRowSchema = z.object({
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
const debtRowSchema = z.object({
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
const outboxRowSchema = z.object({
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
});
const outboxGraphRowSchema = z.object({
  operation_id: uuidSchema,
  dependency_ids_json: z.string(),
  state: z.enum(["pending", "sending", "retryable", "failed", "conflicted"]),
  next_attempt_at: z.string().nullable(),
  created_sequence: z.number().int().positive(),
});
type OutboxGraphNode = z.infer<typeof outboxGraphRowSchema> & { dependencyIds: string[] };
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

function syncEntityTable(entityType: MobileSyncPushOperation["entityType"]): string {
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

function budgetSnapshot(row: z.infer<typeof budgetRowSchema>): Record<string, unknown> {
  return {
    id: row.id,
    categoryId: row.category_id,
    month: row.month,
    limitMinor: row.limit_minor,
    revision: row.server_revision,
    updatedAt: row.server_updated_at,
  };
}

function goalSnapshot(row: z.infer<typeof goalRowSchema>): Record<string, unknown> {
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

function debtSnapshot(row: z.infer<typeof debtRowSchema>): Record<string, unknown> {
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

function subscriptionSnapshot(
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

function eventSnapshot(row: z.infer<typeof eventRowSchema>): Record<string, unknown> {
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

const interestLocalSchema = z.object({
  enabled: z.boolean(),
  annualRateBasisPoints: z.number().int().min(0).max(1_000_000).nullable(),
  frequency: z.enum(["daily", "monthly", "yearly"]).nullable(),
  payDay: z.number().int().min(1).max(31).nullable(),
});

function localInterestInput(json: string | null): AccountInterestUpdate | null {
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

function accountConflictVersion(
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

function categoryConflictVersion(
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

function transferPairFromRows(rows: TransactionRow[]): LocalTransferPair {
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

function transferSnapshot(pair: LocalTransferPair): Record<string, unknown> {
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

function transferCommandFromSnapshot(value: unknown): TransferInput {
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

async function validateLocalReferences(
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

export class LocalTransactionMutationRepository {
  constructor(
    private readonly database: SQLiteDatabase,
    private readonly writer = new LocalDatabaseWriter(),
    private readonly randomUuid: () => string = Crypto.randomUUID,
    private readonly now: () => Date = () => new Date(),
    private readonly random: () => number = Math.random,
  ) {}

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

  private async currentBudget(month: string, categoryId: string) {
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

  private async currentBudgetById(id: string) {
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

  private async currentGoalById(id: string) {
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

  private async currentGoalRowById(id: string) {
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

  private async currentDebtById(id: string) {
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

  private async currentDebtRowById(id: string) {
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

  private async currentSubscriptionById(id: string) {
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

  private async currentSubscriptionRowById(id: string) {
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

  private async currentEventById(id: string) {
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

  private async currentEventRowById(id: string) {
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

  private async validateSubscriptionReferences(input: SubscriptionInput): Promise<void> {
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

  private async assertUniqueName(
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

  private async currentTransfer(id: string): Promise<LocalTransferPair> {
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

  private async validateTransferReferences(input: TransferInput): Promise<void> {
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

  private async replaceTransferRows(
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

  private async assertNoOutboxDependents(operationId: string): Promise<void> {
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

  private async currentConflict(
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
        const pending = outbox
          ? mobileSyncAccountUpdateSchema.safeParse(JSON.parse(outbox.payload_json) as unknown)
          : null;
        const next: AccountInput & { interest?: AccountInterestUpdate } = {
          name: update.name,
          type: update.type ?? current.type,
        };
        if (pending?.success && pending.data.interest !== undefined) {
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

  updateAccountInterest(id: string, value: AccountInterestUpdate): Promise<void> {
    const interest = interestUpdateSchema.parse(value);
    return this.writer.run(async () => {
      await this.database.withTransactionAsync(async () => {
        const current = await this.currentAccount(id);
        if (current.sync_state === "failed" || current.sync_state === "conflicted") {
          throw new LocalMutationError(
            "Resolve this account's synchronization state before editing it.",
            "mutation_blocked",
          );
        }
        if (current.type !== "savings") {
          throw new LocalMutationError("Only savings accounts earn interest.", "mutation_blocked");
        }
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
            await this.nextSequence(),
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

  setBudgetLimit(month: string, categoryId: string, limitMinor: number): Promise<void> {
    const monthValue = monthStartSchema.parse(month);
    const category = resourceIdSchema.parse(categoryId);
    const limit = z
      .number()
      .int()
      .safe()
      .min(0)
      .max(1_000_000_000_00)
      .parse(limitMinor);
    return this.writer.run(async () => {
      await this.database.withTransactionAsync(async () => {
        await this.clientId();
        const categoryRow = await this.currentCategory(category);
        if (categoryRow.kind !== "expense" || categoryRow.archived === 1) {
          throw new LocalMutationError("Choose an active expense category.", "invalid_reference");
        }
        const existing = await this.currentBudget(monthValue, category);
        if (existing) {
          if (existing.sync_state === "failed" || existing.sync_state === "conflicted") {
            throw new LocalMutationError(
              "Resolve this budget's synchronization state before editing it.",
              "mutation_blocked",
            );
          }
          const outbox = await this.currentOutbox("budget", existing.id);
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
              await this.nextSequence(),
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
          await this.nextSequence(),
        );
      });
    });
  }

  createGoal(value: FinancialGoalInput): Promise<string> {
    const input = financialGoalInputSchema.parse(value);
    return this.writer.run(async () => {
      let entityId = "";
      await this.database.withTransactionAsync(async () => {
        await this.assertUniqueName("goal", input.name);
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
          await this.nextSequence(),
        );
      });
      return entityId;
    });
  }

  updateGoal(id: string, value: FinancialGoalUpdate): Promise<void> {
    const update = financialGoalUpdateSchema.parse(value);
    return this.writer.run(async () => {
      await this.database.withTransactionAsync(async () => {
        const current = await this.currentGoalById(id);
        if (current.sync_state === "failed" || current.sync_state === "conflicted") {
          throw new LocalMutationError(
            "Resolve this goal's synchronization state before editing it.",
            "mutation_blocked",
          );
        }
        const outbox = await this.currentOutbox("goal", id);
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
        if (update.name) await this.assertUniqueName("goal", update.name, id);
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
            await this.nextSequence(),
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
        const current = await this.currentGoalById(id);
        if (current.sync_state === "failed" || current.sync_state === "conflicted") {
          throw new LocalMutationError(
            "Resolve this goal's synchronization state before deleting it.",
            "mutation_blocked",
          );
        }
        const outbox = await this.currentOutbox("goal", id);
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
            await this.nextSequence(),
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
        await this.assertUniqueName("debt", input.name);
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
          await this.nextSequence(),
        );
      });
      return entityId;
    });
  }

  updateDebt(id: string, value: DebtUpdate): Promise<void> {
    const update = debtUpdateSchema.parse(value);
    return this.writer.run(async () => {
      await this.database.withTransactionAsync(async () => {
        const current = await this.currentDebtById(id);
        if (current.sync_state === "failed" || current.sync_state === "conflicted") {
          throw new LocalMutationError(
            "Resolve this debt's synchronization state before editing it.",
            "mutation_blocked",
          );
        }
        const outbox = await this.currentOutbox("debt", id);
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
        if (update.name) await this.assertUniqueName("debt", update.name, id);
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
            await this.nextSequence(),
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
        const current = await this.currentDebtById(id);
        if (current.sync_state === "failed" || current.sync_state === "conflicted") {
          throw new LocalMutationError(
            "Resolve this debt's synchronization state before deleting it.",
            "mutation_blocked",
          );
        }
        const outbox = await this.currentOutbox("debt", id);
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
            await this.nextSequence(),
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
        await this.validateSubscriptionReferences(input);
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
          await this.nextSequence(),
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
        const current = await this.currentSubscriptionById(id);
        if (current.sync_state === "failed" || current.sync_state === "conflicted") {
          throw new LocalMutationError(
            "Resolve this subscription's synchronization state before editing it.",
            "mutation_blocked",
          );
        }
        const outbox = await this.currentOutbox("subscription", id);
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
        await this.validateSubscriptionReferences(merged);
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
            await this.nextSequence(),
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
        const current = await this.currentSubscriptionById(id);
        if (current.sync_state === "failed" || current.sync_state === "conflicted") {
          throw new LocalMutationError(
            "Resolve this subscription's synchronization state before deleting it.",
            "mutation_blocked",
          );
        }
        const outbox = await this.currentOutbox("subscription", id);
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
            await this.nextSequence(),
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
          await this.nextSequence(),
        );
      });
      return entityId;
    });
  }

  updateEvent(id: string, value: CalendarEventInput): Promise<void> {
    const update = calendarEventInputSchema.parse(value);
    return this.writer.run(async () => {
      await this.database.withTransactionAsync(async () => {
        const current = await this.currentEventById(id);
        if (current.sync_state === "failed" || current.sync_state === "conflicted") {
          throw new LocalMutationError(
            "Resolve this event's synchronization state before editing it.",
            "mutation_blocked",
          );
        }
        const outbox = await this.currentOutbox("event", id);
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
            await this.nextSequence(),
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
        const current = await this.currentEventById(id);
        if (current.sync_state === "failed" || current.sync_state === "conflicted") {
          throw new LocalMutationError(
            "Resolve this event's synchronization state before deleting it.",
            "mutation_blocked",
          );
        }
        const outbox = await this.currentOutbox("event", id);
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
            await this.nextSequence(),
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
          await this.assertNoOutboxDependents(outbox.operation_id);
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
    const input = transactionInputSchema.parse(value);
    return this.writer.run(async () => {
      let transactionId = "";
      await this.database.withTransactionAsync(async () => {
        if (input.kind === "transfer") {
          await this.validateTransferReferences(input);
          await this.clientId();
          const groupId = uuidSchema.parse(this.randomUuid());
          const fromId = uuidSchema.parse(this.randomUuid());
          const toId = uuidSchema.parse(this.randomUuid());
          const operationId = uuidSchema.parse(this.randomUuid());
          const idempotencyKey = uuidSchema.parse(this.randomUuid());
          const [fromLeg, toLeg] = buildTransferLegs(input);
          const sequence = await this.nextSequence();
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
        const nonTransfer = asNonTransfer(input);
        const dependencyIds = await validateLocalReferences(this.database, nonTransfer, true);
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
          nonTransfer.accountId,
          nonTransfer.categoryId,
          nonTransfer.date,
          nonTransfer.description,
          normalizeSignedAmount(nonTransfer.amountMinor, nonTransfer.kind),
          nonTransfer.currency,
          nonTransfer.kind,
          nonTransfer.notes || null,
        );
        await this.database.runAsync(
          `INSERT INTO sync_outbox (
            operation_id, idempotency_key, entity_type, entity_id, operation_type,
            base_revision, payload_json, dependency_ids_json, base_json, created_sequence
          ) VALUES (?, ?, 'transaction', ?, 'create', 0, ?, ?, '{}', ?)`,
          operationId,
          idempotencyKey,
          transactionId,
          JSON.stringify(nonTransfer),
          JSON.stringify(dependencyIds),
          sequence,
        );
      });
      return transactionId;
    });
  }

  updateTransfer(id: string, value: TransferInput): Promise<void> {
    const input = transferInputSchema.parse(value);
    return this.writer.run(async () => {
      await this.database.withTransactionAsync(async () => {
        const pair = await this.currentTransfer(id);
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
        await this.validateTransferReferences(input);
        const outbox = await this.currentOutbox("transfer", pair.groupId);
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
            await this.nextSequence(),
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
        if (current.kind === "transfer" && current.transfer_group_id) {
          const pair = await this.currentTransfer(id);
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
          const outbox = await this.currentOutbox("transfer", pair.groupId);
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
              await this.nextSequence(),
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
        const graphRows = z.array(outboxGraphRowSchema).parse(
          await this.database.getAllAsync(
            `SELECT operation_id, dependency_ids_json, state, next_attempt_at, created_sequence
             FROM sync_outbox
             WHERE state IN ('pending', 'sending', 'retryable', 'failed', 'conflicted')
             ORDER BY CASE WHEN state = 'sending' THEN 0 ELSE 1 END, created_sequence`,
          ),
        );
        if (graphRows.length === 0) return;
        const nodes = new Map(
          graphRows.map((row) => {
            let dependencyIds: unknown;
            try {
              dependencyIds = JSON.parse(row.dependency_ids_json) as unknown;
            } catch {
              throw new LocalMutationError("The encrypted outbox is invalid.", "invalid_outbox");
            }
            return [
              row.operation_id,
              {
                ...row,
                dependencyIds: z.array(uuidSchema).max(20).parse(dependencyIds),
              },
            ] as const;
          }),
        );
        const adjacency = new Map(
          graphRows.map((row) => [row.operation_id, new Set<string>()] as const),
        );
        for (const node of nodes.values()) {
          for (const dependencyId of node.dependencyIds) {
            if (!nodes.has(dependencyId)) {
              throw new LocalMutationError(
                "An outbox dependency is missing from encrypted local storage.",
                "invalid_outbox",
              );
            }
            adjacency.get(node.operation_id)!.add(dependencyId);
            adjacency.get(dependencyId)!.add(node.operation_id);
          }
        }

        const visited = new Set<string>();
        const components: OutboxGraphNode[][] = [];
        for (const node of nodes.values()) {
          if (visited.has(node.operation_id)) continue;
          const component: OutboxGraphNode[] = [];
          const pending = [node.operation_id];
          visited.add(node.operation_id);
          while (pending.length > 0) {
            const operationId = pending.pop()!;
            const current = nodes.get(operationId)!;
            component.push(current);
            for (const relatedId of adjacency.get(operationId)!) {
              if (visited.has(relatedId)) continue;
              visited.add(relatedId);
              pending.push(relatedId);
            }
          }
          component.sort((left, right) => left.created_sequence - right.created_sequence);
          components.push(component);
        }
        components.sort((left, right) => {
          const leftSending = left.some((node) => node.state === "sending") ? 0 : 1;
          const rightSending = right.some((node) => node.state === "sending") ? 0 : 1;
          return (
            leftSending - rightSending || left[0]!.created_sequence - right[0]!.created_sequence
          );
        });

        const now = this.now().getTime();
        const ready = (node: OutboxGraphNode): boolean => {
          if (node.state === "sending" || node.state === "pending") return true;
          if (node.state !== "retryable" || node.next_attempt_at === null) return false;
          const next = Date.parse(node.next_attempt_at);
          if (!Number.isFinite(next)) {
            throw new LocalMutationError("The encrypted outbox is invalid.", "invalid_outbox");
          }
          return next <= now;
        };
        const selected: string[] = [];
        for (const component of components) {
          if (!component.every(ready)) continue;
          const isDependencyGraph = component.some((node) => node.dependencyIds.length > 0);
          if (isDependencyGraph) {
            if (selected.length > 0) break;
            if (component.length > limit) {
              throw new LocalMutationError(
                "The synchronization batch is too small for one atomic dependency graph.",
                "invalid_outbox",
              );
            }
            selected.push(...component.map((node) => node.operation_id));
            break;
          }
          if (selected.length >= limit) break;
          selected.push(component[0]!.operation_id);
        }
        if (selected.length === 0) return;

        const placeholders = selected.map(() => "?").join(", ");
        const rows = await this.database.getAllAsync(
          `SELECT operation_id, idempotency_key, entity_type, entity_id, operation_type,
            base_revision, payload_json, dependency_ids_json, base_json, state, attempt_count
           FROM sync_outbox
           WHERE operation_id IN (${placeholders})
           ORDER BY created_sequence`,
          ...selected,
        );
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
        request = mobileSyncPushRequestSchema.parse({
          protocolVersion: MOBILE_SYNC_PROTOCOL_VERSION,
          clientId: await this.clientId(),
          operations,
        });
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
      const localRow = await this.currentTransaction(entityId);
      const pair =
        localRow.kind === "transfer" && localRow.transfer_group_id
          ? await this.currentTransfer(entityId)
          : null;
      const row = await this.database.getFirstAsync(
        `SELECT conflict_id, operation_id, base_json, local_json, server_json,
          server_revision, created_at
         FROM sync_conflicts
         WHERE entity_type = ? AND entity_id = ? AND resolved_at IS NULL
         ORDER BY created_at DESC
         LIMIT 1`,
        pair ? "transfer" : "transaction",
        pair?.groupId ?? entityId,
      );
      if (!row) return null;
      const conflict = conflictRowSchema.parse(row);
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
          input: pair?.input ?? commandFromRow(localRow),
          deleted: pair
            ? pair.from.deleted_at !== null && pair.to.deleted_at !== null
            : localRow.deleted_at !== null,
        },
        server:
          serverValue === null
            ? null
            : {
                input: pair
                  ? transferCommandFromSnapshot(serverValue)
                  : commandFromSnapshot(serverValue),
                deleted: false,
              },
        serverRevision: conflict.server_revision,
        createdAt: conflict.created_at,
      };
    });
  }

  getReferenceConflict(
    entityType: "account" | "category",
    entityId: string,
  ): Promise<LocalReferenceConflict | null> {
    return this.writer.run(async () => {
      const row = await this.database.getFirstAsync(
        `SELECT conflict_id, operation_id, base_json, local_json, server_json,
          server_revision, created_at
         FROM sync_conflicts
         WHERE entity_type = ? AND entity_id = ? AND resolved_at IS NULL
         ORDER BY created_at DESC
         LIMIT 1`,
        entityType,
        entityId,
      );
      if (!row) return null;
      const conflict = conflictRowSchema.parse(row);
      const local =
        entityType === "account"
          ? accountConflictVersion(await this.currentAccount(entityId))
          : categoryConflictVersion(await this.currentCategory(entityId));
      let serverValue: unknown;
      try {
        serverValue = JSON.parse(conflict.server_json) as unknown;
      } catch {
        throw new LocalMutationError("The preserved conflict is invalid.", "invalid_outbox");
      }
      const server =
        serverValue === null
          ? null
          : entityType === "account"
            ? accountConflictVersion(mobileSyncAccountSnapshotSchema.parse(serverValue))
            : categoryConflictVersion(mobileSyncCategorySnapshotSchema.parse(serverValue));
      return {
        id: conflict.conflict_id,
        entityType,
        entityId,
        local,
        server,
        serverRevision: conflict.server_revision,
        createdAt: conflict.created_at,
      };
    });
  }

  resolveReferenceConflict(
    entityType: "account" | "category",
    entityId: string,
    resolution: "keep_local" | "keep_server",
  ): Promise<void> {
    return this.writer.run(async () => {
      await this.database.withTransactionAsync(async () => {
        const conflict = await this.currentConflict(entityType, entityId);
        const outbox = await this.currentOutbox(entityType, entityId);
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
        const current =
          entityType === "account"
            ? await this.currentAccount(entityId)
            : await this.currentCategory(entityId);
        let serverValue: unknown;
        try {
          serverValue = JSON.parse(conflict.server_json) as unknown;
        } catch {
          throw new LocalMutationError("The preserved conflict is invalid.", "invalid_outbox");
        }
        const accountServer =
          entityType === "account" && serverValue !== null
            ? mobileSyncAccountSnapshotSchema.parse(serverValue)
            : null;
        const categoryServer =
          entityType === "category" && serverValue !== null
            ? mobileSyncCategorySnapshotSchema.parse(serverValue)
            : null;
        const serverSnapshot = accountServer ?? categoryServer;

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
            await this.database.runAsync(
              `UPDATE ${syncEntityTable(entityType)}
               SET server_revision = ?, server_updated_at = NULL, deleted_at = ?,
                 sync_state = 'synced'
               WHERE id = ?`,
              conflict.server_revision,
              this.now().toISOString(),
              entityId,
            );
            return;
          }
          if (accountServer) {
            await this.database.runAsync(
              `UPDATE accounts SET name = ?, type = ?, currency = ?, archived = ?, system = ?,
                interest_json = ?, server_revision = ?, server_updated_at = ?, deleted_at = NULL,
                sync_state = 'synced' WHERE id = ?`,
              accountServer.name,
              accountServer.type,
              accountServer.currency,
              accountServer.archived ? 1 : 0,
              accountServer.system ? 1 : 0,
              JSON.stringify(accountServer.interest),
              accountServer.revision,
              accountServer.updatedAt,
              entityId,
            );
          } else if (categoryServer) {
            await this.database.runAsync(
              `UPDATE categories SET name = ?, kind = ?, color = ?, archived = ?, system = ?,
                origin = ?, required_plan = ?, locked = ?, server_revision = ?,
                server_updated_at = ?, deleted_at = NULL, sync_state = 'synced' WHERE id = ?`,
              categoryServer.name,
              categoryServer.kind,
              categoryServer.color,
              categoryServer.archived ? 1 : 0,
              categoryServer.system ? 1 : 0,
              categoryServer.origin,
              categoryServer.requiredPlan,
              categoryServer.locked ? 1 : 0,
              categoryServer.revision,
              categoryServer.updatedAt,
              entityId,
            );
          }
          return;
        }

        const locallyArchived = current.archived === 1;
        if (locallyArchived && !serverSnapshot) {
          await this.database.runAsync(
            `UPDATE ${syncEntityTable(entityType)} SET deleted_at = ?, sync_state = 'synced'
             WHERE id = ?`,
            this.now().toISOString(),
            entityId,
          );
          return;
        }
        const operationType = locallyArchived ? "delete" : serverSnapshot ? "update" : "create";
        const accountLocal =
          entityType === "account" ? (current as z.infer<typeof accountRowSchema>) : null;
        const accountInterest =
          accountLocal && accountServer
            ? localInterestInput(accountLocal.interest_json)
            : null;
        const interestChanged =
          accountInterest !== null &&
          accountServer !== null &&
          (accountInterest.enabled !== accountServer.interest.enabled ||
            (accountInterest.enabled &&
              (accountInterest.annualRateBasisPoints !==
                accountServer.interest.annualRateBasisPoints ||
                accountInterest.frequency !== accountServer.interest.frequency ||
                accountInterest.payDay !== accountServer.interest.payDay)));
        const payload =
          operationType === "delete"
            ? {}
            : entityType === "account"
              ? {
                  name: accountLocal?.name ?? accountServer?.name ?? "",
                  type: accountLocal?.type ?? accountServer?.type ?? "cash",
                  ...(interestChanged ? { interest: accountInterest } : {}),
                }
              : operationType === "create"
                ? {
                    name: (current as z.infer<typeof categoryRowSchema>).name,
                    kind: (current as z.infer<typeof categoryRowSchema>).kind,
                    color: (current as z.infer<typeof categoryRowSchema>).color,
                  }
                : {
                    name: (current as z.infer<typeof categoryRowSchema>).name,
                    color: (current as z.infer<typeof categoryRowSchema>).color,
                    archived: false,
                  };
        await this.database.runAsync(
          `INSERT INTO sync_outbox (
            operation_id, idempotency_key, entity_type, entity_id, operation_type,
            base_revision, payload_json, dependency_ids_json, base_json, created_sequence
          ) VALUES (?, ?, ?, ?, ?, ?, ?, '[]', ?, ?)`,
          uuidSchema.parse(this.randomUuid()),
          uuidSchema.parse(this.randomUuid()),
          entityType,
          entityId,
          operationType,
          serverSnapshot?.revision ?? 0,
          JSON.stringify(payload),
          serverSnapshot ? JSON.stringify(serverSnapshot) : "{}",
          await this.nextSequence(),
        );
        await this.database.runAsync(
          `UPDATE ${syncEntityTable(entityType)} SET sync_state = 'pending' WHERE id = ?`,
          entityId,
        );
      });
    });
  }

  resolveConflict(entityId: string, resolution: "keep_local" | "keep_server"): Promise<void> {
    return this.writer.run(async () => {
      await this.database.withTransactionAsync(async () => {
        const selected = await this.currentTransaction(entityId);
        if (selected.kind === "transfer" && selected.transfer_group_id) {
          const pair = await this.currentTransfer(entityId);
          const conflict = await this.currentConflict("transfer", pair.groupId);
          const outbox = await this.currentOutbox("transfer", pair.groupId);
          if (
            !outbox ||
            outbox.operation_id !== conflict.operation_id ||
            outbox.state !== "conflicted"
          ) {
            throw new LocalMutationError(
              "The preserved transfer conflict changed before it could be resolved.",
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
            serverValue === null ? null : mobileSyncTransferSnapshotSchema.parse(serverValue);
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
              await this.database.runAsync(
                "DELETE FROM transactions WHERE transfer_group_id = ?",
                pair.groupId,
              );
              return;
            }
            await this.replaceTransferRows(
              pair.groupId,
              serverSnapshot.fromTransactionId,
              serverSnapshot.toTransactionId,
              transferCommandFromSnapshot(serverSnapshot),
              serverSnapshot.revision,
              serverSnapshot.updatedAt,
              "synced",
            );
            return;
          }

          const locallyDeleted = pair.from.deleted_at !== null && pair.to.deleted_at !== null;
          if (locallyDeleted && !serverSnapshot) {
            await this.database.runAsync(
              "DELETE FROM transactions WHERE transfer_group_id = ?",
              pair.groupId,
            );
            return;
          }
          const operationType = locallyDeleted ? "delete" : serverSnapshot ? "update" : "create";
          if (serverSnapshot && !locallyDeleted) {
            await this.replaceTransferRows(
              pair.groupId,
              serverSnapshot.fromTransactionId,
              serverSnapshot.toTransactionId,
              pair.input,
              serverSnapshot.revision,
              serverSnapshot.updatedAt,
              "pending",
            );
          } else {
            await this.database.runAsync(
              `UPDATE transactions SET server_revision = ?, server_updated_at = ?,
                sync_state = 'pending' WHERE transfer_group_id = ?`,
              serverSnapshot?.revision ?? 0,
              serverSnapshot?.updatedAt ?? null,
              pair.groupId,
            );
          }
          const payload =
            operationType === "delete"
              ? {}
              : operationType === "update"
                ? { transfer: pair.input }
                : {
                    fromTransactionId: pair.from.id,
                    toTransactionId: pair.to.id,
                    transfer: pair.input,
                  };
          await this.database.runAsync(
            `INSERT INTO sync_outbox (
              operation_id, idempotency_key, entity_type, entity_id, operation_type,
              base_revision, payload_json, dependency_ids_json, base_json, created_sequence
            ) VALUES (?, ?, 'transfer', ?, ?, ?, ?, '[]', ?, ?)`,
            uuidSchema.parse(this.randomUuid()),
            uuidSchema.parse(this.randomUuid()),
            pair.groupId,
            operationType,
            serverSnapshot?.revision ?? 0,
            JSON.stringify(payload),
            serverSnapshot ? JSON.stringify(serverSnapshot) : "{}",
            await this.nextSequence(),
          );
          return;
        }
        const conflict = await this.currentConflict("transaction", entityId);
        const current = selected;
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

  getBudgetConflict(entityId: string): Promise<LocalBudgetConflict | null> {
    return this.writer.run(async () => {
      const local = await this.currentBudgetById(entityId);
      const row = await this.database.getFirstAsync(
        `SELECT conflict_id, operation_id, base_json, local_json, server_json,
          server_revision, created_at
         FROM sync_conflicts
         WHERE entity_type = 'budget' AND entity_id = ? AND resolved_at IS NULL
         ORDER BY created_at DESC
         LIMIT 1`,
        entityId,
      );
      if (!row) return null;
      const conflict = conflictRowSchema.parse(row);
      let serverValue: unknown;
      try {
        serverValue = JSON.parse(conflict.server_json) as unknown;
      } catch {
        throw new LocalMutationError("The preserved conflict is invalid.", "invalid_outbox");
      }
      const category = await this.currentCategory(local.category_id);
      const serverSnapshot =
        serverValue === null ? null : mobileSyncBudgetSnapshotSchema.parse(serverValue);
      const serverCategory = serverSnapshot
        ? await this.currentCategory(serverSnapshot.categoryId)
        : null;
      return {
        id: conflict.conflict_id,
        entityId,
        local: {
          month: local.month,
          categoryId: local.category_id,
          categoryName: category.name,
          categoryColor: category.color,
          limitMinor: local.limit_minor,
        },
        server: serverSnapshot
          ? {
              month: serverSnapshot.month,
              categoryId: serverSnapshot.categoryId,
              categoryName: serverCategory?.name ?? serverSnapshot.categoryId,
              categoryColor: serverCategory?.color ?? "#888888",
              limitMinor: serverSnapshot.limitMinor,
            }
          : null,
        serverRevision: conflict.server_revision,
        createdAt: conflict.created_at,
      };
    });
  }

  resolveBudgetConflict(
    entityId: string,
    resolution: "keep_local" | "keep_server",
  ): Promise<void> {
    return this.writer.run(async () => {
      await this.database.withTransactionAsync(async () => {
        const local = await this.currentBudgetById(entityId);
        const conflict = await this.currentConflict("budget", entityId);
        const outbox = await this.currentOutbox("budget", entityId);
        if (
          !outbox ||
          outbox.operation_id !== conflict.operation_id ||
          outbox.state !== "conflicted"
        ) {
          throw new LocalMutationError(
            "The preserved budget conflict changed before it could be resolved.",
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
          serverValue === null ? null : mobileSyncBudgetSnapshotSchema.parse(serverValue);

        await this.database.runAsync(
          `UPDATE sync_conflicts SET resolved_at = ?, resolution = ?, operation_id = NULL
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
            await this.database.runAsync("DELETE FROM budgets WHERE id = ?", entityId);
            return;
          }
          if (serverSnapshot.id !== entityId) {
            await this.database.runAsync("DELETE FROM budgets WHERE id = ?", entityId);
          }
          await this.upsertBudgetSnapshot(serverSnapshot, "synced");
          return;
        }

        const localLimit = local.limit_minor;
        if (!serverSnapshot) {
          await this.database.runAsync(
            "UPDATE budgets SET sync_state = 'pending' WHERE id = ?",
            entityId,
          );
          await this.database.runAsync(
            `INSERT INTO sync_outbox (
              operation_id, idempotency_key, entity_type, entity_id, operation_type,
              base_revision, payload_json, dependency_ids_json, base_json, created_sequence
            ) VALUES (?, ?, 'budget', ?, 'create', 0, ?, '[]', '{}', ?)`,
            uuidSchema.parse(this.randomUuid()),
            uuidSchema.parse(this.randomUuid()),
            entityId,
            JSON.stringify({
              categoryId: local.category_id,
              month: local.month,
              limitMinor: localLimit,
            }),
            await this.nextSequence(),
          );
          return;
        }

        const targetId = serverSnapshot.id;
        if (targetId !== entityId) {
          await this.database.runAsync("DELETE FROM budgets WHERE id = ?", entityId);
          await this.database.runAsync(
            `INSERT INTO budgets (
              id, category_id, month, limit_minor, server_revision, server_updated_at,
              deleted_at, sync_state
            ) VALUES (?, ?, ?, ?, ?, ?, NULL, 'pending')`,
            targetId,
            serverSnapshot.categoryId,
            serverSnapshot.month,
            localLimit,
            serverSnapshot.revision,
            serverSnapshot.updatedAt,
          );
        } else {
          await this.database.runAsync(
            `UPDATE budgets SET limit_minor = ?, server_revision = ?, server_updated_at = ?,
              sync_state = 'pending' WHERE id = ?`,
            localLimit,
            serverSnapshot.revision,
            serverSnapshot.updatedAt,
            entityId,
          );
        }
        await this.database.runAsync(
          `INSERT INTO sync_outbox (
            operation_id, idempotency_key, entity_type, entity_id, operation_type,
            base_revision, payload_json, dependency_ids_json, base_json, created_sequence
          ) VALUES (?, ?, 'budget', ?, 'update', ?, ?, '[]', ?, ?)`,
          uuidSchema.parse(this.randomUuid()),
          uuidSchema.parse(this.randomUuid()),
          targetId,
          serverSnapshot.revision,
          JSON.stringify({ limitMinor: localLimit }),
          JSON.stringify(serverSnapshot),
          await this.nextSequence(),
        );
      });
    });
  }

  private async upsertBudgetSnapshot(
    snapshot: {
      id: string;
      categoryId: string;
      month: string;
      limitMinor: number;
      revision: number;
      updatedAt: string | null;
    },
    syncState: "synced" | "pending",
  ): Promise<void> {
    await this.database.runAsync(
      `INSERT INTO budgets (
        id, category_id, month, limit_minor, server_revision, server_updated_at, deleted_at, sync_state
      ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?)
       ON CONFLICT(id) DO UPDATE SET
         category_id = excluded.category_id,
         month = excluded.month,
         limit_minor = excluded.limit_minor,
         server_revision = excluded.server_revision,
         server_updated_at = excluded.server_updated_at,
         deleted_at = NULL,
         sync_state = excluded.sync_state`,
      snapshot.id,
      snapshot.categoryId,
      snapshot.month,
      snapshot.limitMinor,
      snapshot.revision,
      snapshot.updatedAt,
      syncState,
    );
  }

  getGoalConflict(entityId: string): Promise<LocalGoalConflict | null> {
    return this.writer.run(async () => {
      const local = await this.currentGoalRowById(entityId);
      const row = await this.database.getFirstAsync(
        `SELECT conflict_id, operation_id, base_json, local_json, server_json,
          server_revision, created_at
         FROM sync_conflicts
         WHERE entity_type = 'goal' AND entity_id = ? AND resolved_at IS NULL
         ORDER BY created_at DESC
         LIMIT 1`,
        entityId,
      );
      if (!row) return null;
      const conflict = conflictRowSchema.parse(row);
      let serverValue: unknown;
      try {
        serverValue = JSON.parse(conflict.server_json) as unknown;
      } catch {
        throw new LocalMutationError("The preserved conflict is invalid.", "invalid_outbox");
      }
      const serverSnapshot =
        serverValue === null ? null : mobileSyncGoalSnapshotSchema.parse(serverValue);
      return {
        id: conflict.conflict_id,
        entityId,
        local: {
          name: local.name,
          targetAmountMinor: local.target_amount_minor,
          currentAmountMinor: local.current_amount_minor,
          targetDate: local.target_date,
          status: local.status,
        },
        server: serverSnapshot
          ? {
              name: serverSnapshot.name,
              targetAmountMinor: serverSnapshot.targetAmountMinor,
              currentAmountMinor: serverSnapshot.currentAmountMinor,
              targetDate: serverSnapshot.targetDate,
              status: serverSnapshot.status,
            }
          : null,
        serverRevision: conflict.server_revision,
        createdAt: conflict.created_at,
      };
    });
  }

  resolveGoalConflict(
    entityId: string,
    resolution: "keep_local" | "keep_server",
  ): Promise<void> {
    return this.writer.run(async () => {
      await this.database.withTransactionAsync(async () => {
        const local = await this.currentGoalRowById(entityId);
        const conflict = await this.currentConflict("goal", entityId);
        const outbox = await this.currentOutbox("goal", entityId);
        if (
          !outbox ||
          outbox.operation_id !== conflict.operation_id ||
          outbox.state !== "conflicted"
        ) {
          throw new LocalMutationError(
            "The preserved goal conflict changed before it could be resolved.",
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
          serverValue === null ? null : mobileSyncGoalSnapshotSchema.parse(serverValue);

        await this.database.runAsync(
          `UPDATE sync_conflicts SET resolved_at = ?, resolution = ?, operation_id = NULL
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
            await this.database.runAsync("DELETE FROM financial_goals WHERE id = ?", entityId);
            return;
          }
          await this.upsertGoalSnapshot(serverSnapshot, "synced");
          return;
        }

        const operationType = outbox.operation_type;
        if (operationType === "delete") {
          if (!serverSnapshot) {
            await this.database.runAsync("DELETE FROM financial_goals WHERE id = ?", entityId);
            return;
          }
          await this.database.runAsync(
            `INSERT INTO sync_outbox (
              operation_id, idempotency_key, entity_type, entity_id, operation_type,
              base_revision, payload_json, dependency_ids_json, base_json, created_sequence
            ) VALUES (?, ?, 'goal', ?, 'delete', ?, '{}', '[]', ?, ?)`,
            uuidSchema.parse(this.randomUuid()),
            uuidSchema.parse(this.randomUuid()),
            entityId,
            serverSnapshot.revision,
            JSON.stringify(serverSnapshot),
            await this.nextSequence(),
          );
          await this.database.runAsync(
            "UPDATE financial_goals SET sync_state = 'pending' WHERE id = ?",
            entityId,
          );
          return;
        }

        const localInput = {
          name: local.name,
          targetAmountMinor: local.target_amount_minor,
          currentAmountMinor: local.current_amount_minor,
          targetDate: local.target_date,
          status: local.status,
        };
        if (!serverSnapshot) {
          await this.database.runAsync(
            `UPDATE financial_goals SET server_revision = 0, server_updated_at = NULL,
              sync_state = 'pending' WHERE id = ?`,
            entityId,
          );
          await this.database.runAsync(
            `INSERT INTO sync_outbox (
              operation_id, idempotency_key, entity_type, entity_id, operation_type,
              base_revision, payload_json, dependency_ids_json, base_json, created_sequence
            ) VALUES (?, ?, 'goal', ?, 'create', 0, ?, '[]', '{}', ?)`,
            uuidSchema.parse(this.randomUuid()),
            uuidSchema.parse(this.randomUuid()),
            entityId,
            JSON.stringify(localInput),
            await this.nextSequence(),
          );
          return;
        }
        await this.database.runAsync(
          `UPDATE financial_goals SET server_revision = ?, server_updated_at = ?,
            sync_state = 'pending' WHERE id = ?`,
          serverSnapshot.revision,
          serverSnapshot.updatedAt,
          entityId,
        );
        await this.database.runAsync(
          `INSERT INTO sync_outbox (
            operation_id, idempotency_key, entity_type, entity_id, operation_type,
            base_revision, payload_json, dependency_ids_json, base_json, created_sequence
          ) VALUES (?, ?, 'goal', ?, 'update', ?, ?, '[]', ?, ?)`,
          uuidSchema.parse(this.randomUuid()),
          uuidSchema.parse(this.randomUuid()),
          entityId,
          serverSnapshot.revision,
          JSON.stringify(localInput),
          JSON.stringify(serverSnapshot),
          await this.nextSequence(),
        );
      });
    });
  }

  private async upsertGoalSnapshot(
    snapshot: {
      id: string;
      name: string;
      targetAmountMinor: number;
      currentAmountMinor: number;
      targetDate: string;
      status: FinancialGoalStatus;
      revision: number;
      updatedAt: string | null;
    },
    syncState: "synced" | "pending",
  ): Promise<void> {
    await this.database.runAsync(
      `INSERT INTO financial_goals (
        id, name, target_amount_minor, current_amount_minor, target_date, status,
        server_revision, server_updated_at, deleted_at, sync_state
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         target_amount_minor = excluded.target_amount_minor,
         current_amount_minor = excluded.current_amount_minor,
         target_date = excluded.target_date,
         status = excluded.status,
         server_revision = excluded.server_revision,
         server_updated_at = excluded.server_updated_at,
         deleted_at = NULL,
         sync_state = excluded.sync_state`,
      snapshot.id,
      snapshot.name,
      snapshot.targetAmountMinor,
      snapshot.currentAmountMinor,
      snapshot.targetDate,
      snapshot.status,
      snapshot.revision,
      snapshot.updatedAt,
      syncState,
    );
  }

  getDebtConflict(entityId: string): Promise<LocalDebtConflict | null> {
    return this.writer.run(async () => {
      const local = await this.currentDebtRowById(entityId);
      const row = await this.database.getFirstAsync(
        `SELECT conflict_id, operation_id, base_json, local_json, server_json,
          server_revision, created_at
         FROM sync_conflicts
         WHERE entity_type = 'debt' AND entity_id = ? AND resolved_at IS NULL
         ORDER BY created_at DESC
         LIMIT 1`,
        entityId,
      );
      if (!row) return null;
      const conflict = conflictRowSchema.parse(row);
      let serverValue: unknown;
      try {
        serverValue = JSON.parse(conflict.server_json) as unknown;
      } catch {
        throw new LocalMutationError("The preserved conflict is invalid.", "invalid_outbox");
      }
      const serverSnapshot =
        serverValue === null ? null : mobileSyncDebtSnapshotSchema.parse(serverValue);
      return {
        id: conflict.conflict_id,
        entityId,
        local: {
          name: local.name,
          type: local.type,
          balanceMinor: local.balance_minor,
          aprBasisPoints: local.apr_basis_points,
          minimumPaymentMinor: local.minimum_payment_minor,
          balanceAsOf: local.balance_as_of,
          status: local.status,
        },
        server: serverSnapshot
          ? {
              name: serverSnapshot.name,
              type: serverSnapshot.type,
              balanceMinor: serverSnapshot.balanceMinor,
              aprBasisPoints: serverSnapshot.aprBasisPoints,
              minimumPaymentMinor: serverSnapshot.minimumPaymentMinor,
              balanceAsOf: serverSnapshot.balanceAsOf,
              status: serverSnapshot.status,
            }
          : null,
        serverRevision: conflict.server_revision,
        createdAt: conflict.created_at,
      };
    });
  }

  resolveDebtConflict(
    entityId: string,
    resolution: "keep_local" | "keep_server",
  ): Promise<void> {
    return this.writer.run(async () => {
      await this.database.withTransactionAsync(async () => {
        const local = await this.currentDebtRowById(entityId);
        const conflict = await this.currentConflict("debt", entityId);
        const outbox = await this.currentOutbox("debt", entityId);
        if (
          !outbox ||
          outbox.operation_id !== conflict.operation_id ||
          outbox.state !== "conflicted"
        ) {
          throw new LocalMutationError(
            "The preserved debt conflict changed before it could be resolved.",
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
          serverValue === null ? null : mobileSyncDebtSnapshotSchema.parse(serverValue);

        await this.database.runAsync(
          `UPDATE sync_conflicts SET resolved_at = ?, resolution = ?, operation_id = NULL
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
            await this.database.runAsync("DELETE FROM debts WHERE id = ?", entityId);
            return;
          }
          await this.upsertDebtSnapshot(serverSnapshot, "synced");
          return;
        }

        const operationType = outbox.operation_type;
        if (operationType === "delete") {
          if (!serverSnapshot) {
            await this.database.runAsync("DELETE FROM debts WHERE id = ?", entityId);
            return;
          }
          await this.database.runAsync(
            `INSERT INTO sync_outbox (
              operation_id, idempotency_key, entity_type, entity_id, operation_type,
              base_revision, payload_json, dependency_ids_json, base_json, created_sequence
            ) VALUES (?, ?, 'debt', ?, 'delete', ?, '{}', '[]', ?, ?)`,
            uuidSchema.parse(this.randomUuid()),
            uuidSchema.parse(this.randomUuid()),
            entityId,
            serverSnapshot.revision,
            JSON.stringify(serverSnapshot),
            await this.nextSequence(),
          );
          await this.database.runAsync(
            "UPDATE debts SET sync_state = 'pending' WHERE id = ?",
            entityId,
          );
          return;
        }

        const localInput = {
          name: local.name,
          type: local.type,
          balanceMinor: local.balance_minor,
          aprBasisPoints: local.apr_basis_points,
          minimumPaymentMinor: local.minimum_payment_minor,
          balanceAsOf: local.balance_as_of,
          status: local.status,
        };
        if (!serverSnapshot) {
          await this.database.runAsync(
            `UPDATE debts SET server_revision = 0, server_updated_at = NULL,
              sync_state = 'pending' WHERE id = ?`,
            entityId,
          );
          await this.database.runAsync(
            `INSERT INTO sync_outbox (
              operation_id, idempotency_key, entity_type, entity_id, operation_type,
              base_revision, payload_json, dependency_ids_json, base_json, created_sequence
            ) VALUES (?, ?, 'debt', ?, 'create', 0, ?, '[]', '{}', ?)`,
            uuidSchema.parse(this.randomUuid()),
            uuidSchema.parse(this.randomUuid()),
            entityId,
            JSON.stringify(localInput),
            await this.nextSequence(),
          );
          return;
        }
        await this.database.runAsync(
          `UPDATE debts SET server_revision = ?, server_updated_at = ?,
            sync_state = 'pending' WHERE id = ?`,
          serverSnapshot.revision,
          serverSnapshot.updatedAt,
          entityId,
        );
        await this.database.runAsync(
          `INSERT INTO sync_outbox (
            operation_id, idempotency_key, entity_type, entity_id, operation_type,
            base_revision, payload_json, dependency_ids_json, base_json, created_sequence
          ) VALUES (?, ?, 'debt', ?, 'update', ?, ?, '[]', ?, ?)`,
          uuidSchema.parse(this.randomUuid()),
          uuidSchema.parse(this.randomUuid()),
          entityId,
          serverSnapshot.revision,
          JSON.stringify(localInput),
          JSON.stringify(serverSnapshot),
          await this.nextSequence(),
        );
      });
    });
  }

  private async upsertDebtSnapshot(
    snapshot: {
      id: string;
      name: string;
      type: DebtType;
      balanceMinor: number;
      aprBasisPoints: number;
      minimumPaymentMinor: number;
      balanceAsOf: string;
      status: DebtStatus;
      revision: number;
      updatedAt: string | null;
    },
    syncState: "synced" | "pending",
  ): Promise<void> {
    await this.database.runAsync(
      `INSERT INTO debts (
        id, name, type, balance_minor, apr_basis_points, minimum_payment_minor,
        balance_as_of, status, server_revision, server_updated_at, deleted_at, sync_state
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)
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
         sync_state = excluded.sync_state`,
      snapshot.id,
      snapshot.name,
      snapshot.type,
      snapshot.balanceMinor,
      snapshot.aprBasisPoints,
      snapshot.minimumPaymentMinor,
      snapshot.balanceAsOf,
      snapshot.status,
      snapshot.revision,
      snapshot.updatedAt,
      syncState,
    );
  }

  private async upsertSubscriptionSnapshot(
    snapshot: {
      id: string;
      name: string;
      amountMinor: number;
      currency: string;
      billingCycle: SubscriptionBillingCycle;
      nextBillingDate: string;
      status: SubscriptionStatus;
      categoryId: string | null;
      accountId: string | null;
      revision: number;
      updatedAt: string | null;
    },
    syncState: "synced" | "pending",
  ): Promise<void> {
    await this.database.runAsync(
      `INSERT INTO subscriptions (
        id, name, amount_minor, currency, billing_cycle, next_billing_date, status,
        category_id, account_id, server_revision, server_updated_at, deleted_at, sync_state
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)
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
         sync_state = excluded.sync_state`,
      snapshot.id,
      snapshot.name,
      snapshot.amountMinor,
      snapshot.currency,
      snapshot.billingCycle,
      snapshot.nextBillingDate,
      snapshot.status,
      snapshot.categoryId,
      snapshot.accountId,
      snapshot.revision,
      snapshot.updatedAt,
      syncState,
    );
  }

  getSubscriptionConflict(entityId: string): Promise<LocalSubscriptionConflict | null> {
    return this.writer.run(async () => {
      const local = await this.currentSubscriptionRowById(entityId);
      const row = await this.database.getFirstAsync(
        `SELECT conflict_id, operation_id, base_json, local_json, server_json,
          server_revision, created_at
         FROM sync_conflicts
         WHERE entity_type = 'subscription' AND entity_id = ? AND resolved_at IS NULL
         ORDER BY created_at DESC
         LIMIT 1`,
        entityId,
      );
      if (!row) return null;
      const conflict = conflictRowSchema.parse(row);
      let serverValue: unknown;
      try {
        serverValue = JSON.parse(conflict.server_json) as unknown;
      } catch {
        throw new LocalMutationError("The preserved conflict is invalid.", "invalid_outbox");
      }
      const serverSnapshot =
        serverValue === null ? null : mobileSyncSubscriptionSnapshotSchema.parse(serverValue);
      return {
        id: conflict.conflict_id,
        entityId,
        local: {
          name: local.name,
          amountMinor: local.amount_minor,
          billingCycle: local.billing_cycle,
          nextBillingDate: local.next_billing_date,
          status: local.status,
          categoryId: local.category_id,
          accountId: local.account_id,
        },
        server: serverSnapshot
          ? {
              name: serverSnapshot.name,
              amountMinor: serverSnapshot.amountMinor,
              billingCycle: serverSnapshot.billingCycle,
              nextBillingDate: serverSnapshot.nextBillingDate,
              status: serverSnapshot.status,
              categoryId: serverSnapshot.categoryId,
              accountId: serverSnapshot.accountId,
            }
          : null,
        serverRevision: conflict.server_revision,
        createdAt: conflict.created_at,
      };
    });
  }

  resolveSubscriptionConflict(
    entityId: string,
    resolution: "keep_local" | "keep_server",
  ): Promise<void> {
    return this.writer.run(async () => {
      await this.database.withTransactionAsync(async () => {
        const local = await this.currentSubscriptionRowById(entityId);
        const conflict = await this.currentConflict("subscription", entityId);
        const outbox = await this.currentOutbox("subscription", entityId);
        if (
          !outbox ||
          outbox.operation_id !== conflict.operation_id ||
          outbox.state !== "conflicted"
        ) {
          throw new LocalMutationError(
            "The preserved subscription conflict changed before it could be resolved.",
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
          serverValue === null ? null : mobileSyncSubscriptionSnapshotSchema.parse(serverValue);

        await this.database.runAsync(
          `UPDATE sync_conflicts SET resolved_at = ?, resolution = ?, operation_id = NULL
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
            await this.database.runAsync("DELETE FROM subscriptions WHERE id = ?", entityId);
            return;
          }
          await this.upsertSubscriptionSnapshot(serverSnapshot, "synced");
          return;
        }

        const operationType = outbox.operation_type;
        if (operationType === "delete") {
          if (!serverSnapshot) {
            await this.database.runAsync("DELETE FROM subscriptions WHERE id = ?", entityId);
            return;
          }
          await this.database.runAsync(
            `INSERT INTO sync_outbox (
              operation_id, idempotency_key, entity_type, entity_id, operation_type,
              base_revision, payload_json, dependency_ids_json, base_json, created_sequence
            ) VALUES (?, ?, 'subscription', ?, 'delete', ?, '{}', '[]', ?, ?)`,
            uuidSchema.parse(this.randomUuid()),
            uuidSchema.parse(this.randomUuid()),
            entityId,
            serverSnapshot.revision,
            JSON.stringify(serverSnapshot),
            await this.nextSequence(),
          );
          await this.database.runAsync(
            "UPDATE subscriptions SET sync_state = 'pending' WHERE id = ?",
            entityId,
          );
          return;
        }

        const localInput = {
          name: local.name,
          amountMinor: local.amount_minor,
          billingCycle: local.billing_cycle,
          nextBillingDate: local.next_billing_date,
          categoryId: local.category_id,
          accountId: local.account_id,
          status: local.status,
        };
        if (!serverSnapshot) {
          await this.database.runAsync(
            `UPDATE subscriptions SET server_revision = 0, server_updated_at = NULL,
              sync_state = 'pending' WHERE id = ?`,
            entityId,
          );
          await this.database.runAsync(
            `INSERT INTO sync_outbox (
              operation_id, idempotency_key, entity_type, entity_id, operation_type,
              base_revision, payload_json, dependency_ids_json, base_json, created_sequence
            ) VALUES (?, ?, 'subscription', ?, 'create', 0, ?, '[]', '{}', ?)`,
            uuidSchema.parse(this.randomUuid()),
            uuidSchema.parse(this.randomUuid()),
            entityId,
            JSON.stringify(localInput),
            await this.nextSequence(),
          );
          return;
        }
        await this.database.runAsync(
          `UPDATE subscriptions SET server_revision = ?, server_updated_at = ?,
            sync_state = 'pending' WHERE id = ?`,
          serverSnapshot.revision,
          serverSnapshot.updatedAt,
          entityId,
        );
        await this.database.runAsync(
          `INSERT INTO sync_outbox (
            operation_id, idempotency_key, entity_type, entity_id, operation_type,
            base_revision, payload_json, dependency_ids_json, base_json, created_sequence
          ) VALUES (?, ?, 'subscription', ?, 'update', ?, ?, '[]', ?, ?)`,
          uuidSchema.parse(this.randomUuid()),
          uuidSchema.parse(this.randomUuid()),
          entityId,
          serverSnapshot.revision,
          JSON.stringify(localInput),
          JSON.stringify(serverSnapshot),
          await this.nextSequence(),
        );
      });
    });
  }

  private async upsertEventSnapshot(
    snapshot: {
      id: string;
      title: string;
      date: string;
      startTime: string | null;
      endTime: string | null;
      notes: string | null;
      revision: number;
      updatedAt: string | null;
    },
    syncState: "synced" | "pending",
  ): Promise<void> {
    await this.database.runAsync(
      `INSERT INTO calendar_events (
        id, title, date, start_time, end_time, notes,
        server_revision, server_updated_at, deleted_at, sync_state
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)
       ON CONFLICT(id) DO UPDATE SET
         title = excluded.title,
         date = excluded.date,
         start_time = excluded.start_time,
         end_time = excluded.end_time,
         notes = excluded.notes,
         server_revision = excluded.server_revision,
         server_updated_at = excluded.server_updated_at,
         deleted_at = NULL,
         sync_state = excluded.sync_state`,
      snapshot.id,
      snapshot.title,
      snapshot.date,
      snapshot.startTime,
      snapshot.endTime,
      snapshot.notes,
      snapshot.revision,
      snapshot.updatedAt,
      syncState,
    );
  }

  getEventConflict(entityId: string): Promise<LocalEventConflict | null> {
    return this.writer.run(async () => {
      const local = await this.currentEventRowById(entityId);
      const row = await this.database.getFirstAsync(
        `SELECT conflict_id, operation_id, base_json, local_json, server_json,
          server_revision, created_at
         FROM sync_conflicts
         WHERE entity_type = 'event' AND entity_id = ? AND resolved_at IS NULL
         ORDER BY created_at DESC
         LIMIT 1`,
        entityId,
      );
      if (!row) return null;
      const conflict = conflictRowSchema.parse(row);
      let serverValue: unknown;
      try {
        serverValue = JSON.parse(conflict.server_json) as unknown;
      } catch {
        throw new LocalMutationError("The preserved conflict is invalid.", "invalid_outbox");
      }
      const serverSnapshot =
        serverValue === null ? null : mobileSyncEventSnapshotSchema.parse(serverValue);
      return {
        id: conflict.conflict_id,
        entityId,
        local: {
          title: local.title,
          date: local.date,
          startTime: local.start_time,
          endTime: local.end_time,
          notes: local.notes,
        },
        server: serverSnapshot
          ? {
              title: serverSnapshot.title,
              date: serverSnapshot.date,
              startTime: serverSnapshot.startTime,
              endTime: serverSnapshot.endTime,
              notes: serverSnapshot.notes,
            }
          : null,
        serverRevision: conflict.server_revision,
        createdAt: conflict.created_at,
      };
    });
  }

  resolveEventConflict(
    entityId: string,
    resolution: "keep_local" | "keep_server",
  ): Promise<void> {
    return this.writer.run(async () => {
      await this.database.withTransactionAsync(async () => {
        const local = await this.currentEventRowById(entityId);
        const conflict = await this.currentConflict("event", entityId);
        const outbox = await this.currentOutbox("event", entityId);
        if (
          !outbox ||
          outbox.operation_id !== conflict.operation_id ||
          outbox.state !== "conflicted"
        ) {
          throw new LocalMutationError(
            "The preserved event conflict changed before it could be resolved.",
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
          serverValue === null ? null : mobileSyncEventSnapshotSchema.parse(serverValue);

        await this.database.runAsync(
          `UPDATE sync_conflicts SET resolved_at = ?, resolution = ?, operation_id = NULL
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
            await this.database.runAsync("DELETE FROM calendar_events WHERE id = ?", entityId);
            return;
          }
          await this.upsertEventSnapshot(serverSnapshot, "synced");
          return;
        }

        const operationType = outbox.operation_type;
        if (operationType === "delete") {
          if (!serverSnapshot) {
            await this.database.runAsync("DELETE FROM calendar_events WHERE id = ?", entityId);
            return;
          }
          await this.database.runAsync(
            `INSERT INTO sync_outbox (
              operation_id, idempotency_key, entity_type, entity_id, operation_type,
              base_revision, payload_json, dependency_ids_json, base_json, created_sequence
            ) VALUES (?, ?, 'event', ?, 'delete', ?, '{}', '[]', ?, ?)`,
            uuidSchema.parse(this.randomUuid()),
            uuidSchema.parse(this.randomUuid()),
            entityId,
            serverSnapshot.revision,
            JSON.stringify(serverSnapshot),
            await this.nextSequence(),
          );
          await this.database.runAsync(
            "UPDATE calendar_events SET sync_state = 'pending' WHERE id = ?",
            entityId,
          );
          return;
        }

        const localInput = {
          title: local.title,
          date: local.date,
          startTime: local.start_time,
          endTime: local.end_time,
          notes: local.notes,
        };
        if (!serverSnapshot) {
          await this.database.runAsync(
            `UPDATE calendar_events SET server_revision = 0, server_updated_at = NULL,
              sync_state = 'pending' WHERE id = ?`,
            entityId,
          );
          await this.database.runAsync(
            `INSERT INTO sync_outbox (
              operation_id, idempotency_key, entity_type, entity_id, operation_type,
              base_revision, payload_json, dependency_ids_json, base_json, created_sequence
            ) VALUES (?, ?, 'event', ?, 'create', 0, ?, '[]', '{}', ?)`,
            uuidSchema.parse(this.randomUuid()),
            uuidSchema.parse(this.randomUuid()),
            entityId,
            JSON.stringify(localInput),
            await this.nextSequence(),
          );
          return;
        }
        await this.database.runAsync(
          `UPDATE calendar_events SET server_revision = ?, server_updated_at = ?,
            sync_state = 'pending' WHERE id = ?`,
          serverSnapshot.revision,
          serverSnapshot.updatedAt,
          entityId,
        );
        await this.database.runAsync(
          `INSERT INTO sync_outbox (
            operation_id, idempotency_key, entity_type, entity_id, operation_type,
            base_revision, payload_json, dependency_ids_json, base_json, created_sequence
          ) VALUES (?, ?, 'event', ?, 'update', ?, ?, '[]', ?, ?)`,
          uuidSchema.parse(this.randomUuid()),
          uuidSchema.parse(this.randomUuid()),
          entityId,
          serverSnapshot.revision,
          JSON.stringify(localInput),
          JSON.stringify(serverSnapshot),
          await this.nextSequence(),
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
            if (result.entityType === "transfer") {
              await this.database.runAsync(
                `UPDATE transactions SET server_revision = ?, sync_state = 'synced'
                 WHERE transfer_group_id = ?`,
                result.revision,
                result.entityId,
              );
            } else {
              await this.database.runAsync(
                `UPDATE ${syncEntityTable(result.entityType)}
                 SET server_revision = ?, sync_state = 'synced' WHERE id = ?`,
                result.revision,
                result.entityId,
              );
            }
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
            if (result.entityType === "transfer") {
              await this.database.runAsync(
                "UPDATE transactions SET sync_state = 'conflicted' WHERE transfer_group_id = ?",
                result.entityId,
              );
            } else {
              await this.database.runAsync(
                `UPDATE ${syncEntityTable(result.entityType)}
                 SET sync_state = 'conflicted' WHERE id = ?`,
                result.entityId,
              );
            }
            continue;
          }
          await this.database.runAsync(
            "UPDATE sync_outbox SET state = 'failed', last_error_code = ? WHERE operation_id = ?",
            result.code,
            result.operationId,
          );
          if (result.entityType === "transfer") {
            await this.database.runAsync(
              "UPDATE transactions SET sync_state = 'failed' WHERE transfer_group_id = ?",
              result.entityId,
            );
          } else {
            await this.database.runAsync(
              `UPDATE ${syncEntityTable(result.entityType)} SET sync_state = 'failed' WHERE id = ?`,
              result.entityId,
            );
          }
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
          if (operation.entityType === "transfer") {
            await this.database.runAsync(
              "UPDATE transactions SET sync_state = 'failed' WHERE transfer_group_id = ?",
              operation.entityId,
            );
          } else {
            await this.database.runAsync(
              `UPDATE ${syncEntityTable(operation.entityType)}
               SET sync_state = 'failed' WHERE id = ?`,
              operation.entityId,
            );
          }
        }
      });
    });
  }
}
