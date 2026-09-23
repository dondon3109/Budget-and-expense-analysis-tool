import {
  mobileSyncAcknowledgeRequestSchema,
  mobileSyncPullRequestSchema,
  mobileSyncPushRequestSchema,
  mobileSyncSnapshotRequestSchema,
} from "@zoption/shared";
import { Hono } from "hono";

import type { MobileSyncRepository } from "../db/mobile-sync";
import { parseInput, readJson } from "../request";
import type { AppEnvironment } from "../types";

export function createMobileSyncRoutes(repository: MobileSyncRepository) {
  const routes = new Hono<AppEnvironment>();

  routes.post("/acknowledge", async (context) => {
    const input = parseInput(
      mobileSyncAcknowledgeRequestSchema,
      await readJson(context),
      "Check the synchronization acknowledgement.",
    );
    return context.json(
      await repository.acknowledge(context.env, context.get("tenant").tenantId, input),
    );
  });

  routes.post("/pull", async (context) => {
    const input = parseInput(
      mobileSyncPullRequestSchema,
      await readJson(context),
      "Check the synchronization request.",
    );
    return context.json(await repository.pull(context.env, context.get("tenant").tenantId, input));
  });

  routes.post("/snapshot", async (context) => {
    const input = parseInput(
      mobileSyncSnapshotRequestSchema,
      await readJson(context),
      "Check the full-snapshot request.",
    );
    return context.json(
      await repository.snapshot(context.env, context.get("tenant").tenantId, input),
    );
  });

  routes.post("/push", async (context) => {
    const input = parseInput(
      mobileSyncPushRequestSchema,
      await readJson(context),
      "Check the synchronization operations.",
    );
    return context.json(await repository.push(context.env, context.get("tenant").tenantId, input));
  });

  return routes;
}
