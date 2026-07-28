import { importCommitSchema, importPreviewRequestSchema } from "@zoption/shared";
import { Hono } from "hono";

import type { ImportRepository } from "../db/imports";
import { HttpError } from "../errors";
import { readJson } from "../request";
import type { AppEnvironment } from "../types";

export function createImportRoutes(repository: ImportRepository) {
  const routes = new Hono<AppEnvironment>();

  routes.post("/preview", async (context) => {
    const body = await readJson(context);
    const parsed = importPreviewRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpError(
        400,
        "invalid_request",
        "Check the import details.",
        parsed.error.flatten(),
      );
    }
    return context.json(
      await repository.preview(context.env, context.get("tenant").tenantId, parsed.data),
    );
  });

  routes.post("/commit", async (context) => {
    const body = await readJson(context);
    const parsed = importCommitSchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpError(400, "invalid_request", "The preview token is invalid.");
    }
    return context.json(
      await repository.commit(context.env, context.get("tenant").tenantId, parsed.data),
      201,
    );
  });

  return routes;
}
