import {
  MOBILE_APP_VERSION_HEADER,
  MOBILE_SYNC_FEATURES_HEADER,
  isMobileAppVersionBelow,
  mobileSyncAcknowledgeRequestSchema,
  mobileSyncPullRequestSchema,
  mobileSyncPushRequestSchema,
  mobileSyncSnapshotRequestSchema,
  parseMobileSyncFeatures,
} from "@zoption/shared";
import { Hono } from "hono";

import type { MobileSyncRepository } from "../db/mobile-sync";
import { HttpError } from "../errors";
import { parseInput, readJson } from "../request";
import type { AppEnvironment } from "../types";

export function createMobileSyncRoutes(repository: MobileSyncRepository) {
  const routes = new Hono<AppEnvironment>();
  const features = (context: { req: { header(name: string): string | undefined } }) =>
    parseMobileSyncFeatures(context.req.header(MOBILE_SYNC_FEATURES_HEADER));

  // A release below the floor would misread payloads it no longer has a contract for, so it is
  // told to update instead. Apps from before the version header cannot be identified.
  routes.use("*", async (context, next) => {
    const version = context.req.header(MOBILE_APP_VERSION_HEADER);
    const minimum = context.env?.MOBILE_SYNC_MINIMUM_APP_VERSION;
    if (version !== undefined && minimum && isMobileAppVersionBelow(version, minimum)) {
      throw new HttpError(
        426,
        "app_update_required",
        "This version of Zoption can no longer sync. Update the app to keep your records in step.",
      );
    }
    await next();
  });

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
    return context.json(
      await repository.pull(context.env, context.get("tenant").tenantId, input, features(context)),
    );
  });

  routes.post("/snapshot", async (context) => {
    const input = parseInput(
      mobileSyncSnapshotRequestSchema,
      await readJson(context),
      "Check the full-snapshot request.",
    );
    return context.json(
      await repository.snapshot(
        context.env,
        context.get("tenant").tenantId,
        input,
        features(context),
      ),
    );
  });

  routes.post("/push", async (context) => {
    const input = parseInput(
      mobileSyncPushRequestSchema,
      await readJson(context),
      "Check the synchronization operations.",
    );
    return context.json(
      await repository.push(context.env, context.get("tenant").tenantId, input, features(context)),
    );
  });

  return routes;
}
