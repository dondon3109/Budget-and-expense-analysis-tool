import {
  pushDeviceRegisterSchema,
  pushDeviceUnregisterSchema,
  pushPreferenceUpdateSchema,
} from "@zoption/shared";
import { Hono } from "hono";

import type { PushRepository } from "../db/push";
import { parseInput, readJson } from "../request";
import type { AppEnvironment } from "../types";

/** The signed-in person's push devices and category opt-outs under `/api/app/push`. */
export function createPushRoutes(push: PushRepository) {
  const routes = new Hono<AppEnvironment>();

  routes.put("/devices", async (context) => {
    const input = parseInput(
      pushDeviceRegisterSchema,
      await readJson(context),
      "Send an Expo push token and its platform.",
    );
    await push.registerDevice(context.env, context.get("authUser").id, input.token, input.platform);
    return context.body(null, 204);
  });

  // A POST rather than a DELETE with a body, which some proxies drop; the token stays out of URLs.
  routes.post("/devices/unregister", async (context) => {
    const input = parseInput(
      pushDeviceUnregisterSchema,
      await readJson(context),
      "Send the Expo push token to remove.",
    );
    await push.unregisterDevice(context.env, context.get("authUser").id, input.token);
    return context.body(null, 204);
  });

  routes.get("/preferences", async (context) =>
    context.json(await push.preferences(context.env, context.get("authUser").id)),
  );

  routes.put("/preferences", async (context) => {
    const input = parseInput(
      pushPreferenceUpdateSchema,
      await readJson(context),
      "Choose a notification category and whether it is on.",
    );
    return context.json(
      await push.setPreference(
        context.env,
        context.get("authUser").id,
        input.category,
        input.enabled,
      ),
    );
  });

  return routes;
}
