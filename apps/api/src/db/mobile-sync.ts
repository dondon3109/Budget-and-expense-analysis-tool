import {
  MOBILE_SYNC_PROTOCOL_VERSION,
  accountInputSchema,
  buildTransferLegs,
  categoryInputSchema,
  mobileSyncAcknowledgeResponseSchema,
  mobileSyncAccountSnapshotSchema,
  mobileSyncBudgetSnapshotSchema,
  mobileSyncPushResultSchema,
  mobileSyncCategorySnapshotSchema,
  mobileSyncChangeSchema,
  mobileSyncTransactionSnapshotSchema,
  mobileSyncTransferSnapshotSchema,
  mobileSyncSnapshotResponseSchema,
  normalizeSignedAmount,
  transactionInputSchema,
  type MobileSyncChange,
  type MobileSyncAcknowledgeRequest,
  type MobileSyncAcknowledgeResponse,
  type MobileSyncPullRequest,
  type MobileSyncPullResponse,
  type MobileSyncPushOperation,
  type MobileSyncPushRequest,
  type MobileSyncPushResponse,
  type MobileSyncPushResult,
  type MobileSyncSnapshotRequest,
  type MobileSyncSnapshotResponse,
  type AccountInput,
  type CategoryInput,
  type TransactionInput,
  type TransactionUpdate,
  type TransferInput,
} from "@zoption/shared";

import { HttpError } from "../errors";
import type { Bindings } from "../types";
import {
  EFFECTIVE_PRO_ENTITLEMENT_CONDITION,
  FREE_CUSTOM_CATEGORY_LIMIT,
  hasProEntitlement,
} from "./billing";
import { validateTransactionReferences } from "./transactions";

interface ChangeRow {
  sequence: number;
  entityType: "account" | "category" | "transaction" | "budget";
  entityId: string;
  rowRevision: number;
  operation: "upsert" | "delete";
  payloadJson: string | null;
  serverUpdatedAt: string;
  atomicGroupId: string | null;
}

interface IdempotencyRow {
  requestHash: string;
  responseJson: string;
}

interface EntitySyncRow {
  payloadJson: string;
}

interface CompactionTenantRow {
  tenantId: string;
  safeSequence: number;
}

export interface MobileSyncCompactionResult {
  tenants: number;
  deletedChanges: number;
  expiredClients: number;
}

type AccountSnapshot = ReturnType<typeof mobileSyncAccountSnapshotSchema.parse>;
type CategorySnapshot = ReturnType<typeof mobileSyncCategorySnapshotSchema.parse>;
type TransactionSnapshot = ReturnType<typeof mobileSyncTransactionSnapshotSchema.parse>;
type TransferSnapshot = ReturnType<typeof mobileSyncTransferSnapshotSchema.parse>;
type BudgetSnapshot = ReturnType<typeof mobileSyncBudgetSnapshotSchema.parse>;
type EntitySnapshot =
  | AccountSnapshot
  | CategorySnapshot
  | TransactionSnapshot
  | TransferSnapshot
  | BudgetSnapshot;

function withCategoryLock(snapshot: EntitySnapshot | null, hasPro: boolean): EntitySnapshot | null {
  const category = mobileSyncCategorySnapshotSchema.safeParse(snapshot);
  return category.success
    ? {
        ...category.data,
        locked: category.data.requiredPlan === "zoption_pro" && !hasPro,
      }
    : snapshot;
}

export interface MobileSyncRepository {
  acknowledge(
    env: Bindings,
    tenantId: string,
    input: MobileSyncAcknowledgeRequest,
  ): Promise<MobileSyncAcknowledgeResponse>;
  snapshot(
    env: Bindings,
    tenantId: string,
    input: MobileSyncSnapshotRequest,
  ): Promise<MobileSyncSnapshotResponse>;
  pull(
    env: Bindings,
    tenantId: string,
    input: MobileSyncPullRequest,
  ): Promise<MobileSyncPullResponse>;
  push(
    env: Bindings,
    tenantId: string,
    input: MobileSyncPushRequest,
  ): Promise<MobileSyncPushResponse>;
}

type EntitlementReader = (env: Bindings, tenantId: string) => Promise<boolean>;

export function encodeMobileSyncCursor(sequence: number): string {
  if (!Number.isSafeInteger(sequence) || sequence < 0) {
    throw new Error("Cannot encode an invalid mobile sync sequence.");
  }
  return `v1.${sequence.toString(36)}`;
}

export function decodeMobileSyncCursor(cursor: string | null): number {
  if (cursor === null) return 0;
  const encoded = cursor.slice(3);
  const sequence = Number.parseInt(encoded, 36);
  if (
    !Number.isSafeInteger(sequence) ||
    sequence < 0 ||
    encodeMobileSyncCursor(sequence) !== cursor
  ) {
    throw new HttpError(400, "invalid_sync_cursor", "Restart synchronization from this device.");
  }
  return sequence;
}

export function encodeMobileSyncSnapshotCursor(sequence: number): string {
  if (!Number.isSafeInteger(sequence) || sequence < 0) {
    throw new Error("Cannot encode an invalid mobile snapshot sequence.");
  }
  return `s1.${sequence.toString(36)}`;
}

export function decodeMobileSyncSnapshotCursor(cursor: string): number {
  const encoded = cursor.slice(3);
  const sequence = Number.parseInt(encoded, 36);
  if (
    !Number.isSafeInteger(sequence) ||
    sequence < 0 ||
    encodeMobileSyncSnapshotCursor(sequence) !== cursor
  ) {
    throw new HttpError(400, "invalid_snapshot_cursor", "Restart the safe full snapshot.");
  }
  return sequence;
}

function decodePayload(row: ChangeRow, hasPro: boolean): MobileSyncChange {
  try {
    let payload: unknown = null;
    if (row.operation === "upsert") {
      if (!row.payloadJson) throw new Error("missing_payload");
      payload = JSON.parse(row.payloadJson) as unknown;
      if (row.entityType === "category") {
        const category = mobileSyncCategorySnapshotSchema.parse(payload);
        payload = {
          ...category,
          locked: category.requiredPlan === "zoption_pro" && !hasPro,
        };
      }
    }
    return mobileSyncChangeSchema.parse({
      entityType: row.entityType,
      entityId: row.entityId,
      revision: row.rowRevision,
      operation: row.operation,
      serverUpdatedAt: row.serverUpdatedAt,
      payload,
    });
  } catch {
    // Do not let Zod include a financial payload in the global error log.
    throw new Error("Stored mobile synchronization data failed validation.");
  }
}

function atomicPullPage(rows: ChangeRow[], limit: number): ChangeRow[] {
  const page: ChangeRow[] = [];
  for (let index = 0; index < rows.length;) {
    if (page.length >= limit) break;
    const row = rows[index]!;
    if (!row.atomicGroupId) {
      page.push(row);
      index += 1;
      continue;
    }
    let end = index + 1;
    while (rows[end]?.atomicGroupId === row.atomicGroupId) end += 1;
    const group = rows.slice(index, end);
    if (group.length !== 2 || group.some((item) => item.entityType !== "transaction")) {
      throw new HttpError(
        409,
        "full_resync_required",
        "A transfer synchronization boundary is invalid. Start a safe full resynchronization.",
        { reason: "invalid_atomic_transfer_boundary" },
      );
    }
    if (page.length > 0 && page.length + group.length > limit) break;
    page.push(...group);
    index = end;
  }
  return page;
}

function serverTimestamp(): string {
  return new Date()
    .toISOString()
    .replace("T", " ")
    .replace(/\.\d{3}Z$/, "");
}

/**
 * Removes only changes every non-expired installation has acknowledged and that
 * are older than the supported 90-day offline window. Latest live snapshots are
 * retained; acknowledged deletion tombstones may be compacted because a future
 * full snapshot represents their absence.
 */
export async function compactMobileSyncChanges(
  env: Bindings,
  now = serverTimestamp(),
  batchLimit = 1_000,
): Promise<MobileSyncCompactionResult> {
  if (!Number.isSafeInteger(batchLimit) || batchLimit < 1 || batchLimit > 5_000) {
    throw new Error("Choose a mobile sync compaction batch from 1 to 5,000.");
  }
  const cutoff = new Date(`${now.replace(" ", "T")}Z`);
  if (Number.isNaN(cutoff.getTime())) throw new Error("Choose a valid compaction timestamp.");
  cutoff.setUTCDate(cutoff.getUTCDate() - 90);
  const cutoffTimestamp = cutoff
    .toISOString()
    .replace("T", " ")
    .replace(/\.\d{3}Z$/, "");

  await env.DB.prepare(
    `UPDATE mobile_sync_clients SET snapshot_sequence = NULL, snapshot_expires_at = NULL
     WHERE snapshot_expires_at IS NOT NULL AND snapshot_expires_at < ?`,
  )
    .bind(now)
    .run();
  const expired = await env.DB.prepare(
    `DELETE FROM mobile_sync_clients
     WHERE expires_at < ? AND snapshot_sequence IS NULL`,
  )
    .bind(now)
    .run();
  const candidates = await env.DB.prepare(
    `SELECT state.tenant_id AS tenantId,
            MIN(clients.acknowledged_sequence) AS safeSequence
     FROM mobile_sync_state state
     JOIN mobile_sync_clients clients ON clients.tenant_id = state.tenant_id
     WHERE clients.expires_at >= ?
       AND NOT EXISTS (
         SELECT 1 FROM mobile_sync_clients snapshot
         WHERE snapshot.tenant_id = state.tenant_id
           AND snapshot.snapshot_expires_at >= ?
       )
     GROUP BY state.tenant_id
     HAVING MIN(clients.acknowledged_sequence) > state.retention_floor_sequence
     LIMIT 100`,
  )
    .bind(now, now)
    .all<CompactionTenantRow>();

  let deletedChanges = 0;
  for (const candidate of candidates.results) {
    const safeSequence = Number(candidate.safeSequence);
    if (!Number.isSafeInteger(safeSequence) || safeSequence < 1) continue;
    const results = await env.DB.batch([
      env.DB.prepare(
        `DELETE FROM mobile_sync_changes
         WHERE tenant_id = ? AND sequence IN (
           SELECT old.sequence
           FROM mobile_sync_changes old
           WHERE old.tenant_id = ? AND old.sequence <= ? AND old.server_updated_at < ?
             AND (
               old.operation = 'delete'
               OR EXISTS (
                 SELECT 1 FROM mobile_sync_changes newer
                 WHERE newer.tenant_id = old.tenant_id
                   AND newer.entity_type = old.entity_type
                   AND newer.entity_id = old.entity_id
                   AND newer.sequence > old.sequence
               )
             )
           ORDER BY old.sequence LIMIT ?
         )`,
      ).bind(candidate.tenantId, candidate.tenantId, safeSequence, cutoffTimestamp, batchLimit),
      env.DB.prepare(
        `UPDATE mobile_sync_state
         SET retention_floor_sequence = MAX(retention_floor_sequence, ?), updated_at = ?
         WHERE tenant_id = ?`,
      ).bind(safeSequence, now, candidate.tenantId),
    ]);
    deletedChanges += Number(results[0]?.meta.changes ?? 0);
  }
  return {
    tenants: candidates.results.length,
    deletedChanges,
    expiredClients: Number(expired.meta.changes ?? 0),
  };
}

async function requestHash(operation: MobileSyncPushOperation): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(operation));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function readIdempotency(
  env: Bindings,
  tenantId: string,
  clientId: string,
  idempotencyKey: string,
): Promise<IdempotencyRow | null> {
  return env.DB.prepare(
    `SELECT request_hash AS requestHash, response_json AS responseJson
     FROM mobile_sync_idempotency
     WHERE tenant_id = ? AND client_id = ? AND idempotency_key = ?`,
  )
    .bind(tenantId, clientId, idempotencyKey)
    .first<IdempotencyRow>();
}

function decodeStoredResult(row: IdempotencyRow): MobileSyncPushResult {
  try {
    return mobileSyncPushResultSchema.parse(JSON.parse(row.responseJson) as unknown);
  } catch {
    throw new Error("Stored mobile idempotency data failed validation.");
  }
}

async function readEntitySnapshot(
  env: Bindings,
  tenantId: string,
  entityType: MobileSyncPushOperation["entityType"],
  entityId: string,
): Promise<EntitySnapshot | null> {
  const view =
    entityType === "account"
      ? "mobile_sync_account_rows"
      : entityType === "category"
        ? "mobile_sync_category_rows"
        : entityType === "transaction"
          ? "mobile_sync_transaction_rows"
          : entityType === "budget"
            ? "mobile_sync_budget_rows"
            : "mobile_sync_transfer_rows";
  const row = await env.DB.prepare(
    `SELECT payload_json AS payloadJson FROM ${view} WHERE tenant_id = ? AND entity_id = ?`,
  )
    .bind(tenantId, entityId)
    .first<EntitySyncRow>();
  if (!row) return null;
  try {
    const payload = JSON.parse(row.payloadJson) as unknown;
    return entityType === "account"
      ? mobileSyncAccountSnapshotSchema.parse(payload)
      : entityType === "category"
        ? mobileSyncCategorySnapshotSchema.parse(payload)
        : entityType === "transaction"
          ? mobileSyncTransactionSnapshotSchema.parse(payload)
          : entityType === "budget"
            ? mobileSyncBudgetSnapshotSchema.parse(payload)
            : mobileSyncTransferSnapshotSchema.parse(payload);
  } catch {
    throw new Error("Stored mobile synchronization entity failed validation.");
  }
}

function conflictResult(
  operation: MobileSyncPushOperation,
  code: "stale_revision" | "entity_exists" | "entity_missing",
  snapshot: EntitySnapshot | null,
): MobileSyncPushResult {
  return {
    operationId: operation.operationId,
    entityType: operation.entityType,
    entityId: operation.entityId,
    status: "conflict",
    code,
    serverRevision: snapshot?.revision ?? null,
    serverUpdatedAt: snapshot?.updatedAt ?? null,
    serverPayload: snapshot,
  };
}

async function hasNameConflict(
  env: Bindings,
  tenantId: string,
  entityType: "account" | "category",
  name: string,
  excludeId?: string,
): Promise<boolean> {
  const table = entityType === "account" ? "accounts" : "categories";
  const row = await env.DB.prepare(
    `SELECT id FROM ${table}
     WHERE tenant_id = ? AND lower(name) = lower(?)${excludeId ? " AND id != ?" : ""}
     LIMIT 1`,
  )
    .bind(tenantId, name, ...(excludeId ? [excludeId] : []))
    .first<{ id: string }>();
  return Boolean(row);
}

async function readBudgetByMonthCategory(
  env: Bindings,
  tenantId: string,
  month: string,
  categoryId: string,
): Promise<BudgetSnapshot | null> {
  const row = await env.DB.prepare(
    `SELECT payload_json AS payloadJson
     FROM mobile_sync_budget_rows
     WHERE tenant_id = ? AND json_extract(payload_json, '$.month') = ?
       AND json_extract(payload_json, '$.categoryId') = ?
     LIMIT 1`,
  )
    .bind(tenantId, month, categoryId)
    .first<EntitySyncRow>();
  if (!row) return null;
  try {
    return mobileSyncBudgetSnapshotSchema.parse(JSON.parse(row.payloadJson) as unknown);
  } catch {
    throw new Error("Stored mobile synchronization entity failed validation.");
  }
}

async function validateBudgetCategory(
  env: Bindings,
  tenantId: string,
  categoryId: string,
): Promise<boolean> {
  const row = await env.DB.prepare(
    `SELECT id FROM categories
     WHERE tenant_id = ? AND id = ? AND kind = 'expense' AND archived = 0
     LIMIT 1`,
  )
    .bind(tenantId, categoryId)
    .first<{ id: string }>();
  return Boolean(row);
}

async function hasEffectiveProEntitlementRow(env: Bindings, tenantId: string): Promise<boolean> {
  const row = await env.DB.prepare(
    "SELECT 1 AS entitled FROM effective_pro_entitlements WHERE tenant_id = ? LIMIT 1",
  )
    .bind(tenantId)
    .first<{ entitled: number }>();
  return Boolean(row);
}

async function activeFreeCustomCategoryCount(env: Bindings, tenantId: string): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS count FROM categories
     WHERE tenant_id = ? AND origin = 'custom' AND required_plan = 'free' AND archived = 0`,
  )
    .bind(tenantId)
    .first<{ count: number }>();
  return Number(row?.count ?? 0);
}

async function businessRejection(
  env: Bindings,
  tenantId: string,
  operation: MobileSyncPushOperation,
  current: EntitySnapshot | null,
): Promise<MobileSyncPushResult | null> {
  if (
    operation.entityType === "transaction" ||
    operation.entityType === "transfer" ||
    operation.entityType === "budget"
  ) {
    return null;
  }

  const existing =
    operation.entityType === "account"
      ? current && mobileSyncAccountSnapshotSchema.parse(current)
      : current && mobileSyncCategorySnapshotSchema.parse(current);
  const name = operation.operationType === "delete" ? null : operation.payload.name;
  if (
    name &&
    (await hasNameConflict(
      env,
      tenantId,
      operation.entityType,
      name,
      operation.operationType === "create" ? undefined : operation.entityId,
    ))
  ) {
    return rejectedResult(
      operation,
      "invalid_operation",
      `A ${operation.entityType} with that name already exists.`,
    );
  }

  if (existing?.system) {
    const changingProtectedAccountName =
      operation.entityType === "account" &&
      operation.operationType === "update" &&
      operation.payload.name !== existing.name;
    if (
      operation.operationType === "delete" ||
      operation.entityType === "category" ||
      changingProtectedAccountName
    ) {
      return rejectedResult(
        operation,
        "invalid_operation",
        `This permanent ${operation.entityType} cannot be changed that way.`,
      );
    }
  }

  if (operation.entityType !== "category") return null;
  const category = existing as CategorySnapshot | null;
  const restoring =
    operation.operationType === "update" &&
    category?.archived === true &&
    operation.payload.archived === false;
  if (operation.operationType !== "create" && !restoring) return null;
  if (await hasEffectiveProEntitlementRow(env, tenantId)) return null;
  if (category?.requiredPlan === "zoption_pro") {
    return rejectedResult(
      operation,
      "plan_limit",
      "Restore this category with an active Zoption Pro subscription.",
    );
  }
  if ((await activeFreeCustomCategoryCount(env, tenantId)) >= FREE_CUSTOM_CATEGORY_LIMIT) {
    return rejectedResult(operation, "plan_limit", "You have reached your custom category limit.");
  }
  return null;
}

function rejectedResult(
  operation: MobileSyncPushOperation,
  code: Extract<MobileSyncPushResult, { status: "rejected" }>["code"],
  message: string,
): MobileSyncPushResult {
  return {
    operationId: operation.operationId,
    entityType: operation.entityType,
    entityId: operation.entityId,
    status: "rejected",
    code,
    message,
  };
}

function idempotencyInsert(
  env: Bindings,
  tenantId: string,
  clientId: string,
  operation: MobileSyncPushOperation,
  hash: string,
  result: MobileSyncPushResult,
  requirePreviousChange: boolean,
) {
  return env.DB.prepare(
    `INSERT INTO mobile_sync_idempotency (
      tenant_id, client_id, idempotency_key, request_hash, response_json
    ) SELECT ?, ?, ?, ?, ? ${requirePreviousChange ? "WHERE changes() = 1" : ""}`,
  ).bind(tenantId, clientId, operation.idempotencyKey, hash, JSON.stringify(result));
}

function requiredIdempotencyInsert(
  env: Bindings,
  tenantId: string,
  clientId: string,
  operation: MobileSyncPushOperation,
  hash: string,
  result: MobileSyncPushResult,
  expectedPreviousChanges = 1,
) {
  return env.DB.prepare(
    `INSERT INTO mobile_sync_idempotency (
      tenant_id, client_id, idempotency_key, request_hash, response_json
    ) VALUES (?, ?, ?, CASE WHEN changes() = ? THEN ? ELSE NULL END, ?)`,
  ).bind(
    tenantId,
    clientId,
    operation.idempotencyKey,
    expectedPreviousChanges,
    hash,
    JSON.stringify(result),
  );
}

async function persistResult(
  env: Bindings,
  tenantId: string,
  clientId: string,
  operation: MobileSyncPushOperation,
  hash: string,
  result: MobileSyncPushResult,
): Promise<MobileSyncPushResult> {
  try {
    await idempotencyInsert(env, tenantId, clientId, operation, hash, result, false).run();
    return result;
  } catch {
    const replay = await readIdempotency(env, tenantId, clientId, operation.idempotencyKey);
    if (!replay || replay.requestHash !== hash) {
      throw new HttpError(
        409,
        "idempotency_key_reused",
        "This synchronization key was already used for another operation.",
      );
    }
    return decodeStoredResult(replay);
  }
}

type NonTransferTransactionInput = Extract<TransactionInput, { kind: "income" | "expense" }>;

function updateInput(
  payload: TransactionUpdate,
  current: TransactionSnapshot,
): NonTransferTransactionInput | null {
  if (current.kind === "transfer" || current.transferGroupId || payload.kind === "transfer") {
    return null;
  }
  const accountId = payload.accountId ?? current.accountId;
  if (!accountId) return null;
  const kind = payload.kind ?? current.kind;
  return {
    date: payload.date ?? current.date,
    description: payload.description ?? current.description,
    amountMinor: Math.abs(payload.amountMinor ?? current.amountMinor),
    currency: payload.currency ?? current.currency,
    kind,
    categoryId: payload.categoryId ?? current.categoryId,
    accountId,
    notes: payload.notes !== undefined ? payload.notes : (current.notes ?? undefined),
  };
}

type CreateOperation = MobileSyncPushOperation & { operationType: "create"; baseRevision: 0 };
type AccountCreateOperation = CreateOperation & {
  entityType: "account";
  payload: AccountInput;
};
type CategoryCreateOperation = CreateOperation & {
  entityType: "category";
  payload: CategoryInput;
};
type TransactionCreateOperation = CreateOperation & {
  entityType: "transaction";
  payload: TransactionInput;
};
type NamedCreateOperation = AccountCreateOperation | CategoryCreateOperation;

function isCreateOperation(operation: MobileSyncPushOperation): operation is CreateOperation {
  return operation.operationType === "create";
}

function isAccountCreate(operation: CreateOperation): operation is AccountCreateOperation {
  return operation.entityType === "account";
}

function isCategoryCreate(operation: CreateOperation): operation is CategoryCreateOperation {
  return operation.entityType === "category";
}

function isTransactionCreate(operation: CreateOperation): operation is TransactionCreateOperation {
  return operation.entityType === "transaction";
}

interface ExistingGraphCategory {
  kind: TransactionInput["kind"];
  archived: number;
  requiredPlan: "free" | "zoption_pro";
}

function dependencyFailedResult(
  operation: MobileSyncPushOperation,
  message: string,
): MobileSyncPushResult {
  return rejectedResult(operation, "dependency_failed", message);
}

function graphReplayResponse(
  stored: Array<IdempotencyRow | null>,
  hashes: string[],
): MobileSyncPushResponse | null {
  if (stored.some((row, index) => row !== null && row.requestHash !== hashes[index])) {
    throw new HttpError(
      409,
      "idempotency_key_reused",
      "This synchronization key was already used for another operation.",
    );
  }
  if (stored.every((row, index) => row !== null && row.requestHash === hashes[index])) {
    return {
      protocolVersion: MOBILE_SYNC_PROTOCOL_VERSION,
      results: stored.map((row) => decodeStoredResult(row!)),
    };
  }
  if (stored.some(Boolean)) {
    throw new HttpError(
      409,
      "dependency_graph_replay_mismatch",
      "This dependency graph was not previously committed as one atomic unit.",
    );
  }
  return null;
}

function isConnectedDependencyGraph(operations: MobileSyncPushOperation[]): boolean {
  if (operations.length === 0) return false;
  const adjacency = new Map(
    operations.map((operation) => [operation.operationId, new Set<string>()] as const),
  );
  for (const operation of operations) {
    for (const dependencyId of operation.dependencyIds) {
      const dependency = adjacency.get(dependencyId);
      if (!dependency) return false;
      adjacency.get(operation.operationId)!.add(dependencyId);
      dependency.add(operation.operationId);
    }
  }
  const visited = new Set<string>();
  const pending = [operations[0]!.operationId];
  while (pending.length > 0) {
    const operationId = pending.pop()!;
    if (visited.has(operationId)) continue;
    visited.add(operationId);
    pending.push(...adjacency.get(operationId)!);
  }
  return visited.size === operations.length;
}

async function persistGraphResults(
  env: Bindings,
  tenantId: string,
  clientId: string,
  operations: MobileSyncPushOperation[],
  hashes: string[],
  results: MobileSyncPushResult[],
): Promise<MobileSyncPushResponse> {
  try {
    await env.DB.batch(
      operations.map((operation, index) =>
        idempotencyInsert(
          env,
          tenantId,
          clientId,
          operation,
          hashes[index]!,
          results[index]!,
          false,
        ),
      ),
    );
    return { protocolVersion: MOBILE_SYNC_PROTOCOL_VERSION, results };
  } catch {
    const stored = await Promise.all(
      operations.map((operation) =>
        readIdempotency(env, tenantId, clientId, operation.idempotencyKey),
      ),
    );
    const replay = graphReplayResponse(stored, hashes);
    if (replay) return replay;
    throw new Error("The dependency graph result could not be persisted atomically.");
  }
}

async function validateGraphTransactionReferences(
  env: Bindings,
  tenantId: string,
  operation: TransactionCreateOperation,
  plannedAccounts: Map<string, AccountCreateOperation>,
  plannedCategories: Map<string, CategoryCreateOperation>,
  hasPro: boolean,
): Promise<MobileSyncPushResult | null> {
  const transaction = operation.payload;
  if (transaction.kind === "transfer") {
    return rejectedResult(
      operation,
      "unsupported_operation",
      "Transfers require the atomic transfer synchronization command.",
    );
  }

  const requiredDependencies = [
    plannedAccounts.get(transaction.accountId)?.operationId,
    plannedCategories.get(transaction.categoryId)?.operationId,
  ].filter((value): value is string => Boolean(value));
  if (
    requiredDependencies.length === 0 ||
    requiredDependencies.some((operationId) => !operation.dependencyIds.includes(operationId)) ||
    operation.dependencyIds.some((operationId) => !requiredDependencies.includes(operationId))
  ) {
    return rejectedResult(
      operation,
      "invalid_operation",
      "Transaction dependencies must exactly match its new account and category references.",
    );
  }

  if (!plannedAccounts.has(transaction.accountId)) {
    const account = await env.DB.prepare(
      "SELECT archived FROM accounts WHERE id = ? AND tenant_id = ?",
    )
      .bind(transaction.accountId, tenantId)
      .first<{ archived: number }>();
    if (!account || account.archived === 1) {
      return rejectedResult(operation, "invalid_account", "Choose an active account.");
    }
  }

  const plannedCategory = plannedCategories.get(transaction.categoryId);
  if (plannedCategory) {
    if (plannedCategory.payload.kind !== transaction.kind) {
      return rejectedResult(
        operation,
        "invalid_category",
        "The category type must match the transaction type.",
      );
    }
  } else {
    const category = await env.DB.prepare(
      `SELECT kind, archived, required_plan AS requiredPlan
       FROM categories WHERE id = ? AND tenant_id = ?`,
    )
      .bind(transaction.categoryId, tenantId)
      .first<ExistingGraphCategory>();
    if (!category || category.archived === 1) {
      return rejectedResult(operation, "invalid_category", "Choose an active category.");
    }
    if (category.kind !== transaction.kind) {
      return rejectedResult(
        operation,
        "invalid_category",
        "The category type must match the transaction type.",
      );
    }
    if (category.requiredPlan === "zoption_pro" && !hasPro) {
      return rejectedResult(
        operation,
        "plan_limit",
        "This category requires an active Zoption Pro subscription.",
      );
    }
  }
  return null;
}

function createGraphMutation(
  env: Bindings,
  tenantId: string,
  operation: CreateOperation,
  timestamp: string,
): D1PreparedStatement {
  if (operation.entityType === "account") {
    const payload = accountInputSchema.parse(operation.payload);
    return env.DB.prepare(
      `INSERT INTO accounts (id, tenant_id, name, type, currency, revision, updated_at)
       SELECT ?, ?, ?, ?, 'PHP', 1, ?
       WHERE NOT EXISTS (
         SELECT 1 FROM accounts WHERE tenant_id = ? AND lower(name) = lower(?)
       )`,
    ).bind(
      operation.entityId,
      tenantId,
      payload.name,
      payload.type,
      timestamp,
      tenantId,
      payload.name,
    );
  }
  if (operation.entityType === "category") {
    const payload = categoryInputSchema.parse(operation.payload);
    return env.DB.prepare(
      `INSERT INTO categories (
         id, tenant_id, name, kind, color, origin, required_plan, revision, updated_at
       )
       SELECT ?, ?, ?, ?, ?, 'custom',
         CASE WHEN ${EFFECTIVE_PRO_ENTITLEMENT_CONDITION}
           THEN 'zoption_pro' ELSE 'free' END,
         1, ?
       WHERE NOT EXISTS (
         SELECT 1 FROM categories WHERE tenant_id = ? AND lower(name) = lower(?)
       )
         AND (
           ${EFFECTIVE_PRO_ENTITLEMENT_CONDITION}
           OR (
             SELECT COUNT(*) FROM categories
             WHERE tenant_id = ? AND origin = 'custom'
               AND required_plan = 'free' AND archived = 0
           ) < ?
         )`,
    ).bind(
      operation.entityId,
      tenantId,
      payload.name,
      payload.kind,
      payload.color,
      tenantId,
      timestamp,
      tenantId,
      payload.name,
      tenantId,
      tenantId,
      FREE_CUSTOM_CATEGORY_LIMIT,
    );
  }
  if (operation.entityType === "transfer") {
    throw new Error("A transfer reached the dependency-graph mutation builder.");
  }
  const transaction = transactionInputSchema.parse(operation.payload);
  if (transaction.kind === "transfer") {
    throw new Error("A transfer reached the non-transfer dependency graph.");
  }
  return env.DB.prepare(
    `INSERT INTO transactions (
      id, tenant_id, account_id, category_id, date, description, amount_minor,
      currency, kind, notes, source_kind, revision, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', 1, ?)`,
  ).bind(
    operation.entityId,
    tenantId,
    transaction.accountId,
    transaction.categoryId,
    transaction.date,
    transaction.description,
    normalizeSignedAmount(transaction.amountMinor, transaction.kind),
    transaction.currency,
    transaction.kind,
    transaction.notes || null,
    timestamp,
  );
}

async function pushCreateDependencyGraph(
  env: Bindings,
  tenantId: string,
  input: MobileSyncPushRequest,
  readEntitlement: EntitlementReader,
): Promise<MobileSyncPushResponse> {
  const operations = input.operations;
  const hashes = await Promise.all(operations.map(requestHash));
  const stored = await Promise.all(
    operations.map((operation) =>
      readIdempotency(env, tenantId, input.clientId, operation.idempotencyKey),
    ),
  );
  if (stored.some(Boolean)) {
    return graphReplayResponse(stored, hashes)!;
  }

  const referencedOperations = new Set(operations.flatMap((operation) => operation.dependencyIds));
  const operationById = new Map(operations.map((operation) => [operation.operationId, operation]));
  const createOperations = operations.filter(isCreateOperation);
  const positions = new Map(operations.map((operation, index) => [operation.operationId, index]));
  const dependenciesAreOrdered = operations.every((operation, index) =>
    operation.dependencyIds.every((dependencyId) => {
      const dependencyPosition = positions.get(dependencyId);
      return dependencyPosition !== undefined && dependencyPosition < index;
    }),
  );
  const graphShapeValid =
    createOperations.length === operations.length &&
    dependenciesAreOrdered &&
    isConnectedDependencyGraph(operations) &&
    operations.some((operation) => operation.dependencyIds.length > 0) &&
    operations.every(
      (operation) => operation.dependencyIds.length === 0 || operation.entityType === "transaction",
    ) &&
    operations.every((operation) => operation.entityType !== "transfer") &&
    operations.every(
      (operation) =>
        operation.dependencyIds.length > 0 || referencedOperations.has(operation.operationId),
    );
  if (!graphShapeValid) {
    const results = operations.map((operation) =>
      rejectedResult(
        operation,
        "unsupported_operation",
        "Atomic dependency graphs currently support connected create operations only.",
      ),
    );
    return persistGraphResults(env, tenantId, input.clientId, operations, hashes, results);
  }

  const failures = new Map<string, MobileSyncPushResult>();
  const hasPro = await readEntitlement(env, tenantId);
  for (const operation of createOperations) {
    let current = await readEntitySnapshot(env, tenantId, operation.entityType, operation.entityId);
    if (operation.entityType === "category" && current) {
      current = withCategoryLock(current, hasPro);
    }
    if (current)
      failures.set(operation.operationId, conflictResult(operation, "entity_exists", current));
  }

  const plannedAccounts = new Map(
    createOperations.filter(isAccountCreate).map((operation) => [operation.entityId, operation]),
  );
  const plannedCategories = new Map(
    createOperations.filter(isCategoryCreate).map((operation) => [operation.entityId, operation]),
  );

  for (const group of [
    Array.from(plannedAccounts.values()),
    Array.from(plannedCategories.values()),
  ] as NamedCreateOperation[][]) {
    const names = new Map<string, string>();
    for (const operation of group) {
      const name = operation.payload.name.toLowerCase();
      const duplicate = names.get(name);
      if (duplicate) {
        const prior = operationById.get(duplicate)!;
        failures.set(
          operation.operationId,
          rejectedResult(operation, "invalid_operation", "Names must be unique within the graph."),
        );
        failures.set(
          duplicate,
          rejectedResult(prior, "invalid_operation", "Names must be unique within the graph."),
        );
      } else {
        names.set(name, operation.operationId);
      }
    }
  }

  for (const operation of createOperations) {
    if (failures.has(operation.operationId)) continue;
    const rejected = await businessRejection(env, tenantId, operation, null);
    if (rejected) failures.set(operation.operationId, rejected);
  }

  const serverHasPro = await hasEffectiveProEntitlementRow(env, tenantId);
  if (!serverHasPro) {
    const available = Math.max(
      0,
      FREE_CUSTOM_CATEGORY_LIMIT - (await activeFreeCustomCategoryCount(env, tenantId)),
    );
    Array.from(plannedCategories.values())
      .slice(available)
      .forEach((operation) =>
        failures.set(
          operation.operationId,
          rejectedResult(operation, "plan_limit", "You have reached your custom category limit."),
        ),
      );
  }

  for (const operation of createOperations) {
    if (!isTransactionCreate(operation) || failures.has(operation.operationId)) continue;
    const rejected = await validateGraphTransactionReferences(
      env,
      tenantId,
      operation,
      plannedAccounts,
      plannedCategories,
      hasPro,
    );
    if (rejected) failures.set(operation.operationId, rejected);
  }

  if (failures.size > 0) {
    const results = operations.map(
      (operation) =>
        failures.get(operation.operationId) ??
        dependencyFailedResult(
          operation,
          "No operation was applied because another item in this dependency graph failed.",
        ),
    );
    return persistGraphResults(env, tenantId, input.clientId, operations, hashes, results);
  }

  const timestamp = serverTimestamp();
  const results = createOperations.map((operation) =>
    mobileSyncPushResultSchema.parse({
      operationId: operation.operationId,
      entityType: operation.entityType,
      entityId: operation.entityId,
      status: "acknowledged",
      revision: 1,
    }),
  );
  const statements = createOperations.flatMap((operation, index) => [
    createGraphMutation(env, tenantId, operation, timestamp),
    requiredIdempotencyInsert(
      env,
      tenantId,
      input.clientId,
      operation,
      hashes[index]!,
      results[index]!,
    ),
  ]);
  try {
    const batch = await env.DB.batch(statements);
    if (
      createOperations.some(
        (_operation, index) => Number(batch[index * 2 + 1]?.meta.changes ?? 0) !== 1,
      )
    ) {
      throw new Error("A dependency graph acknowledgement guard did not commit.");
    }
    return { protocolVersion: MOBILE_SYNC_PROTOCOL_VERSION, results };
  } catch {
    const replay = await Promise.all(
      createOperations.map((operation) =>
        readIdempotency(env, tenantId, input.clientId, operation.idempotencyKey),
      ),
    );
    const response = graphReplayResponse(replay, hashes);
    if (response) return response;
    throw new Error("The dependency graph was rolled back before acknowledgement.");
  }
}

type TransferOperation = Extract<MobileSyncPushOperation, { entityType: "transfer" }>;

function transferValidationResult(
  operation: TransferOperation,
  error: HttpError,
): MobileSyncPushResult {
  const code =
    error.code === "invalid_category" || error.code === "category_kind_mismatch"
      ? "invalid_category"
      : error.code === "invalid_account"
        ? "invalid_account"
        : error.code === "category_requires_pro"
          ? "plan_limit"
          : "invalid_operation";
  return rejectedResult(operation, code, error.message);
}

async function pushTransferOperation(
  env: Bindings,
  tenantId: string,
  clientId: string,
  operation: TransferOperation,
  hash: string,
  readEntitlement: EntitlementReader,
): Promise<MobileSyncPushResult> {
  let current = await readEntitySnapshot(env, tenantId, "transfer", operation.entityId);
  if (operation.operationType === "create" && current) {
    return persistResult(
      env,
      tenantId,
      clientId,
      operation,
      hash,
      conflictResult(operation, "entity_exists", current),
    );
  }
  if (operation.operationType !== "create" && !current) {
    return persistResult(
      env,
      tenantId,
      clientId,
      operation,
      hash,
      conflictResult(operation, "entity_missing", null),
    );
  }
  if (
    operation.operationType !== "create" &&
    current &&
    current.revision !== operation.baseRevision
  ) {
    return persistResult(
      env,
      tenantId,
      clientId,
      operation,
      hash,
      conflictResult(operation, "stale_revision", current),
    );
  }

  const existing = current ? mobileSyncTransferSnapshotSchema.parse(current) : null;
  const transfer: TransferInput | null =
    operation.operationType === "delete" ? null : operation.payload.transfer;
  if (transfer) {
    try {
      await validateTransactionReferences(
        env,
        tenantId,
        transfer,
        existing?.categoryId,
        readEntitlement,
      );
    } catch (error) {
      if (!(error instanceof HttpError)) throw error;
      return persistResult(
        env,
        tenantId,
        clientId,
        operation,
        hash,
        transferValidationResult(operation, error),
      );
    }
  }

  const revision = operation.operationType === "create" ? 1 : operation.baseRevision + 1;
  const acknowledged = mobileSyncPushResultSchema.parse({
    operationId: operation.operationId,
    entityType: "transfer",
    entityId: operation.entityId,
    status: "acknowledged",
    revision,
  });
  const timestamp = serverTimestamp();
  const statements: D1PreparedStatement[] = [];
  if (operation.operationType === "create") {
    const payload = operation.payload;
    const [fromLeg, toLeg] = buildTransferLegs(payload.transfer);
    statements.push(
      env.DB.prepare(
        `INSERT INTO transfer_groups (id, tenant_id, from_transaction_id, to_transaction_id)
         VALUES (?, ?, ?, ?)`,
      ).bind(operation.entityId, tenantId, payload.fromTransactionId, payload.toTransactionId),
      env.DB.prepare(
        `INSERT INTO transactions (
          id, tenant_id, account_id, category_id, date, description, amount_minor,
          currency, kind, notes, transfer_group_id, transfer_fee_minor, source_kind,
          revision, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'transfer', ?, ?, ?, 'manual', 1, ?)`,
      ).bind(
        payload.fromTransactionId,
        tenantId,
        fromLeg.accountId,
        payload.transfer.categoryId,
        payload.transfer.date,
        fromLeg.description,
        fromLeg.amountMinor,
        payload.transfer.currency,
        payload.transfer.notes || null,
        operation.entityId,
        fromLeg.transferFeeMinor,
        timestamp,
      ),
      env.DB.prepare(
        `INSERT INTO transactions (
          id, tenant_id, account_id, category_id, date, description, amount_minor,
          currency, kind, notes, transfer_group_id, transfer_fee_minor, source_kind,
          revision, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'transfer', ?, ?, ?, 'manual', 1, ?)`,
      ).bind(
        payload.toTransactionId,
        tenantId,
        toLeg.accountId,
        payload.transfer.categoryId,
        payload.transfer.date,
        toLeg.description,
        toLeg.amountMinor,
        payload.transfer.currency,
        payload.transfer.notes || null,
        operation.entityId,
        toLeg.transferFeeMinor,
        timestamp,
      ),
    );
  } else if (operation.operationType === "update") {
    const snapshot = existing!;
    const [fromLeg, toLeg] = buildTransferLegs(operation.payload.transfer);
    statements.push(
      env.DB.prepare(
        `UPDATE transactions SET account_id = ?, category_id = ?, date = ?, description = ?,
          amount_minor = ?, currency = ?, notes = ?, transfer_fee_minor = ?, revision = ?,
          updated_at = ?
         WHERE id = ? AND tenant_id = ? AND transfer_group_id = ? AND kind = 'transfer'
           AND revision = ?`,
      ).bind(
        fromLeg.accountId,
        operation.payload.transfer.categoryId,
        operation.payload.transfer.date,
        fromLeg.description,
        fromLeg.amountMinor,
        operation.payload.transfer.currency,
        operation.payload.transfer.notes || null,
        fromLeg.transferFeeMinor,
        revision,
        timestamp,
        snapshot.fromTransactionId,
        tenantId,
        operation.entityId,
        operation.baseRevision,
      ),
      env.DB.prepare(
        `UPDATE transactions SET account_id = ?, category_id = ?, date = ?, description = ?,
          amount_minor = ?, currency = ?, notes = ?, transfer_fee_minor = ?, revision = ?,
          updated_at = ?
         WHERE id = ? AND tenant_id = ? AND transfer_group_id = ? AND kind = 'transfer'
           AND revision = ? AND changes() = 1`,
      ).bind(
        toLeg.accountId,
        operation.payload.transfer.categoryId,
        operation.payload.transfer.date,
        toLeg.description,
        toLeg.amountMinor,
        operation.payload.transfer.currency,
        operation.payload.transfer.notes || null,
        toLeg.transferFeeMinor,
        revision,
        timestamp,
        snapshot.toTransactionId,
        tenantId,
        operation.entityId,
        operation.baseRevision,
      ),
    );
  } else {
    const snapshot = existing!;
    statements.push(
      env.DB.prepare(
        `DELETE FROM transactions
         WHERE id = ? AND tenant_id = ? AND transfer_group_id = ? AND revision = ?`,
      ).bind(snapshot.fromTransactionId, tenantId, operation.entityId, operation.baseRevision),
      env.DB.prepare(
        `DELETE FROM transactions
         WHERE id = ? AND tenant_id = ? AND transfer_group_id = ? AND revision = ?
           AND changes() = 1`,
      ).bind(snapshot.toTransactionId, tenantId, operation.entityId, operation.baseRevision),
      env.DB.prepare(
        `DELETE FROM transfer_groups
         WHERE tenant_id = ? AND id = ? AND from_transaction_id = ? AND to_transaction_id = ?
           AND changes() = 1`,
      ).bind(tenantId, operation.entityId, snapshot.fromTransactionId, snapshot.toTransactionId),
    );
  }
  statements.push(
    requiredIdempotencyInsert(env, tenantId, clientId, operation, hash, acknowledged),
  );

  try {
    const batch = await env.DB.batch(statements);
    if (Number(batch.at(-1)?.meta.changes ?? 0) === 1) return acknowledged;
  } catch {
    const replay = await readIdempotency(env, tenantId, clientId, operation.idempotencyKey);
    if (replay) {
      if (replay.requestHash !== hash) {
        throw new HttpError(
          409,
          "idempotency_key_reused",
          "This synchronization key was already used for another operation.",
        );
      }
      return decodeStoredResult(replay);
    }
  }

  current = await readEntitySnapshot(env, tenantId, "transfer", operation.entityId);
  const concurrentCode =
    operation.operationType === "create"
      ? current
        ? "entity_exists"
        : null
      : !current
        ? "entity_missing"
        : current.revision !== operation.baseRevision
          ? "stale_revision"
          : null;
  return persistResult(
    env,
    tenantId,
    clientId,
    operation,
    hash,
    concurrentCode
      ? conflictResult(operation, concurrentCode, current)
      : rejectedResult(
          operation,
          "invalid_operation",
          "The transfer could not be applied atomically.",
        ),
  );
}

export function createMobileSyncRepository(
  readEntitlement: EntitlementReader = hasProEntitlement,
): MobileSyncRepository {
  return {
    async snapshot(env, tenantId, input) {
      let snapshotSequence: number;
      if (input.snapshotCursor === null) {
        const state = await env.DB.prepare(
          "SELECT sequence FROM mobile_sync_state WHERE tenant_id = ?",
        )
          .bind(tenantId)
          .first<{ sequence: number }>();
        snapshotSequence = Number(state?.sequence ?? 0);
        await env.DB.prepare(
          `INSERT INTO mobile_sync_clients (
            tenant_id, client_id, acknowledged_sequence, last_seen_at, expires_at,
            snapshot_sequence, snapshot_expires_at
          ) VALUES (?, ?, 0, datetime('now'), datetime('now', '+90 days'), ?, datetime('now', '+1 day'))
          ON CONFLICT (tenant_id, client_id) DO UPDATE SET
            last_seen_at = datetime('now'),
            expires_at = datetime('now', '+90 days'),
            snapshot_sequence = excluded.snapshot_sequence,
            snapshot_expires_at = excluded.snapshot_expires_at`,
        )
          .bind(tenantId, input.clientId, snapshotSequence)
          .run();
      } else {
        snapshotSequence = decodeMobileSyncSnapshotCursor(input.snapshotCursor);
        const client = await env.DB.prepare(
          `SELECT snapshot_sequence AS snapshotSequence
           FROM mobile_sync_clients
           WHERE tenant_id = ? AND client_id = ?
             AND snapshot_sequence = ? AND snapshot_expires_at >= datetime('now')`,
        )
          .bind(tenantId, input.clientId, snapshotSequence)
          .first<{ snapshotSequence: number }>();
        if (!client) {
          throw new HttpError(
            409,
            "full_resync_required",
            "This full snapshot expired or belongs to another installation. Restart it safely.",
            { reason: "snapshot_session_expired" },
          );
        }
        await env.DB.prepare(
          `UPDATE mobile_sync_clients
           SET last_seen_at = datetime('now'), expires_at = datetime('now', '+90 days')
           WHERE tenant_id = ? AND client_id = ?`,
        )
          .bind(tenantId, input.clientId)
          .run();
      }

      const result = await env.DB.prepare(
        `WITH ranked AS (
          SELECT changes.sequence, changes.entity_type AS entityType,
            changes.entity_id AS entityId, changes.row_revision AS rowRevision,
            changes.operation, changes.payload_json AS payloadJson,
            changes.server_updated_at AS serverUpdatedAt,
            groups.atomic_group_id AS atomicGroupId,
            ROW_NUMBER() OVER (
              PARTITION BY changes.entity_type, changes.entity_id
              ORDER BY changes.sequence DESC
            ) AS entityRank
          FROM mobile_sync_changes changes
          LEFT JOIN mobile_sync_change_groups groups
            ON groups.tenant_id = changes.tenant_id AND groups.sequence = changes.sequence
          WHERE changes.tenant_id = ? AND changes.sequence <= ?
        ), ordered AS (
          SELECT sequence, entityType, entityId, rowRevision, operation, payloadJson,
            serverUpdatedAt, atomicGroupId,
            ROW_NUMBER() OVER (
              ORDER BY CASE entityType
                WHEN 'account' THEN 1 WHEN 'category' THEN 2 ELSE 3 END,
                COALESCE(atomicGroupId, entityId), entityId
            ) - 1 AS snapshotPosition
          FROM ranked WHERE entityRank = 1 AND operation = 'upsert'
        )
        SELECT sequence, entityType, entityId, rowRevision, operation, payloadJson,
          serverUpdatedAt, atomicGroupId
        FROM ordered WHERE snapshotPosition >= ?
        ORDER BY snapshotPosition LIMIT ?`,
      )
        .bind(tenantId, snapshotSequence, input.offset, input.limit + 2)
        .all<ChangeRow>();
      const page = atomicPullPage(result.results, input.limit);
      const hasPro = page.some((change) => change.entityType === "category")
        ? await readEntitlement(env, tenantId)
        : false;
      const changes = page.map((change) => decodePayload(change, hasPro));
      const snapshotCursor = encodeMobileSyncSnapshotCursor(snapshotSequence);
      return mobileSyncSnapshotResponseSchema.parse({
        protocolVersion: MOBILE_SYNC_PROTOCOL_VERSION,
        snapshotCursor,
        changes,
        nextOffset: input.offset + page.length,
        hasMore: result.results.length > page.length,
        resumeCursor: encodeMobileSyncCursor(snapshotSequence),
      });
    },

    async acknowledge(env, tenantId, input) {
      const acknowledgedSequence = decodeMobileSyncCursor(input.cursor);
      const state = await env.DB.prepare(
        `SELECT sequence, retention_floor_sequence AS retentionFloorSequence
         FROM mobile_sync_state WHERE tenant_id = ?`,
      )
        .bind(tenantId)
        .first<{ sequence: number; retentionFloorSequence: number }>();
      const currentSequence = Number(state?.sequence ?? 0);
      const retentionFloorSequence = Number(state?.retentionFloorSequence ?? 0);
      if (acknowledgedSequence > currentSequence || acknowledgedSequence < retentionFloorSequence) {
        throw new HttpError(
          409,
          "full_resync_required",
          "This device cursor is outside the retained synchronization window.",
          { reason: "acknowledgement_outside_retention_window" },
        );
      }
      if (acknowledgedSequence > 0) {
        const boundary = await env.DB.prepare(
          `SELECT current_group.atomic_group_id AS currentGroupId,
                  next_group.atomic_group_id AS nextGroupId
           FROM (SELECT 1) marker
           LEFT JOIN mobile_sync_change_groups current_group
             ON current_group.tenant_id = ? AND current_group.sequence = ?
           LEFT JOIN mobile_sync_change_groups next_group
             ON next_group.tenant_id = ? AND next_group.sequence = ?`,
        )
          .bind(tenantId, acknowledgedSequence, tenantId, acknowledgedSequence + 1)
          .first<{ currentGroupId: string | null; nextGroupId: string | null }>();
        if (boundary?.currentGroupId && boundary.currentGroupId === boundary.nextGroupId) {
          throw new HttpError(
            400,
            "invalid_sync_cursor",
            "A device cannot acknowledge only half of an atomic transfer.",
          );
        }
      }

      await env.DB.prepare(
        `INSERT INTO mobile_sync_clients (
          tenant_id, client_id, acknowledged_sequence, last_seen_at, expires_at
        ) VALUES (?, ?, ?, datetime('now'), datetime('now', '+90 days'))
        ON CONFLICT (tenant_id, client_id) DO UPDATE SET
          acknowledged_sequence = MAX(acknowledged_sequence, excluded.acknowledged_sequence),
          last_seen_at = datetime('now'),
          expires_at = datetime('now', '+90 days'),
          snapshot_sequence = CASE
            WHEN snapshot_sequence IS NOT NULL
              AND excluded.acknowledged_sequence >= snapshot_sequence THEN NULL
            ELSE snapshot_sequence END,
          snapshot_expires_at = CASE
            WHEN snapshot_sequence IS NOT NULL
              AND excluded.acknowledged_sequence >= snapshot_sequence THEN NULL
            ELSE snapshot_expires_at END`,
      )
        .bind(tenantId, input.clientId, acknowledgedSequence)
        .run();
      const client = await env.DB.prepare(
        `SELECT acknowledged_sequence AS acknowledgedSequence
         FROM mobile_sync_clients WHERE tenant_id = ? AND client_id = ?`,
      )
        .bind(tenantId, input.clientId)
        .first<{ acknowledgedSequence: number }>();
      if (Number(client?.acknowledgedSequence ?? 0) !== acknowledgedSequence) {
        throw new HttpError(
          409,
          "full_resync_required",
          "This installation reported an older cursor than it previously acknowledged.",
          { reason: "client_cursor_regressed" },
        );
      }
      return mobileSyncAcknowledgeResponseSchema.parse({
        protocolVersion: MOBILE_SYNC_PROTOCOL_VERSION,
        acknowledgedCursor: encodeMobileSyncCursor(acknowledgedSequence),
        retentionFloorCursor: encodeMobileSyncCursor(retentionFloorSequence),
      });
    },

    async pull(env, tenantId, input) {
      const cursorSequence = decodeMobileSyncCursor(input.cursor);
      const state = await env.DB.prepare(
        `SELECT sequence, retention_floor_sequence AS retentionFloorSequence
         FROM mobile_sync_state WHERE tenant_id = ?`,
      )
        .bind(tenantId)
        .first<{ sequence: number; retentionFloorSequence: number }>();
      const currentSequence = Number(state?.sequence ?? 0);
      const retentionFloorSequence = Number(state?.retentionFloorSequence ?? 0);
      if (cursorSequence < retentionFloorSequence) {
        throw new HttpError(
          409,
          "full_resync_required",
          "This device cursor has expired. Start a safe full resynchronization.",
          { reason: "cursor_expired" },
        );
      }
      if (cursorSequence > currentSequence) {
        throw new HttpError(
          409,
          "full_resync_required",
          "This device cursor is no longer valid. Start a safe full resynchronization.",
          { reason: "cursor_ahead" },
        );
      }

      const result = await env.DB.prepare(
        `SELECT
          changes.sequence,
          changes.entity_type AS entityType,
          changes.entity_id AS entityId,
          changes.row_revision AS rowRevision,
          changes.operation,
          changes.payload_json AS payloadJson,
          changes.server_updated_at AS serverUpdatedAt,
          groups.atomic_group_id AS atomicGroupId
        FROM mobile_sync_changes changes
        LEFT JOIN mobile_sync_change_groups groups
          ON groups.tenant_id = changes.tenant_id AND groups.sequence = changes.sequence
        WHERE changes.tenant_id = ? AND changes.sequence > ?
        ORDER BY changes.sequence
        LIMIT ?`,
      )
        .bind(tenantId, cursorSequence, input.limit + 2)
        .all<ChangeRow>();

      const first = result.results[0];
      if (first?.atomicGroupId && cursorSequence > 0) {
        const previous = await env.DB.prepare(
          `SELECT atomic_group_id AS atomicGroupId
           FROM mobile_sync_change_groups
           WHERE tenant_id = ? AND sequence = ?`,
        )
          .bind(tenantId, cursorSequence)
          .first<{ atomicGroupId: string }>();
        if (previous?.atomicGroupId === first.atomicGroupId) {
          throw new HttpError(
            409,
            "full_resync_required",
            "This device cursor splits an atomic transfer. Start a safe full resynchronization.",
            { reason: "cursor_inside_atomic_transfer" },
          );
        }
      }
      const page = atomicPullPage(result.results, input.limit);
      const hasPro = page.some((change) => change.entityType === "category")
        ? await readEntitlement(env, tenantId)
        : false;
      const changes = page.map((change) => decodePayload(change, hasPro));
      const nextSequence = page.at(-1)?.sequence ?? cursorSequence;

      return {
        protocolVersion: MOBILE_SYNC_PROTOCOL_VERSION,
        changes,
        nextCursor: encodeMobileSyncCursor(nextSequence),
        hasMore: nextSequence < currentSequence,
      };
    },

    async push(env, tenantId, input) {
      if (input.operations.some((operation) => operation.dependencyIds.length > 0)) {
        return pushCreateDependencyGraph(env, tenantId, input, readEntitlement);
      }
      const results: MobileSyncPushResult[] = [];
      for (const operation of input.operations) {
        const hash = await requestHash(operation);
        const stored = await readIdempotency(
          env,
          tenantId,
          input.clientId,
          operation.idempotencyKey,
        );
        if (stored) {
          if (stored.requestHash !== hash) {
            throw new HttpError(
              409,
              "idempotency_key_reused",
              "This synchronization key was already used for another operation.",
            );
          }
          results.push(decodeStoredResult(stored));
          continue;
        }

        if (operation.entityType === "transfer") {
          results.push(
            await pushTransferOperation(
              env,
              tenantId,
              input.clientId,
              operation,
              hash,
              readEntitlement,
            ),
          );
          continue;
        }

        if (operation.dependencyIds.length > 0) {
          results.push(
            await persistResult(
              env,
              tenantId,
              input.clientId,
              operation,
              hash,
              rejectedResult(
                operation,
                "unsupported_operation",
                "Dependent operations require the future atomic dependency-graph protocol.",
              ),
            ),
          );
          continue;
        }

        let current = await readEntitySnapshot(
          env,
          tenantId,
          operation.entityType,
          operation.entityId,
        );
        if (operation.entityType === "category" && current) {
          current = withCategoryLock(current, await readEntitlement(env, tenantId));
        }
        if (operation.operationType === "create" && current) {
          results.push(
            await persistResult(
              env,
              tenantId,
              input.clientId,
              operation,
              hash,
              conflictResult(operation, "entity_exists", current),
            ),
          );
          continue;
        }
        if (operation.operationType !== "create" && !current) {
          results.push(
            await persistResult(
              env,
              tenantId,
              input.clientId,
              operation,
              hash,
              conflictResult(operation, "entity_missing", null),
            ),
          );
          continue;
        }
        if (
          operation.operationType !== "create" &&
          current &&
          current.revision !== operation.baseRevision
        ) {
          results.push(
            await persistResult(
              env,
              tenantId,
              input.clientId,
              operation,
              hash,
              conflictResult(operation, "stale_revision", current),
            ),
          );
          continue;
        }

        const rejected = await businessRejection(env, tenantId, operation, current);
        if (rejected) {
          results.push(
            await persistResult(env, tenantId, input.clientId, operation, hash, rejected),
          );
          continue;
        }

        if (operation.entityType === "budget" && operation.operationType === "create") {
          const payload = operation.payload;
          if (!(await validateBudgetCategory(env, tenantId, payload.categoryId))) {
            results.push(
              await persistResult(
                env,
                tenantId,
                input.clientId,
                operation,
                hash,
                rejectedResult(operation, "invalid_category", "Choose an active expense category."),
              ),
            );
            continue;
          }
          const existing = await readBudgetByMonthCategory(
            env,
            tenantId,
            payload.month,
            payload.categoryId,
          );
          if (existing && existing.id !== operation.entityId) {
            results.push(
              await persistResult(
                env,
                tenantId,
                input.clientId,
                operation,
                hash,
                conflictResult(operation, "entity_exists", existing),
              ),
            );
            continue;
          }
        }

        const timestamp = serverTimestamp();
        let transaction: NonTransferTransactionInput | null = null;
        let currentTransaction: TransactionSnapshot | null = null;
        if (operation.entityType === "transaction" && current) {
          currentTransaction = mobileSyncTransactionSnapshotSchema.parse(current);
        }
        if (operation.entityType === "transaction" && operation.operationType === "create") {
          const candidate = operation.payload;
          transaction = candidate.kind === "transfer" ? null : candidate;
        } else if (
          operation.entityType === "transaction" &&
          operation.operationType === "update" &&
          currentTransaction
        ) {
          transaction = updateInput(operation.payload, currentTransaction);
        }
        if (operation.entityType === "transaction" && operation.operationType !== "delete") {
          if (!transaction) {
            results.push(
              await persistResult(
                env,
                tenantId,
                input.clientId,
                operation,
                hash,
                rejectedResult(
                  operation,
                  "unsupported_operation",
                  "Transfers require the atomic transfer synchronization command.",
                ),
              ),
            );
            continue;
          }
          try {
            await validateTransactionReferences(
              env,
              tenantId,
              transaction,
              currentTransaction?.categoryId,
              readEntitlement,
            );
          } catch (error) {
            if (!(error instanceof HttpError)) throw error;
            const code =
              error.code === "invalid_category" || error.code === "category_kind_mismatch"
                ? "invalid_category"
                : error.code === "invalid_account"
                  ? "invalid_account"
                  : error.code === "category_requires_pro"
                    ? "plan_limit"
                    : "invalid_operation";
            results.push(
              await persistResult(
                env,
                tenantId,
                input.clientId,
                operation,
                hash,
                rejectedResult(operation, code, error.message),
              ),
            );
            continue;
          }
        }

        const revision = operation.operationType === "create" ? 1 : operation.baseRevision + 1;
        const acknowledged = mobileSyncPushResultSchema.parse({
          operationId: operation.operationId,
          entityType: operation.entityType,
          entityId: operation.entityId,
          status: "acknowledged",
          revision,
        });
        let mutation: D1PreparedStatement;
        if (operation.entityType === "account") {
          if (operation.operationType === "create") {
            const payload = operation.payload;
            mutation = env.DB.prepare(
              `INSERT INTO accounts (id, tenant_id, name, type, currency, revision, updated_at)
               SELECT ?, ?, ?, ?, 'PHP', 1, ?
               WHERE NOT EXISTS (
                 SELECT 1 FROM accounts WHERE tenant_id = ? AND lower(name) = lower(?)
               )`,
            ).bind(
              operation.entityId,
              tenantId,
              payload.name,
              payload.type,
              timestamp,
              tenantId,
              payload.name,
            );
          } else if (operation.operationType === "update") {
            const payload = operation.payload;
            const account = mobileSyncAccountSnapshotSchema.parse(current);
            mutation = env.DB.prepare(
              `UPDATE accounts SET name = ?, type = ?, updated_at = ?
               WHERE id = ? AND tenant_id = ? AND revision = ?
                 AND (system_key IS NULL OR name = ?)
                 AND NOT EXISTS (
                   SELECT 1 FROM accounts AS other
                   WHERE other.tenant_id = ? AND lower(other.name) = lower(?) AND other.id != ?
                 )`,
            ).bind(
              payload.name,
              payload.type ?? account.type,
              timestamp,
              operation.entityId,
              tenantId,
              operation.baseRevision,
              payload.name,
              tenantId,
              payload.name,
              operation.entityId,
            );
          } else {
            mutation = env.DB.prepare(
              `UPDATE accounts SET archived = 1, updated_at = ?
               WHERE id = ? AND tenant_id = ? AND revision = ? AND system_key IS NULL`,
            ).bind(timestamp, operation.entityId, tenantId, operation.baseRevision);
          }
        } else if (operation.entityType === "category") {
          if (operation.operationType === "create") {
            const payload = operation.payload;
            mutation = env.DB.prepare(
              `INSERT INTO categories (
                 id, tenant_id, name, kind, color, origin, required_plan, revision, updated_at
               )
               SELECT ?, ?, ?, ?, ?, 'custom',
                 CASE WHEN ${EFFECTIVE_PRO_ENTITLEMENT_CONDITION}
                   THEN 'zoption_pro' ELSE 'free' END,
                 1, ?
               WHERE NOT EXISTS (
                 SELECT 1 FROM categories WHERE tenant_id = ? AND lower(name) = lower(?)
               )
                 AND (
                   ${EFFECTIVE_PRO_ENTITLEMENT_CONDITION}
                   OR (
                     SELECT COUNT(*) FROM categories
                     WHERE tenant_id = ? AND origin = 'custom'
                       AND required_plan = 'free' AND archived = 0
                   ) < ?
                 )`,
            ).bind(
              operation.entityId,
              tenantId,
              payload.name,
              payload.kind,
              payload.color,
              tenantId,
              timestamp,
              tenantId,
              payload.name,
              tenantId,
              tenantId,
              FREE_CUSTOM_CATEGORY_LIMIT,
            );
          } else if (operation.operationType === "update") {
            const payload = operation.payload;
            const category = mobileSyncCategorySnapshotSchema.parse(current);
            const restoring = category.archived && payload.archived === false;
            mutation = env.DB.prepare(
              `UPDATE categories
               SET name = ?, color = ?, archived = ?, updated_at = ?
               WHERE id = ? AND tenant_id = ? AND revision = ? AND system_key IS NULL
                 AND NOT EXISTS (
                   SELECT 1 FROM categories AS other
                   WHERE other.tenant_id = ? AND lower(other.name) = lower(?) AND other.id != ?
                 )
                 AND (
                   ? = 0
                   OR (? = 'zoption_pro' AND ${EFFECTIVE_PRO_ENTITLEMENT_CONDITION})
                   OR (? = 'free' AND (
                     SELECT COUNT(*) FROM categories
                     WHERE tenant_id = ? AND origin = 'custom'
                       AND required_plan = 'free' AND archived = 0
                   ) < ?)
                 )`,
            ).bind(
              payload.name ?? category.name,
              payload.color ?? category.color,
              (payload.archived ?? category.archived) ? 1 : 0,
              timestamp,
              operation.entityId,
              tenantId,
              operation.baseRevision,
              tenantId,
              payload.name ?? category.name,
              operation.entityId,
              restoring ? 1 : 0,
              category.requiredPlan,
              tenantId,
              category.requiredPlan,
              tenantId,
              FREE_CUSTOM_CATEGORY_LIMIT,
            );
          } else {
            mutation = env.DB.prepare(
              `UPDATE categories SET archived = 1, updated_at = ?
               WHERE id = ? AND tenant_id = ? AND revision = ? AND system_key IS NULL`,
            ).bind(timestamp, operation.entityId, tenantId, operation.baseRevision);
          }
        } else if (operation.entityType === "budget") {
          if (operation.operationType === "create") {
            const payload = operation.payload;
            mutation = env.DB.prepare(
              `INSERT INTO budgets (id, tenant_id, category_id, month, limit_minor, revision, updated_at)
               SELECT ?, ?, ?, ?, ?, 1, ?
               WHERE NOT EXISTS (
                 SELECT 1 FROM budgets WHERE tenant_id = ? AND month = ? AND category_id = ?
               )`,
            ).bind(
              operation.entityId,
              tenantId,
              payload.categoryId,
              payload.month,
              payload.limitMinor,
              timestamp,
              tenantId,
              payload.month,
              payload.categoryId,
            );
          } else {
            const payload = operation.payload;
            mutation = env.DB.prepare(
              `UPDATE budgets SET limit_minor = ?, updated_at = ?
               WHERE id = ? AND tenant_id = ? AND revision = ?`,
            ).bind(
              payload.limitMinor,
              timestamp,
              operation.entityId,
              tenantId,
              operation.baseRevision,
            );
          }
        } else {
          mutation =
            operation.operationType === "create" && transaction
              ? env.DB.prepare(
                  `INSERT INTO transactions (
                    id, tenant_id, account_id, category_id, date, description, amount_minor,
                    currency, kind, notes, source_kind, revision, updated_at
                  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', 1, ?)`,
                ).bind(
                  operation.entityId,
                  tenantId,
                  transaction.accountId,
                  transaction.categoryId,
                  transaction.date,
                  transaction.description,
                  normalizeSignedAmount(transaction.amountMinor, transaction.kind),
                  transaction.currency,
                  transaction.kind,
                  transaction.notes || null,
                  timestamp,
                )
              : operation.operationType === "update" && transaction
                ? env.DB.prepare(
                    `UPDATE transactions SET
                      account_id = ?, category_id = ?, date = ?, description = ?, amount_minor = ?,
                      currency = ?, kind = ?, notes = ?, revision = ?, updated_at = ?
                     WHERE id = ? AND tenant_id = ? AND revision = ?`,
                  ).bind(
                    transaction.accountId,
                    transaction.categoryId,
                    transaction.date,
                    transaction.description,
                    normalizeSignedAmount(transaction.amountMinor, transaction.kind),
                    transaction.currency,
                    transaction.kind,
                    transaction.notes || null,
                    revision,
                    timestamp,
                    operation.entityId,
                    tenantId,
                    operation.baseRevision,
                  )
                : env.DB.prepare(
                    "DELETE FROM transactions WHERE id = ? AND tenant_id = ? AND revision = ?",
                  ).bind(operation.entityId, tenantId, operation.baseRevision);
        }

        try {
          const batch = await env.DB.batch([
            mutation,
            idempotencyInsert(env, tenantId, input.clientId, operation, hash, acknowledged, true),
          ]);
          if (Number(batch[1]?.meta.changes ?? 0) === 1) {
            results.push(acknowledged);
            continue;
          }
        } catch {
          const replay = await readIdempotency(
            env,
            tenantId,
            input.clientId,
            operation.idempotencyKey,
          );
          if (replay) {
            if (replay.requestHash !== hash) {
              throw new HttpError(
                409,
                "idempotency_key_reused",
                "This synchronization key was already used for another operation.",
              );
            }
            results.push(decodeStoredResult(replay));
            continue;
          }
        }

        let concurrent = await readEntitySnapshot(
          env,
          tenantId,
          operation.entityType,
          operation.entityId,
        );
        if (operation.entityType === "category" && concurrent) {
          concurrent = withCategoryLock(concurrent, await readEntitlement(env, tenantId));
        }
        const concurrentCode =
          operation.operationType === "create"
            ? concurrent
              ? "entity_exists"
              : null
            : !concurrent
              ? "entity_missing"
              : concurrent.revision !== operation.baseRevision
                ? "stale_revision"
                : null;
        if (
          operation.entityType === "budget" &&
          operation.operationType === "create" &&
          !concurrentCode
        ) {
          const raced = await readBudgetByMonthCategory(
            env,
            tenantId,
            operation.payload.month,
            operation.payload.categoryId,
          );
          if (raced) {
            results.push(
              await persistResult(
                env,
                tenantId,
                input.clientId,
                operation,
                hash,
                conflictResult(operation, "entity_exists", raced),
              ),
            );
            continue;
          }
        }
        const racedRejection = concurrentCode
          ? null
          : await businessRejection(env, tenantId, operation, concurrent);
        results.push(
          await persistResult(
            env,
            tenantId,
            input.clientId,
            operation,
            hash,
            racedRejection ??
              (concurrentCode
                ? conflictResult(operation, concurrentCode, concurrent)
                : rejectedResult(
                    operation,
                    "invalid_operation",
                    "The operation could not be applied safely.",
                  )),
          ),
        );
      }
      return { protocolVersion: MOBILE_SYNC_PROTOCOL_VERSION, results };
    },
  };
}

export const mobileSyncRepository = createMobileSyncRepository();
