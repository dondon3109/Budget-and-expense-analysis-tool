import { describe, expect, it } from "vitest";

import {
  calendarEventInputSchema,
  calendarEventQuerySchema,
  calendarEventUpdateSchema,
} from "../src";

describe("calendar event schemas", () => {
  it("accepts all-day and timed events", () => {
    expect(calendarEventInputSchema.parse({ title: "  Dentist  ", date: "2026-08-05" })).toEqual({
      title: "Dentist",
      date: "2026-08-05",
    });
    expect(
      calendarEventInputSchema.parse({
        title: "Planning session",
        date: "2026-08-05",
        startTime: "09:30",
        endTime: "10:45",
        notes: "  Bring the draft  ",
      }),
    ).toEqual({
      title: "Planning session",
      date: "2026-08-05",
      startTime: "09:30",
      endTime: "10:45",
      notes: "Bring the draft",
    });
  });

  it.each([
    { title: "", date: "2026-08-05" },
    { title: "Meeting", date: "2026-02-30" },
    { title: "Meeting", date: "2026-08-05", startTime: "9:30" },
    { title: "Meeting", date: "2026-08-05", endTime: "10:00" },
    {
      title: "Meeting",
      date: "2026-08-05",
      startTime: "10:00",
      endTime: "10:00",
    },
    {
      title: "Meeting",
      date: "2026-08-05",
      startTime: "11:00",
      endTime: "10:00",
    },
  ])("rejects invalid event input %#", (input) => {
    expect(calendarEventInputSchema.safeParse(input).success).toBe(false);
  });

  it("allows clearing optional values and rejects an empty update", () => {
    expect(
      calendarEventUpdateSchema.parse({ startTime: null, endTime: null, notes: null }),
    ).toEqual({ startTime: null, endTime: null, notes: null });
    expect(calendarEventUpdateSchema.safeParse({}).success).toBe(false);
  });

  it("requires the first day of a real month", () => {
    expect(calendarEventQuerySchema.parse({ month: "2026-08-01" })).toEqual({
      month: "2026-08-01",
    });
    expect(calendarEventQuerySchema.safeParse({ month: "2026-08-02" }).success).toBe(false);
  });
});
