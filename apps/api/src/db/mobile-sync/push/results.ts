import type { MobileSyncPushOperation, MobileSyncPushResult } from "@zoption/shared";

import type { EntitySnapshot } from "./snapshots";

/**
 * The statements one applied single-entity operation writes. The facade batches them as
 * `[mutation, idempotency insert, ...extraStatements]`, so the insert can require that the
 * mutation changed exactly one row.
 */
export interface EntityMutation {
  mutation: D1PreparedStatement;
  extraStatements: D1PreparedStatement[];
}

export function conflictResult(
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

export function rejectedResult(
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

/**
 * The conflict an operation meets against the current server row, or null when it applies: a
 * create needs no row, and an update or delete needs the row at its base revision.
 */
export function revisionConflict(
  operation: MobileSyncPushOperation,
  current: EntitySnapshot | null,
): "entity_exists" | "entity_missing" | "stale_revision" | null {
  if (operation.operationType === "create") return current ? "entity_exists" : null;
  if (!current) return "entity_missing";
  if (current.revision !== operation.baseRevision) return "stale_revision";
  return null;
}
