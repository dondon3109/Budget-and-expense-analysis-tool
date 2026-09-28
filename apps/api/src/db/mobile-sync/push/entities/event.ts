import { mobileSyncEventSnapshotSchema, type MobileSyncPushOperation } from "@zoption/shared";

import type { Bindings } from "../../../../types";
import type { EntityMutation } from "../results";
import type { EntitySnapshot } from "../snapshots";

type EventOperation = Extract<MobileSyncPushOperation, { entityType: "event" }>;

export function eventMutation(
  env: Bindings,
  tenantId: string,
  operation: EventOperation,
  current: EntitySnapshot | null,
  timestamp: string,
): EntityMutation {
  let mutation: D1PreparedStatement;
  const extraStatements: D1PreparedStatement[] = [];
  if (operation.operationType === "create") {
    const payload = operation.payload;
    mutation = env.DB.prepare(
      `INSERT INTO calendar_events (
         id, tenant_id, title, date, start_time, end_time, notes, revision, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    ).bind(
      operation.entityId,
      tenantId,
      payload.title,
      payload.date,
      payload.startTime ?? null,
      payload.endTime ?? null,
      payload.notes ?? null,
      timestamp,
    );
  } else if (operation.operationType === "update") {
    const payload = operation.payload;
    const event = mobileSyncEventSnapshotSchema.parse(current);
    mutation = env.DB.prepare(
      `UPDATE calendar_events SET
         title = ?, date = ?, start_time = ?, end_time = ?, notes = ?, updated_at = ?
       WHERE id = ? AND tenant_id = ? AND revision = ?`,
    ).bind(
      payload.title ?? event.title,
      payload.date ?? event.date,
      payload.startTime === undefined ? event.startTime : payload.startTime,
      payload.endTime === undefined ? event.endTime : payload.endTime,
      payload.notes === undefined ? event.notes : payload.notes,
      timestamp,
      operation.entityId,
      tenantId,
      operation.baseRevision,
    );
  } else {
    mutation = env.DB.prepare(
      "DELETE FROM calendar_events WHERE id = ? AND tenant_id = ? AND revision = ?",
    ).bind(operation.entityId, tenantId, operation.baseRevision);
  }
  return { mutation, extraStatements };
}
