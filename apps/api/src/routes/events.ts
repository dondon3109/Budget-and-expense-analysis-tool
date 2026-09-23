import {
  calendarEventInputSchema,
  calendarEventQuerySchema,
  calendarEventUpdateSchema,
} from "@zoption/shared";
import { Hono } from "hono";

import type { CalendarEventRepository } from "../db/events";
import { parseInput, parsePathParameter, readJson } from "../request";
import type { AppEnvironment } from "../types";

export function createCalendarEventRoutes(repository: CalendarEventRepository) {
  const routes = new Hono<AppEnvironment>();

  routes.get("/", async (context) => {
    const input = parseInput(
      calendarEventQuerySchema,
      context.req.query(),
      "Choose a valid calendar month.",
    );
    return context.json(await repository.list(context.env, context.get("tenant").tenantId, input));
  });

  routes.post("/", async (context) => {
    const body = await readJson(context);
    const input = parseInput(calendarEventInputSchema, body, "Check the event fields.");
    return context.json(
      await repository.create(context.env, context.get("tenant").tenantId, input),
      201,
    );
  });

  routes.patch("/:id", async (context) => {
    const body = await readJson(context);
    const input = parseInput(calendarEventUpdateSchema, body, "Check the event fields.");
    return context.json(
      await repository.update(
        context.env,
        context.get("tenant").tenantId,
        parsePathParameter(context.req.param("id")),
        input,
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
