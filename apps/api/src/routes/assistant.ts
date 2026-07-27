import {
  assistantMessageInputSchema,
  assistantMessageListQuerySchema,
  assistantPreferenceUpdateSchema,
  assistantThreadListQuerySchema,
} from "@zoption/shared";
import { Hono, type Context } from "hono";

import type { AssistantService } from "../assistant/service";
import { HttpError } from "../errors";
import type { AppEnvironment } from "../types";

async function parseJson(context: Context<AppEnvironment>) {
  try {
    return await context.req.json<unknown>();
  } catch {
    throw new HttpError(400, "invalid_json", "Send a valid JSON request body.");
  }
}

export function createAssistantRoutes(service: AssistantService) {
  const routes = new Hono<AppEnvironment>();

  routes.use("*", async (context, next) => {
    if (context.env.ASSISTANT_ENABLED !== "true") {
      throw new HttpError(404, "assistant_not_enabled", "The assistant is not available.");
    }
    await next();
  });

  routes.get("/preferences", async (context) =>
    context.json(await service.getPreferences(context.env, context.get("tenant").tenantId)),
  );

  routes.patch("/preferences", async (context) => {
    const parsed = assistantPreferenceUpdateSchema.safeParse(await parseJson(context));
    if (!parsed.success) {
      throw new HttpError(
        400,
        "invalid_request",
        "Provide valid assistant preferences.",
        parsed.error.flatten(),
      );
    }
    return context.json(
      await service.updatePreferences(context.env, context.get("tenant").tenantId, parsed.data),
    );
  });

  routes.get("/threads", async (context) => {
    const parsed = assistantThreadListQuerySchema.safeParse(context.req.query());
    if (!parsed.success) {
      throw new HttpError(400, "invalid_request", "Choose valid assistant history options.");
    }
    return context.json(
      await service.listThreads(context.env, context.get("tenant").tenantId, parsed.data),
    );
  });

  routes.post("/threads", async (context) => {
    const parsed = assistantMessageInputSchema.safeParse(await parseJson(context));
    if (!parsed.success) {
      throw new HttpError(
        400,
        "invalid_request",
        "Enter a message of 2,000 characters or fewer.",
        parsed.error.flatten(),
      );
    }
    return context.json(
      await service.createThreadTurn(context.env, context.get("tenant").tenantId, parsed.data),
      201,
    );
  });

  routes.delete("/threads", async (context) => {
    await service.deleteAllThreads(context.env, context.get("tenant").tenantId);
    return context.body(null, 204);
  });

  routes.get("/threads/:id/messages", async (context) => {
    const parsed = assistantMessageListQuerySchema.safeParse(context.req.query());
    if (!parsed.success) {
      throw new HttpError(400, "invalid_request", "Choose valid message history options.");
    }
    return context.json(
      await service.listMessages(
        context.env,
        context.get("tenant").tenantId,
        context.req.param("id"),
        parsed.data,
      ),
    );
  });

  routes.post("/threads/:id/messages", async (context) => {
    const parsed = assistantMessageInputSchema.safeParse(await parseJson(context));
    if (!parsed.success) {
      throw new HttpError(
        400,
        "invalid_request",
        "Enter a message of 2,000 characters or fewer.",
        parsed.error.flatten(),
      );
    }
    return context.json(
      await service.sendTurn(
        context.env,
        context.get("tenant").tenantId,
        context.req.param("id"),
        parsed.data,
      ),
    );
  });

  routes.delete("/threads/:id", async (context) => {
    await service.deleteThread(
      context.env,
      context.get("tenant").tenantId,
      context.req.param("id"),
    );
    return context.body(null, 204);
  });

  return routes;
}
