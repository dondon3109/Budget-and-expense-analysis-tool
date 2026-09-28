// Conflicts on a calendar event.

import { mobileSyncEventSnapshotSchema } from "@zoption/shared";

import type { LocalMutationContext } from "../context";
import {
  LocalMutationError,
  conflictRowSchema,
  uuidSchema,
  type LocalEventConflict,
} from "../model";

export function getEventConflict(
  ctx: LocalMutationContext,
  entityId: string,
): Promise<LocalEventConflict | null> {
  return ctx.writer.run(async () => {
    const local = await ctx.store.currentEventRowById(entityId);
    const row = await ctx.database.getFirstAsync(
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

export function resolveEventConflict(
  ctx: LocalMutationContext,
  entityId: string,
  resolution: "keep_local" | "keep_server",
): Promise<void> {
  return ctx.writer.run(async () => {
    await ctx.database.withTransactionAsync(async () => {
      const local = await ctx.store.currentEventRowById(entityId);
      const conflict = await ctx.store.currentConflict("event", entityId);
      const outbox = await ctx.store.currentOutbox("event", entityId);
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

      await ctx.database.runAsync(
        `UPDATE sync_conflicts SET resolved_at = ?, resolution = ?, operation_id = NULL
         WHERE conflict_id = ? AND resolved_at IS NULL`,
        ctx.now().toISOString(),
        resolution,
        conflict.conflict_id,
      );
      await ctx.database.runAsync(
        "DELETE FROM sync_outbox WHERE operation_id = ?",
        outbox.operation_id,
      );

      if (resolution === "keep_server") {
        if (!serverSnapshot) {
          await ctx.database.runAsync("DELETE FROM calendar_events WHERE id = ?", entityId);
          return;
        }
        await upsertEventSnapshot(ctx, serverSnapshot, "synced");
        return;
      }

      const operationType = outbox.operation_type;
      if (operationType === "delete") {
        if (!serverSnapshot) {
          await ctx.database.runAsync("DELETE FROM calendar_events WHERE id = ?", entityId);
          return;
        }
        await ctx.database.runAsync(
          `INSERT INTO sync_outbox (
            operation_id, idempotency_key, entity_type, entity_id, operation_type,
            base_revision, payload_json, dependency_ids_json, base_json, created_sequence
          ) VALUES (?, ?, 'event', ?, 'delete', ?, '{}', '[]', ?, ?)`,
          uuidSchema.parse(ctx.randomUuid()),
          uuidSchema.parse(ctx.randomUuid()),
          entityId,
          serverSnapshot.revision,
          JSON.stringify(serverSnapshot),
          await ctx.store.nextSequence(),
        );
        await ctx.database.runAsync(
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
        await ctx.database.runAsync(
          `UPDATE calendar_events SET server_revision = 0, server_updated_at = NULL,
            sync_state = 'pending' WHERE id = ?`,
          entityId,
        );
        await ctx.database.runAsync(
          `INSERT INTO sync_outbox (
            operation_id, idempotency_key, entity_type, entity_id, operation_type,
            base_revision, payload_json, dependency_ids_json, base_json, created_sequence
          ) VALUES (?, ?, 'event', ?, 'create', 0, ?, '[]', '{}', ?)`,
          uuidSchema.parse(ctx.randomUuid()),
          uuidSchema.parse(ctx.randomUuid()),
          entityId,
          JSON.stringify(localInput),
          await ctx.store.nextSequence(),
        );
        return;
      }
      await ctx.database.runAsync(
        `UPDATE calendar_events SET server_revision = ?, server_updated_at = ?,
          sync_state = 'pending' WHERE id = ?`,
        serverSnapshot.revision,
        serverSnapshot.updatedAt,
        entityId,
      );
      await ctx.database.runAsync(
        `INSERT INTO sync_outbox (
          operation_id, idempotency_key, entity_type, entity_id, operation_type,
          base_revision, payload_json, dependency_ids_json, base_json, created_sequence
        ) VALUES (?, ?, 'event', ?, 'update', ?, ?, '[]', ?, ?)`,
        uuidSchema.parse(ctx.randomUuid()),
        uuidSchema.parse(ctx.randomUuid()),
        entityId,
        serverSnapshot.revision,
        JSON.stringify(localInput),
        JSON.stringify(serverSnapshot),
        await ctx.store.nextSequence(),
      );
    });
  });
}

async function upsertEventSnapshot(
  ctx: LocalMutationContext,
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
  await ctx.database.runAsync(
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
