import { onboardingCashSchema, onboardingCurrencySchema } from "@zoption/shared";
import { Hono } from "hono";

import type { OnboardingRepository } from "../db/onboarding";
import { parseInput, readJson } from "../request";
import type { AppEnvironment } from "../types";

export function createOnboardingRoutes(repository: OnboardingRepository) {
  const routes = new Hono<AppEnvironment>();

  routes.get("/", async (context) =>
    context.json(await repository.get(context.env, context.get("tenant").tenantId)),
  );

  routes.post("/currency", async (context) => {
    const input = parseInput(
      onboardingCurrencySchema,
      await readJson(context),
      "Choose PHP or USD.",
    );
    return context.json(
      await repository.saveCurrency(context.env, context.get("tenant").tenantId, input),
    );
  });

  routes.post("/cash-balance", async (context) => {
    const input = parseInput(
      onboardingCashSchema,
      await readJson(context),
      "Enter the cash you have on hand.",
    );
    return context.json(
      await repository.saveCashBalance(context.env, context.get("tenant").tenantId, input),
    );
  });

  return routes;
}
