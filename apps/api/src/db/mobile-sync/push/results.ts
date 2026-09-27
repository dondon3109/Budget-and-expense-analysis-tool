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
