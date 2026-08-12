import {
  assistantVoiceConsentUpdateSchema,
  assistantVoicePreviewInputSchema,
  assistantVoiceSpeechInputSchema,
} from "@zoption/shared";
import { Hono } from "hono";

import type { AssistantVoiceService } from "../assistant/voice-service";
import { HttpError } from "../errors";
import { readJson } from "../request";
import type { AppEnvironment } from "../types";

const MAX_AUDIO_BYTES = 4 * 1024 * 1024;
const ACCEPTED_AUDIO_TYPES = new Set([
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
  "video/mp4",
]);

export function createAssistantVoiceRoutes(service: AssistantVoiceService) {
  const routes = new Hono<AppEnvironment>();

  routes.get("/preferences", async (context) =>
    context.json(await service.getPreferences(context.env, context.get("tenant").tenantId)),
  );

  routes.patch("/preferences", async (context) => {
    const parsed = assistantVoiceConsentUpdateSchema.safeParse(await readJson(context));
    if (!parsed.success)
      throw new HttpError(400, "invalid_request", "Accept the voice preview notice.");
    return context.json(await service.grantConsent(context.env, context.get("tenant").tenantId));
  });

  routes.post("/transcriptions", async (context) => {
    const form = await context.req.formData();
    const audio = form.get("audio");
    if (!(audio instanceof File) || audio.size === 0 || audio.size > MAX_AUDIO_BYTES) {
      throw new HttpError(400, "invalid_voice_audio", "Record a voice clip up to 4 MB.");
    }
    const mediaType = audio.type.split(";", 1)[0]?.toLowerCase();
    if (!mediaType || !ACCEPTED_AUDIO_TYPES.has(mediaType)) {
      throw new HttpError(415, "unsupported_voice_audio", "Use a supported browser audio format.");
    }
    return context.json(
      await service.transcribe(context.env, context.get("tenant").tenantId, audio),
    );
  });

  routes.post("/speech", async (context) => {
    const parsed = assistantVoiceSpeechInputSchema.safeParse(await readJson(context));
    if (!parsed.success)
      throw new HttpError(400, "invalid_request", "Choose a valid assistant reply.");
    const response = await service.synthesize(
      context.env,
      context.get("tenant").tenantId,
      parsed.data.messageId,
      parsed.data.voice,
    );
    context.header("Content-Type", "audio/mpeg");
    context.header("Cache-Control", "no-store");
    // Hono's DOM stream type and Workers' byte-stream generic differ, but the body stays streamed.
    return context.body(response.body as unknown as ReadableStream);
  });

  routes.post("/preview", async (context) => {
    const parsed = assistantVoicePreviewInputSchema.safeParse(await readJson(context));
    if (!parsed.success)
      throw new HttpError(400, "invalid_request", "Choose a valid voice preview.");
    const response = await service.preview(context.env, parsed.data.voice);
    context.header("Content-Type", "audio/mpeg");
    context.header("Cache-Control", "no-store");
    // Hono's DOM stream type and Workers' byte-stream generic differ, but the body stays streamed.
    return context.body(response.body as unknown as ReadableStream);
  });

  return routes;
}
