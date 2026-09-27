// Primitive schemas every other schema module builds on.

import { z } from "zod";

export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use an ISO date (YYYY-MM-DD).")
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
  }, "Enter a real calendar date.");

export const resourceIdSchema = z
  .string()
  .min(1)
  .max(180)
  .regex(/^[A-Za-z0-9:_-]+$/, "Use a valid resource identifier.");

export const monthStartSchema = isoDateSchema.refine(
  (value) => value.endsWith("-01"),
  "Use the first day of the month.",
);
