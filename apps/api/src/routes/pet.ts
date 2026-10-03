import { petEggChoiceSchema, petSettingsSchema } from "@zoption/shared";
import { Hono } from "hono";

import type { PetRepository } from "../db/pet";
import { parseInput, readJson } from "../request";
import type { AppEnvironment } from "../types";

/**
 * The pet companion. Not behind the onboarding gate: the mobile onboarding offers the egg. Points
 * come from activity the workspace already records, credited when the pet is read.
 */
export function createPetRoutes(repository: PetRepository) {
  const routes = new Hono<AppEnvironment>();

  routes.get("/", async (context) =>
    context.json(await repository.get(context.env, context.get("tenant").tenantId, new Date())),
  );

  routes.post("/check-in", async (context) =>
    context.json(await repository.checkIn(context.env, context.get("tenant").tenantId, new Date())),
  );

  routes.put("/egg", async (context) => {
    const input = parseInput(petEggChoiceSchema, await readJson(context), "Choose an egg.");
    return context.json(
      await repository.chooseEgg(
        context.env,
        context.get("tenant").tenantId,
        input.species,
        new Date(),
      ),
    );
  });

  routes.put("/settings", async (context) => {
    const input = parseInput(petSettingsSchema, await readJson(context), "Choose on or off.");
    return context.json(
      await repository.setEnabled(
        context.env,
        context.get("tenant").tenantId,
        input.enabled,
        new Date(),
      ),
    );
  });

  return routes;
}
