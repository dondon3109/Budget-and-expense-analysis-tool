import { calendarEventInputSchema, type CalendarEventInput } from "@zoption/shared";

import type { LocalCommandContext } from "../context";
import { LocalMutationError, eventSnapshot, uuidSchema } from "../model";

export function createEvent(ctx: LocalCommandContext, value: CalendarEventInput): Promise<string> {
  const input = calendarEventInputSchema.parse(value);
  return ctx.writer.run(async () => {
    let entityId = "";
    await ctx.database.withTransactionAsync(async () => {
      await ctx.clientId();
      entityId = uuidSchema.parse(ctx.randomUuid());
      await ctx.database.runAsync(
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
      await ctx.database.runAsync(
        `INSERT INTO sync_outbox (
          operation_id, idempotency_key, entity_type, entity_id, operation_type,
          base_revision, payload_json, dependency_ids_json, base_json, created_sequence
        ) VALUES (?, ?, 'event', ?, 'create', 0, ?, '[]', '{}', ?)`,
        uuidSchema.parse(ctx.randomUuid()),
        uuidSchema.parse(ctx.randomUuid()),
        entityId,
        JSON.stringify({
          title: input.title,
          date: input.date,
          startTime: input.startTime ?? null,
          endTime: input.endTime ?? null,
          notes: input.notes ?? null,
        }),
        await ctx.store.nextSequence(),
      );
    });
    return entityId;
  });
}

export function updateEvent(
  ctx: LocalCommandContext,
  id: string,
  value: CalendarEventInput,
): Promise<void> {
  const update = calendarEventInputSchema.parse(value);
  return ctx.writer.run(async () => {
    await ctx.database.withTransactionAsync(async () => {
      const current = await ctx.store.currentEventById(id);
      if (current.sync_state === "failed" || current.sync_state === "conflicted") {
        throw new LocalMutationError(
          "Resolve this event's synchronization state before editing it.",
          "mutation_blocked",
        );
      }
      const outbox = await ctx.store.currentOutbox("event", id);
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
        await ctx.database.runAsync(
          `UPDATE sync_outbox SET payload_json = ?, state = 'pending', attempt_count = 0,
            next_attempt_at = NULL, last_error_code = NULL WHERE operation_id = ?`,
          JSON.stringify(merged),
          outbox.operation_id,
        );
      } else {
        await ctx.database.runAsync(
          `INSERT INTO sync_outbox (
            operation_id, idempotency_key, entity_type, entity_id, operation_type,
            base_revision, payload_json, dependency_ids_json, base_json, created_sequence
          ) VALUES (?, ?, 'event', ?, 'update', ?, ?, '[]', ?, ?)`,
          uuidSchema.parse(ctx.randomUuid()),
          uuidSchema.parse(ctx.randomUuid()),
          id,
          current.server_revision,
          JSON.stringify(merged),
          JSON.stringify(eventSnapshot(current)),
          await ctx.store.nextSequence(),
        );
      }
      await ctx.database.runAsync(
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

export function deleteEvent(ctx: LocalCommandContext, id: string): Promise<void> {
  return ctx.writer.run(async () => {
    await ctx.database.withTransactionAsync(async () => {
      const current = await ctx.store.currentEventById(id);
      if (current.sync_state === "failed" || current.sync_state === "conflicted") {
        throw new LocalMutationError(
          "Resolve this event's synchronization state before deleting it.",
          "mutation_blocked",
        );
      }
      const outbox = await ctx.store.currentOutbox("event", id);
      if (outbox && (outbox.state !== "pending" || outbox.attempt_count > 0)) {
        throw new LocalMutationError(
          "Wait for the current synchronization attempt before deleting this event.",
          "mutation_blocked",
        );
      }
      if (current.server_revision === 0 && outbox?.operation_type === "create") {
        await ctx.database.runAsync(
          "DELETE FROM sync_outbox WHERE operation_id = ?",
          outbox.operation_id,
        );
        await ctx.database.runAsync("DELETE FROM calendar_events WHERE id = ?", id);
        return;
      }
      if (outbox) {
        await ctx.database.runAsync(
          `UPDATE sync_outbox SET operation_type = 'delete', payload_json = '{}',
            state = 'pending', attempt_count = 0, next_attempt_at = NULL,
            last_error_code = NULL WHERE operation_id = ?`,
          outbox.operation_id,
        );
      } else {
        await ctx.database.runAsync(
          `INSERT INTO sync_outbox (
            operation_id, idempotency_key, entity_type, entity_id, operation_type,
            base_revision, payload_json, dependency_ids_json, base_json, created_sequence
          ) VALUES (?, ?, 'event', ?, 'delete', ?, '{}', '[]', ?, ?)`,
          uuidSchema.parse(ctx.randomUuid()),
          uuidSchema.parse(ctx.randomUuid()),
          id,
          current.server_revision,
          JSON.stringify(eventSnapshot(current)),
          await ctx.store.nextSequence(),
        );
      }
      await ctx.database.runAsync(
        "UPDATE calendar_events SET deleted_at = ?, sync_state = 'pending' WHERE id = ?",
        ctx.now().toISOString(),
        id,
      );
    });
  });
}
