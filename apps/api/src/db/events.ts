import {
  calendarEventInputSchema,
  type CalendarEventInput,
  type CalendarEventMonth,
  type CalendarEventQuery,
  type CalendarEventRecord,
  type CalendarEventUpdate,
} from "@zoption/shared";
import { and, asc, eq, gte, lt, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

import { calendarEvents } from "../../../../db/schema";
import { HttpError } from "../errors";
import type { Bindings } from "../types";

export interface CalendarEventRepository {
  list(env: Bindings, tenantId: string, query: CalendarEventQuery): Promise<CalendarEventMonth>;
  create(env: Bindings, tenantId: string, input: CalendarEventInput): Promise<CalendarEventRecord>;
  update(
    env: Bindings,
    tenantId: string,
    id: string,
    input: CalendarEventUpdate,
  ): Promise<CalendarEventRecord>;
  remove(env: Bindings, tenantId: string, id: string): Promise<void>;
}

function nextMonthStart(month: string): string {
  const date = new Date(`${month}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + 1);
  return date.toISOString().slice(0, 10);
}

function normalizeEvent(input: CalendarEventInput) {
  return {
    title: input.title,
    date: input.date,
    startTime: input.startTime ?? null,
    endTime: input.endTime ?? null,
    notes: input.notes || null,
  };
}

async function findEvent(
  env: Bindings,
  tenantId: string,
  id: string,
): Promise<CalendarEventRecord | null> {
  const db = drizzle(env.DB);
  const [event] = await db
    .select({
      id: calendarEvents.id,
      title: calendarEvents.title,
      date: calendarEvents.date,
      startTime: calendarEvents.startTime,
      endTime: calendarEvents.endTime,
      notes: calendarEvents.notes,
    })
    .from(calendarEvents)
    .where(and(eq(calendarEvents.id, id), eq(calendarEvents.tenantId, tenantId)))
    .limit(1);

  return event ?? null;
}

export const calendarEventRepository: CalendarEventRepository = {
  async list(env, tenantId, query) {
    const db = drizzle(env.DB);
    const items = await db
      .select({
        id: calendarEvents.id,
        title: calendarEvents.title,
        date: calendarEvents.date,
        startTime: calendarEvents.startTime,
        endTime: calendarEvents.endTime,
        notes: calendarEvents.notes,
      })
      .from(calendarEvents)
      .where(
        and(
          eq(calendarEvents.tenantId, tenantId),
          gte(calendarEvents.date, query.month),
          lt(calendarEvents.date, nextMonthStart(query.month)),
        ),
      )
      .orderBy(
        asc(calendarEvents.date),
        asc(calendarEvents.startTime),
        asc(calendarEvents.title),
        asc(calendarEvents.id),
      );

    return { month: query.month, items };
  },

  async create(env, tenantId, input) {
    const id = crypto.randomUUID();
    const db = drizzle(env.DB);
    await db.insert(calendarEvents).values({ id, tenantId, ...normalizeEvent(input) });

    const created = await findEvent(env, tenantId, id);
    if (!created) throw new Error("Created calendar event could not be read back.");
    return created;
  },

  async update(env, tenantId, id, input) {
    const existing = await findEvent(env, tenantId, id);
    if (!existing) throw new HttpError(404, "event_not_found", "Event not found.");

    const parsed = calendarEventInputSchema.safeParse({
      title: input.title ?? existing.title,
      date: input.date ?? existing.date,
      startTime: input.startTime === undefined ? existing.startTime : input.startTime,
      endTime: input.endTime === undefined ? existing.endTime : input.endTime,
      notes: input.notes === undefined ? existing.notes : input.notes,
    });
    if (!parsed.success) {
      throw new HttpError(
        400,
        "invalid_request",
        "Check the event fields.",
        parsed.error.flatten(),
      );
    }

    const db = drizzle(env.DB);
    await db
      .update(calendarEvents)
      .set({ ...normalizeEvent(parsed.data), updatedAt: sql`(datetime('now'))` })
      .where(and(eq(calendarEvents.id, id), eq(calendarEvents.tenantId, tenantId)));

    const updated = await findEvent(env, tenantId, id);
    if (!updated) throw new Error("Updated calendar event could not be read back.");
    return updated;
  },

  async remove(env, tenantId, id) {
    const db = drizzle(env.DB);
    const removed = await db
      .delete(calendarEvents)
      .where(and(eq(calendarEvents.id, id), eq(calendarEvents.tenantId, tenantId)))
      .returning({ id: calendarEvents.id });

    if (removed.length === 0) throw new HttpError(404, "event_not_found", "Event not found.");
  },
};
