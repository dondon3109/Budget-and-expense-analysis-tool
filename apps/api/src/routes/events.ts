import {
  calendarEventInputSchema,
  calendarEventQuerySchema,
  calendarEventUpdateSchema,
} from "@zoption/shared";
import { Hono } from "hono";

import type { CalendarEventRepository } from "../db/events";
import { HttpError } from "../errors";
import { parsePathParameter, readJson } from "../request";
import type { AppEnvironment } from "../types";

export function createCalendarEventRoutes(repository: CalendarEventRepository) {
  const routes = new Hono<AppEnvironment>();

  routes.get("/", async (context) => {
    const parsed = calendarEventQuerySchema.safeParse(context.req.query());
    if (!parsed.success) {
      throw new HttpError(
        400,
        "invalid_request",
        "Choose a valid calendar month.",
        parsed.error.flatten(),
      );
    }
    return context.json(
      await repository.list(context.env, context.get("tenant").tenantId, parsed.data),
    );
  });

  routes.post("/", async (context) => {
    const body = await readJson(context);
    const parsed = calendarEventInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpError(
        400,
        "invalid_request",
        "Check the event fields.",
        parsed.error.flatten(),
      );
    }
    return context.json(
      await repository.create(context.env, context.get("tenant").tenantId, parsed.data),
      201,
    );
  });

  routes.patch("/:id", async (context) => {
    const body = await readJson(context);
    const parsed = calendarEventUpdateSchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpError(
        400,
        "invalid_request",
        "Check the event fields.",
        parsed.error.flatten(),
      );
    }
    return context.json(
      await repository.update(
        context.env,
        context.get("tenant").tenantId,
        parsePathParameter(context.req.param("id")),
        parsed.data,
      ),
    );
  });

  routes.delete("/:id", async (context) => {
    await repository.remove(
      context.env,
      context.get("tenant").tenantId,
      parsePathParameter(context.req.param("id")),
    );
    return context.body(null, 204);
  });

  return routes;
}
