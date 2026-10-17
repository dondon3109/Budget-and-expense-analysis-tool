import { workspaceSettingsUpdateSchema } from "@zoption/shared";
import { Hono } from "hono";

import type { WorkspaceSettingsRepository } from "../db/workspace-settings";
import { HttpError } from "../errors";
import { parseInput, readJson } from "../request";
import type { AppEnvironment } from "../types";

export function createWorkspaceSettingsRoutes(repository: WorkspaceSettingsRepository) {
  const routes = new Hono<AppEnvironment>();

  routes.get("/", async (context) =>
    context.json(await repository.get(context.env, context.get("tenant").tenantId)),
  );

  routes.put("/", async (context) => {
    const { membership } = context.get("tenant");
    // A family's currency is the owner's call; members only log entries in it.
    if (membership && membership.role !== "owner") {
      throw new HttpError(403, "family_owner_required", "Only the family owner can do this.");
    }
    const body = await readJson(context);
    const input = parseInput(workspaceSettingsUpdateSchema, body, "Choose PHP or USD.");
    return context.json(
      await repository.update(context.env, context.get("tenant").tenantId, input),
    );
  });

  return routes;
}
