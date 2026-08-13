import { mobileSyncPullRequestSchema } from "@zoption/shared";
import { Hono } from "hono";

import type { MobileSyncRepository } from "../db/mobile-sync";
import { HttpError } from "../errors";
import { readJson } from "../request";
import type { AppEnvironment } from "../types";

export function createMobileSyncRoutes(repository: MobileSyncRepository) {
  const routes = new Hono<AppEnvironment>();

  routes.post("/pull", async (context) => {
    const parsed = mobileSyncPullRequestSchema.safeParse(await readJson(context));
    if (!parsed.success) {
      throw new HttpError(
        400,
        "invalid_request",
        "Check the synchronization request.",
        parsed.error.flatten(),
      );
    }
    return context.json(
      await repository.pull(context.env, context.get("tenant").tenantId, parsed.data),
    );
  });

  return routes;
}
