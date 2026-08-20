import { Hono } from "hono";

import type { AiEntryService } from "../entry/ai-entry-service";
import { HttpError } from "../errors";
import type { AppEnvironment } from "../types";

const MAX_AUDIO_BYTES = 4 * 1024 * 1024;
const MAX_PDF_BYTES = 5 * 1024 * 1024;
const ACCEPTED_AUDIO_TYPES = new Set([
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
  "video/mp4",
]);

export function createAiEntryRoutes(service: AiEntryService) {
  const routes = new Hono<AppEnvironment>();

  routes.post("/voice", async (context) => {
    const form = await context.req.formData();
    const audio = form.get("audio");
    if (!(audio instanceof File) || audio.size === 0 || audio.size > MAX_AUDIO_BYTES) {
      throw new HttpError(400, "invalid_entry_audio", "Record a voice clip up to 4 MB.");
    }
    const mediaType = audio.type.split(";", 1)[0]?.toLowerCase();
    if (!mediaType || !ACCEPTED_AUDIO_TYPES.has(mediaType)) {
      throw new HttpError(
        415,
        "unsupported_entry_audio",
        "Use a supported voice recording format.",
      );
    }
    return context.json(
      await service.extractVoice(context.env, context.get("tenant").tenantId, audio),
    );
  });

  routes.post("/pdf-preview", async (context) => {
    const form = await context.req.formData();
    const pdf = form.get("pdf");
    if (!(pdf instanceof File) || pdf.size === 0 || pdf.size > MAX_PDF_BYTES) {
      throw new HttpError(400, "invalid_statement_pdf", "Choose a PDF statement up to 5 MB.");
    }
    const mediaType = pdf.type.split(";", 1)[0]?.toLowerCase();
    if (mediaType !== "application/pdf") {
      throw new HttpError(415, "unsupported_statement_pdf", "Use a PDF statement.");
    }
    return context.json(await service.previewPdf(context.env, context.get("tenant").tenantId, pdf));
  });

  return routes;
}
