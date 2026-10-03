import {
  accountInputSchema,
  accountUpdateWithInterestSchema,
  interestUpdateSchema,
} from "@zoption/shared";
import { Hono } from "hono";

import type { AccountRepository } from "../db/accounts";
import type { BillingRepository } from "../db/billing";
import { parseInput, parsePathParameter, readJson } from "../request";
import type { AppEnvironment } from "../types";

/**
 * Account CRUD is open to every plan. Only turning on automatic interest needs
 * Pro; switching it off stays free so a lapsed subscriber can clean up.
 */
export function createAccountRoutes(
  repository: AccountRepository,
  billing: Pick<BillingRepository, "requirePro">,
) {
  const routes = new Hono<AppEnvironment>();

  routes.get("/", async (context) =>
    context.json({ items: await repository.list(context.env, context.get("tenant").tenantId) }),
  );

  routes.post("/", async (context) => {
    const input = parseInput(
      accountInputSchema,
      await readJson(context),
      "Check the account details.",
    );
    return context.json(
      await repository.create!(context.env, context.get("tenant").tenantId, input),
      201,
    );
  });

  routes.patch("/:id", async (context) => {
    const input = parseInput(
      accountUpdateWithInterestSchema,
      await readJson(context),
      "Check the account and interest details.",
    );
    if (input.interest?.enabled) {
      await billing.requirePro(context.env, context.get("tenant").tenantId, "account_interest");
    }
    return context.json(
      await repository.update!(
        context.env,
        context.get("tenant").tenantId,
        parsePathParameter(context.req.param("id")),
        input,
      ),
    );
  });

  routes.delete("/:id", async (context) => {
    await repository.remove!(
      context.env,
      context.get("tenant").tenantId,
      parsePathParameter(context.req.param("id")),
    );
    return context.body(null, 204);
  });

  routes.patch("/:id/interest", async (context) => {
    const input = parseInput(
      interestUpdateSchema,
      await readJson(context),
      "Check the interest settings.",
    );
    if (input.enabled) {
      await billing.requirePro(context.env, context.get("tenant").tenantId, "account_interest");
    }
    return context.json(
      await repository.updateInterest!(
        context.env,
        context.get("tenant").tenantId,
        parsePathParameter(context.req.param("id")),
        input,
      ),
    );
  });

  return routes;
}
