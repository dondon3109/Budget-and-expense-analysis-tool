import { Hono } from "hono";

import type { AccountRepository } from "../db/accounts";
import type { AppEnvironment } from "../types";

export function createAccountRoutes(repository: AccountRepository) {
  const routes = new Hono<AppEnvironment>();

  routes.get("/", async (context) =>
    context.json({ items: await repository.list(context.env, context.get("tenant").tenantId) }),
  );

  return routes;
}
