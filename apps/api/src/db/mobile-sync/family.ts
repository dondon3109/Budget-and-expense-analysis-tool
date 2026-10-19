import {
  MOBILE_SYNC_PROTOCOL_VERSION,
  type MobileSyncPushOperation,
  type MobileSyncPushRequest,
  type MobileSyncPushResponse,
  type MobileSyncPushResult,
  type WorkspaceRole,
} from "@zoption/shared";

import type { FamilyAlerts } from "../../family-alerts";
import type { Bindings } from "../../types";
import type { Capture, FamilyJournal } from "../family-journal";
import { findTransaction } from "../transactions";
import { persistResult, readIdempotency, requestHash } from "./push/idempotency";
import { rejectedResult } from "./push/results";

/**
 * Who is pushing into a family, and the hooks the REST routes run for the same writes. Viewers
 * and closing families never get here: the auth middleware refuses their pushes.
 */
export interface FamilyPushScope {
  userId: string;
  role: Exclude<WorkspaceRole, "viewer">;
  journal: FamilyJournal;
  alerts: FamilyAlerts;
  /** Runs follow-up work (alerts) after the response, like the REST routes do. */
  defer(work: Promise<void>): Promise<void>;
}

type Run = (input: MobileSyncPushRequest) => Promise<MobileSyncPushResponse>;

// A family has no goals, debts, subscriptions, or events, the same as its REST surface.
const PERSONAL_ONLY = new Set(["goal", "debt", "subscription", "event"]);

const NOT_YOURS = "Only the person who added this entry, or the family owner, can change it.";

/** The author of a transaction, or of a transfer's legs; undefined when the row is gone. */
async function authorOf(
  env: Bindings,
  tenantId: string,
  operation: MobileSyncPushOperation,
): Promise<string | null | undefined> {
  const row = await env.DB.prepare(
    `SELECT created_by_user_id AS authorUserId FROM transactions
     WHERE tenant_id = ? AND ${operation.entityType === "transfer" ? "transfer_group_id" : "id"} = ?
     LIMIT 1`,
  )
    .bind(tenantId, operation.entityId)
    .first<{ authorUserId: string | null }>();
  return row ? row.authorUserId : undefined;
}

function changesEntry(operation: MobileSyncPushOperation): boolean {
  return (
    (operation.entityType === "transaction" || operation.entityType === "transfer") &&
    operation.operationType !== "create"
  );
}

async function familyRejection(
  env: Bindings,
  tenantId: string,
  scope: FamilyPushScope,
  operation: MobileSyncPushOperation,
): Promise<MobileSyncPushResult | null> {
  if (PERSONAL_ONLY.has(operation.entityType)) {
    return rejectedResult(operation, "unsupported_operation", "This is not available in a family.");
  }
  if (scope.role === "owner" || !changesEntry(operation)) return null;
  // A missing row falls through to the usual entity_missing conflict.
  const author = await authorOf(env, tenantId, operation);
  if (author === undefined || author === scope.userId) return null;
  return rejectedResult(operation, "invalid_operation", NOT_YOURS);
}

/** The ledger id the journal keys an entry by: a transfer's sending leg. */
async function journalId(
  env: Bindings,
  tenantId: string,
  operation: MobileSyncPushOperation,
): Promise<string | null> {
  if (operation.entityType === "transaction") return operation.entityId;
  const group = await env.DB.prepare(
    "SELECT from_transaction_id AS id FROM transfer_groups WHERE tenant_id = ? AND id = ?",
  )
    .bind(tenantId, operation.entityId)
    .first<{ id: string }>();
  return group?.id ?? null;
}

/**
 * Runs a push into a family under the rules its REST routes enforce: members change only their
 * own entries, personal-only entities are refused, edits and deletes are journaled, and a new
 * expense runs the family alerts. Refused operations get a rejected result; in a dependency
 * graph, which applies all or nothing, the rest fail with it.
 */
export async function pushIntoFamily(
  env: Bindings,
  tenantId: string,
  input: MobileSyncPushRequest,
  scope: FamilyPushScope,
  run: Run,
): Promise<MobileSyncPushResponse> {
  const fresh = new Set<string>();
  const refused = new Map<string, MobileSyncPushResult>();
  for (const operation of input.operations) {
    // A stored result replays as it was, whatever the rules say now.
    if (await readIdempotency(env, tenantId, input.clientId, operation.idempotencyKey)) continue;
    fresh.add(operation.operationId);
    const rejection = await familyRejection(env, tenantId, scope, operation);
    if (rejection) refused.set(operation.operationId, rejection);
  }

  const graph = input.operations.some((operation) => operation.dependencyIds.length > 0);
  if (graph && refused.size > 0) {
    for (const operation of input.operations) {
      if (refused.has(operation.operationId)) continue;
      refused.set(
        operation.operationId,
        rejectedResult(
          operation,
          "dependency_failed",
          "No operation was applied because another item in this dependency graph failed.",
        ),
      );
    }
  }

  const allowed = input.operations.filter((operation) => !refused.has(operation.operationId));
  const before = new Map<string, Capture>();
  const withdrawals = new Map<string, () => Promise<void>>();
  for (const operation of allowed) {
    if (!fresh.has(operation.operationId) || !changesEntry(operation)) continue;
    const id = await journalId(env, tenantId, operation);
    const captured = id ? await scope.journal.capture(env, tenantId, id) : null;
    if (!captured) continue;
    before.set(operation.operationId, captured);
    // A delete is journaled first, with the rows a restore needs, and withdrawn if it fails.
    if (operation.operationType === "delete") {
      withdrawals.set(
        operation.operationId,
        await scope.journal.recordDelete(env, tenantId, scope.userId, captured),
      );
    }
  }

  const applied = allowed.length > 0 ? (await run({ ...input, operations: allowed })).results : [];
  const appliedById = new Map(applied.map((result) => [result.operationId, result]));

  const results: MobileSyncPushResult[] = [];
  for (const operation of input.operations) {
    const rejection = refused.get(operation.operationId);
    if (rejection) {
      const hash = await requestHash(operation);
      results.push(await persistResult(env, tenantId, input.clientId, operation, hash, rejection));
      continue;
    }
    const result = appliedById.get(operation.operationId)!;
    results.push(result);
    if (!fresh.has(operation.operationId)) continue;
    const acknowledged = result.status === "acknowledged";
    const withdraw = withdrawals.get(operation.operationId);
    if (withdraw && !acknowledged) await withdraw();
    if (!acknowledged) continue;
    const captured = before.get(operation.operationId);
    if (captured && operation.operationType === "update") {
      const after = await findTransaction(env, tenantId, captured.transactionId);
      if (after) {
        await scope.journal.recordUpdate(env, tenantId, scope.userId, captured, after);
      }
    }
    if (operation.entityType === "transaction" && operation.operationType === "create") {
      const created = await findTransaction(env, tenantId, operation.entityId);
      if (created?.kind === "expense") {
        await scope.defer(scope.alerts.afterExpense(env, tenantId, scope.userId, created));
      }
    }
  }
  return { protocolVersion: MOBILE_SYNC_PROTOCOL_VERSION, results };
}
