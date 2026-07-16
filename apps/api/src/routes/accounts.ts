import { Hono } from "hono";

import type { AccountRepository } from "../db/accounts";
import type { Bindings } from "../types";

export function createAccountRoutes(repository: AccountRepository) {
  const routes = new Hono<{ Bindings: Bindings }>();

  routes.get("/", async (context) => context.json({ items: await repository.list(context.env) }));

  return routes;
}
