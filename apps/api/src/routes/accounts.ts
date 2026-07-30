import { accountInputSchema, accountUpdateSchema } from "@zoption/shared";
import { Hono } from "hono";

import type { AccountRepository } from "../db/accounts";
import type { BillingRepository } from "../db/billing";
import { HttpError } from "../errors";
import { parsePathParameter, readJson } from "../request";
import type { AppEnvironment } from "../types";

export function createAccountRoutes(
  repository: AccountRepository,
  billing: Pick<BillingRepository, "requirePro">,
) {
  const routes = new Hono<AppEnvironment>();

  routes.get("/", async (context) =>
    context.json({ items: await repository.list(context.env, context.get("tenant").tenantId) }),
  );

  routes.post("/", async (context) => {
    await billing.requirePro(context.env, context.get("tenant").tenantId, "account_management");
    const parsed = accountInputSchema.safeParse(await readJson(context));
    if (!parsed.success) {
      throw new HttpError(
        400,
        "invalid_request",
        "Check the account details.",
        parsed.error.flatten(),
      );
    }
    return context.json(
      await repository.create!(context.env, context.get("tenant").tenantId, parsed.data),
      201,
    );
  });

  routes.patch("/:id", async (context) => {
    await billing.requirePro(context.env, context.get("tenant").tenantId, "account_management");
    const parsed = accountUpdateSchema.safeParse(await readJson(context));
    if (!parsed.success) {
      throw new HttpError(
        400,
        "invalid_request",
        "Enter a valid account name.",
        parsed.error.flatten(),
      );
    }
    return context.json(
      await repository.update!(
        context.env,
        context.get("tenant").tenantId,
        parsePathParameter(context.req.param("id")),
        parsed.data,
      ),
    );
  });

  routes.delete("/:id", async (context) => {
    await billing.requirePro(context.env, context.get("tenant").tenantId, "account_management");
    await repository.remove!(
      context.env,
      context.get("tenant").tenantId,
      parsePathParameter(context.req.param("id")),
    );
    return context.body(null, 204);
  });

  return routes;
}
