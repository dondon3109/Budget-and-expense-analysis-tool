import { Hono } from "hono";

import type { AiEntryService } from "../entry/ai-entry-service";
import { HttpError } from "../errors";
import { readJson } from "../request";
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

function parseCategoryList(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    const list = value
      .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      .map((item) => item.trim().slice(0, 80))
      .slice(0, 100);
    return list.length > 0 ? list : undefined;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    try {
      const parsed: unknown = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parseCategoryList(parsed);
      }
    } catch {
      const list = value
        .split(",")
        .map((s) => s.trim().slice(0, 80))
        .filter((s) => s.length > 0)
        .slice(0, 100);
      return list.length > 0 ? list : undefined;
    }
  }
  return undefined;
}

export function createAiEntryRoutes(service: AiEntryService) {
  const routes = new Hono<AppEnvironment>();

  routes.post("/voice", async (context) => {
    const contentType = context.req.header("Content-Type")?.toLowerCase() ?? "";
    if (contentType.includes("application/json")) {
      const body = await readJson(context);
      const record =
        typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
      const transcript =
        typeof record.transcript === "string" ? record.transcript.trim() : "";
      if (!transcript) {
        throw new HttpError(400, "invalid_entry_transcript", "Provide a transcript to extract.");
      }
      const categories = parseCategoryList(record.categories);
      return context.json(
        categories !== undefined
          ? await service.extractVoiceTranscript(
              context.env,
              context.get("tenant").tenantId,
              transcript,
              categories,
            )
          : await service.extractVoiceTranscript(
              context.env,
              context.get("tenant").tenantId,
              transcript,
            ),
      );
    }

    const form = await context.req.formData();
    const categories = parseCategoryList(form.get("categories"));
    const transcriptField = form.get("transcript");
    if (typeof transcriptField === "string" && transcriptField.trim().length > 0) {
      return context.json(
        categories !== undefined
          ? await service.extractVoiceTranscript(
              context.env,
              context.get("tenant").tenantId,
              transcriptField.trim(),
              categories,
            )
          : await service.extractVoiceTranscript(
              context.env,
              context.get("tenant").tenantId,
              transcriptField.trim(),
            ),
      );
    }

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
      categories !== undefined
        ? await service.extractVoice(
            context.env,
            context.get("tenant").tenantId,
            audio,
            categories,
          )
        : await service.extractVoice(context.env, context.get("tenant").tenantId, audio),
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
