import { accountInputSchema, accountUpdateSchema } from "@zoption/shared";
import { Hono } from "hono";

import type { AccountRepository } from "../db/accounts";
import { HttpError } from "../errors";
import type { AppEnvironment } from "../types";

async function requestBody(context: { req: { json: <T>() => Promise<T> } }): Promise<unknown> {
  try {
    return await context.req.json<unknown>();
  } catch {
    throw new HttpError(400, "invalid_json", "Send a valid JSON request body.");
  }
}

export function createAccountRoutes(repository: AccountRepository) {
  const routes = new Hono<AppEnvironment>();

  routes.get("/", async (context) =>
    context.json({ items: await repository.list(context.env, context.get("tenant").tenantId) }),
  );

  routes.post("/", async (context) => {
    const parsed = accountInputSchema.safeParse(await requestBody(context));
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
    const parsed = accountUpdateSchema.safeParse(await requestBody(context));
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
        context.req.param("id"),
        parsed.data,
      ),
    );
  });

  routes.delete("/:id", async (context) => {
    await repository.remove!(context.env, context.get("tenant").tenantId, context.req.param("id"));
    return context.body(null, 204);
  });

  return routes;
}
