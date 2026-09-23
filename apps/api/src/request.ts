import { resourceIdSchema } from "@zoption/shared";
import type { Context } from "hono";
import type { z } from "zod";

import { HttpError } from "./errors";
import type { AppEnvironment } from "./types";

export async function readJson(context: Context<AppEnvironment>): Promise<unknown> {
  try {
    return await context.req.json<unknown>();
  } catch {
    throw new HttpError(400, "invalid_json", "Send a valid JSON request body.");
  }
}

export function parsePathParameter(
  value: string,
  schema: z.ZodType<string> = resourceIdSchema,
): string {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new HttpError(400, "invalid_request", "Use a valid resource identifier.");
  }
  return parsed.data;
}

/** Validates a request value against its shared schema, answering 400 with the field errors. */
export function parseInput<T extends z.ZodType>(
  schema: T,
  value: unknown,
  message: string,
): z.output<T> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new HttpError(400, "invalid_request", message, parsed.error.flatten());
  }
  return parsed.data;
}
