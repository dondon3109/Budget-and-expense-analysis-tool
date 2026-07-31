import {
  categoryInputSchema,
  categoryListQuerySchema,
  categoryUpdateSchema,
} from "@zoption/shared";
import { Hono } from "hono";

import type { CategoryRepository } from "../db/categories";
import { HttpError } from "../errors";
import { parsePathParameter, readJson } from "../request";
import type { AppEnvironment } from "../types";

export function createCategoryRoutes(repository: CategoryRepository) {
  const routes = new Hono<AppEnvironment>();

  routes.get("/", async (context) => {
    const parsed = categoryListQuerySchema.safeParse(context.req.query());
    if (!parsed.success) {
      throw new HttpError(400, "invalid_request", "Choose valid category options.");
    }
    return context.json({
      items: await repository.list(
        context.env,
        context.get("tenant").tenantId,
        parsed.data.includeArchived,
      ),
    });
  });

  routes.post("/", async (context) => {
    const body = await readJson(context);
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
    const body = await readJson(context);
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
        parsePathParameter(context.req.param("id")),
        parsed.data,
      ),
    );
  });

  return routes;
}
