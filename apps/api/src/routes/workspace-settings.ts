import { workspaceSettingsUpdateSchema } from "@zoption/shared";
import { Hono } from "hono";

import type { WorkspaceSettingsRepository } from "../db/workspace-settings";
import { parseInput, readJson } from "../request";
import type { AppEnvironment } from "../types";

export function createWorkspaceSettingsRoutes(repository: WorkspaceSettingsRepository) {
  const routes = new Hono<AppEnvironment>();

  routes.get("/", async (context) =>
    context.json(await repository.get(context.env, context.get("tenant").tenantId)),
  );

  routes.put("/", async (context) => {
    const body = await readJson(context);
    const input = parseInput(workspaceSettingsUpdateSchema, body, "Choose PHP or USD.");
    return context.json(
      await repository.update(context.env, context.get("tenant").tenantId, input),
    );
  });

  return routes;
}
