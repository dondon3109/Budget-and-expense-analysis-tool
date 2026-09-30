import { placeLookupRequestSchema } from "@zoption/shared";
import { Hono } from "hono";

import type { PlacesProvider } from "../places/google-places";
import { parseInput, readJson } from "../request";
import type { AppEnvironment } from "../types";

/**
 * Nearby place lookup for the mobile visit prompt. Coordinates pass through to
 * the provider and are never stored or logged.
 */
export function createPlaceRoutes(provider: PlacesProvider) {
  const routes = new Hono<AppEnvironment>();

  routes.post("/nearby", async (context) => {
    const point = parseInput(
      placeLookupRequestSchema,
      await readJson(context),
      "Send a latitude and longitude.",
    );
    return context.json({ place: await provider.nearby(context.env, point) });
  });

  return routes;
}
