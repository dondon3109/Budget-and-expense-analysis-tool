import {
  MOBILE_SYNC_PROTOCOL_VERSION,
  accountInputSchema,
  categoryInputSchema,
  interestUpdateSchema,
  mobileSyncPushResultSchema,
  normalizeSignedAmount,
  transactionInputSchema,
  type AccountInput,
  type CategoryInput,
  type MobileSyncPushOperation,
  type MobileSyncPushRequest,
  type MobileSyncPushResponse,
  type MobileSyncPushResult,
  type TransactionInput,
} from "@zoption/shared";

import { HttpError } from "../../../errors";
import type { Bindings } from "../../../types";
import { EFFECTIVE_PRO_ENTITLEMENT_CONDITION, FREE_CUSTOM_CATEGORY_LIMIT } from "../../billing";
import { mobileSyncServerTimestamp as serverTimestamp } from "../protocol";
import type { MobileSyncEntitlementReader as EntitlementReader } from "../read";
import {
  decodeStoredResult,
  idempotencyInsert,
  idempotencyKeyReused,
  readIdempotency,
  requestHash,
  requiredIdempotencyInsert,
  type IdempotencyRow,
} from "./idempotency";
import { conflictResult, rejectedResult } from "./results";
import {
  activeFreeCustomCategoryCount,
  businessRejection,
  hasEffectiveProEntitlementRow,
} from "./rules";
import { readEntitySnapshot, withCategoryLock } from "./snapshots";

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
    throw idempotencyKeyReused();
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
    const payload = accountInputSchema.parse({
      name: operation.payload.name,
      type: operation.payload.type,
    });
    const interest =
      operation.payload.interest !== undefined
        ? interestUpdateSchema.parse(operation.payload.interest)
        : null;
    const columns = interest
      ? ", interest_enabled, annual_rate_basis_points, interest_frequency, interest_pay_day"
      : "";
    const values = interest ? ", ?, ?, ?, ?" : "";
    const statement = env.DB.prepare(
      `INSERT INTO accounts (id, tenant_id, name, type, currency, revision, updated_at${columns})
       SELECT ?, ?, ?, ?, COALESCE((SELECT currency FROM tenants WHERE id = ?), 'PHP'), 1, ?${values}
       WHERE NOT EXISTS (
         SELECT 1 FROM accounts WHERE tenant_id = ? AND lower(name) = lower(?)
       )`,
    );
    const binds: unknown[] = [
      operation.entityId,
      tenantId,
      payload.name,
      payload.type,
      tenantId,
      timestamp,
    ];
    if (interest) {
      binds.push(
        interest.enabled ? 1 : 0,
        interest.annualRateBasisPoints,
        interest.frequency,
        interest.payDay,
      );
    }
    binds.push(tenantId, payload.name);
    return statement.bind(...binds);
  }
  if (operation.entityType === "category") {
    const payload = categoryInputSchema.parse(operation.payload);
    return env.DB.prepare(
      `INSERT INTO categories (
         id, tenant_id, name, kind, color, icon_emoji, origin, required_plan, revision, updated_at
       )
       SELECT ?, ?, ?, ?, ?, ?, 'custom',
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
      payload.iconEmoji ?? null,
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

export async function pushCreateDependencyGraph(
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
