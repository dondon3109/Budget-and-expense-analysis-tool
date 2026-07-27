import { accountBalanceUpdateSchema } from "@zoption/shared";
import { Hono } from "hono";

import type { AccountRepository } from "../db/accounts";
import { HttpError } from "../errors";
import type { AppEnvironment } from "../types";

export function createAccountRoutes(repository: AccountRepository) {
  const routes = new Hono<AppEnvironment>();

  routes.get("/", async (context) =>
    context.json({ items: await repository.list(context.env, context.get("tenant").tenantId) }),
  );

  routes.put("/:id/balance", async (context) => {
    const parsed = accountBalanceUpdateSchema.safeParse(await context.req.json().catch(() => null));
    if (!parsed.success) {
      throw new HttpError(
        400,
        "invalid_request",
        "Enter a valid balance and as-of date.",
        parsed.error.flatten(),
      );
    }
    return context.json(
      await repository.setBalance(
        context.env,
        context.get("tenant").tenantId,
        context.req.param("id"),
        parsed.data,
      ),
    );
  });

  return routes;
}
