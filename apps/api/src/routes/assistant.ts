import {
  assistantMemoryPreferencesUpdateSchema,
  assistantMessageInputSchema,
  assistantMessageListQuerySchema,
  assistantPreferenceUpdateSchema,
  assistantThreadIdSchema,
  assistantThreadListQuerySchema,
} from "@zoption/shared";
import { Hono } from "hono";

import type { AssistantService } from "../assistant/service";
import { HttpError } from "../errors";
import { parsePathParameter, readJson } from "../request";
import type { AppEnvironment } from "../types";

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
    const parsed = assistantPreferenceUpdateSchema.safeParse(await readJson(context));
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

  routes.get("/memory", async (context) =>
    context.json(await service.getMemory(context.env, context.get("tenant").tenantId)),
  );

  routes.get("/memory/preferences", async (context) =>
    context.json(await service.getMemoryPreferences(context.env, context.get("tenant").tenantId)),
  );

  routes.patch("/memory/preferences", async (context) => {
    const parsed = assistantMemoryPreferencesUpdateSchema.safeParse(await readJson(context));
    if (!parsed.success) {
      throw new HttpError(
        400,
        "invalid_request",
        "Provide valid memory preferences.",
        parsed.error.flatten(),
      );
    }
    return context.json(
      await service.updateMemoryPreferences(
        context.env,
        context.get("tenant").tenantId,
        parsed.data,
      ),
    );
  });

  routes.delete("/memory", async (context) => {
    await service.clearMemory(context.env, context.get("tenant").tenantId);
    return context.body(null, 204);
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
    const parsed = assistantMessageInputSchema.safeParse(await readJson(context));
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
        parsePathParameter(context.req.param("id"), assistantThreadIdSchema),
        parsed.data,
      ),
    );
  });

  routes.post("/threads/:id/messages", async (context) => {
    const parsed = assistantMessageInputSchema.safeParse(await readJson(context));
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
        parsePathParameter(context.req.param("id"), assistantThreadIdSchema),
        parsed.data,
      ),
    );
  });

  routes.delete("/threads/:id", async (context) => {
    await service.deleteThread(
      context.env,
      context.get("tenant").tenantId,
      parsePathParameter(context.req.param("id"), assistantThreadIdSchema),
    );
    return context.body(null, 204);
  });

  return routes;
}
