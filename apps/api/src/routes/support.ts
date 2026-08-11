import { Hono } from "hono";

import type { AssistantProvider } from "../assistant/provider";
import { HttpError } from "../errors";
import { readJson } from "../request";
import { completeSupportChat, supportChatInputSchema } from "../support/service";
import type { AppEnvironment } from "../types";

export function createSupportRoutes(provider: AssistantProvider) {
  const routes = new Hono<AppEnvironment>();

  routes.use("*", async (context, next) => {
    if (context.env.ASSISTANT_ENABLED !== "true") {
      throw new HttpError(404, "support_not_enabled", "Zoption Support is not available.");
    }
    await next();
  });

  routes.post("/chat", async (context) => {
    const parsed = supportChatInputSchema.safeParse(await readJson(context));
    if (!parsed.success) {
      throw new HttpError(
        400,
        "invalid_request",
        "Enter a valid support message of 1,200 characters or fewer.",
        parsed.error.flatten(),
      );
    }
    return context.json(await completeSupportChat(context.env, provider, parsed.data));
  });

  return routes;
}
