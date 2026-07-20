import { categoryInputSchema, categoryUpdateSchema } from "@budget/shared";
import { Hono } from "hono";

import type { CategoryRepository } from "../db/categories";
import { HttpError } from "../errors";
import type { AppEnvironment } from "../types";

export function createCategoryRoutes(repository: CategoryRepository) {
  const routes = new Hono<AppEnvironment>();

  routes.get("/", async (context) => {
    const includeArchived = context.req.query("includeArchived") === "true";
    return context.json({
      items: await repository.list(context.env, context.get("tenant").tenantId, includeArchived),
    });
  });

  routes.post("/", async (context) => {
    let body: unknown;
    try {
      body = await context.req.json<unknown>();
    } catch {
      throw new HttpError(400, "invalid_json", "Send a valid JSON request body.");
    }
    const parsed = categoryInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpError(
        400,
        "invalid_request",
        "Check the category fields.",
        parsed.error.flatten(),
      );
    }
    return context.json(
      await repository.create(context.env, context.get("tenant").tenantId, parsed.data),
      201,
    );
  });

  routes.patch("/:id", async (context) => {
    let body: unknown;
    try {
      body = await context.req.json<unknown>();
    } catch {
      throw new HttpError(400, "invalid_json", "Send a valid JSON request body.");
    }
    const parsed = categoryUpdateSchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpError(
        400,
        "invalid_request",
        "Check the category fields.",
        parsed.error.flatten(),
      );
    }
    return context.json(
      await repository.update(
        context.env,
        context.get("tenant").tenantId,
        context.req.param("id"),
        parsed.data,
      ),
    );
  });

  return routes;
}
