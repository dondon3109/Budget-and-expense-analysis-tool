import { calendarEventInputSchema, type CalendarEventInput } from "@zoption/shared";

import type { LocalCommandContext } from "../context";
import { eventSnapshot, uuidSchema } from "../model";
import {
  assertRowSettled,
  assertNotQueuedForRemoval,
  assertNoAttemptInFlight,
  queueCreate,
  queueUpdate,
  queueDelete,
} from "./outbox-writes";

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
      await queueCreate(ctx, "event", entityId, {
        title: input.title,
        date: input.date,
        startTime: input.startTime ?? null,
        endTime: input.endTime ?? null,
        notes: input.notes ?? null,
      });
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
      assertRowSettled(current.sync_state, "event", "editing");
      const outbox = await ctx.store.currentOutbox("event", id);
      assertNotQueuedForRemoval(outbox, "event", "deleted");
      assertNoAttemptInFlight(outbox, "event", "editing");
      const merged = {
        title: update.title,
        date: update.date,
        startTime: update.startTime ?? null,
        endTime: update.endTime ?? null,
        notes: update.notes ?? null,
      };
      await queueUpdate(ctx, outbox, {
        entityType: "event",
        entityId: id,
        baseRevision: current.server_revision,
        payload: merged,
        base: () => eventSnapshot(current),
      });
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
      assertRowSettled(current.sync_state, "event", "deleting");
      const outbox = await ctx.store.currentOutbox("event", id);
      assertNoAttemptInFlight(outbox, "event", "deleting");
      if (current.server_revision === 0 && outbox?.operation_type === "create") {
        await ctx.database.runAsync(
          "DELETE FROM sync_outbox WHERE operation_id = ?",
          outbox.operation_id,
        );
        await ctx.database.runAsync("DELETE FROM calendar_events WHERE id = ?", id);
        return;
      }
      await queueDelete(ctx, outbox, {
        entityType: "event",
        entityId: id,
        baseRevision: current.server_revision,
        base: () => eventSnapshot(current),
      });
      await ctx.database.runAsync(
        "UPDATE calendar_events SET deleted_at = ?, sync_state = 'pending' WHERE id = ?",
        ctx.now().toISOString(),
        id,
      );
    });
  });
}
