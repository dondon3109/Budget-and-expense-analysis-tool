// Calendar events.

import { z } from "zod";

import { isoDateSchema, monthStartSchema } from "./common";

const eventTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a valid time.");

function validateEventTimes(
  value: { startTime?: string | null; endTime?: string | null },
  context: z.RefinementCtx,
) {
  if (value.endTime && !value.startTime) {
    context.addIssue({
      code: "custom",
      path: ["endTime"],
      message: "Add a start time before the end time.",
    });
  } else if (value.startTime && value.endTime && value.endTime <= value.startTime) {
    context.addIssue({
      code: "custom",
      path: ["endTime"],
      message: "The end time must be later than the start time.",
    });
  }
}

export const calendarEventInputSchema = z
  .object({
    title: z.string().trim().min(1, "Enter an event title.").max(120),
    date: isoDateSchema,
    startTime: eventTimeSchema.nullable().optional(),
    endTime: eventTimeSchema.nullable().optional(),
    notes: z.string().trim().max(500).nullable().optional(),
  })
  .strict()
  .superRefine(validateEventTimes);

export type CalendarEventInput = z.infer<typeof calendarEventInputSchema>;

export const calendarEventUpdateSchema = z
  .object({
    title: z.string().trim().min(1, "Enter an event title.").max(120).optional(),
    date: isoDateSchema.optional(),
    startTime: eventTimeSchema.nullable().optional(),
    endTime: eventTimeSchema.nullable().optional(),
    notes: z.string().trim().max(500).nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "Provide at least one change.");

export type CalendarEventUpdate = z.infer<typeof calendarEventUpdateSchema>;

export const calendarEventQuerySchema = z.object({ month: monthStartSchema }).strict();

export type CalendarEventQuery = z.infer<typeof calendarEventQuerySchema>;
