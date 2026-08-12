import { z } from "zod";

import type { Bindings } from "../types";
import {
  AssistantVoiceProviderError,
  type AssistantVoiceTranscriptionProvider,
} from "./voice-provider";

export const CLOUDFLARE_WHISPER_MODEL = "@cf/openai/whisper-large-v3-turbo" as const;
const DEFAULT_TIMEOUT_MS = 30_000;
const BINARY_CHUNK_SIZE = 32_768;

const transcriptionSchema = z.object({
  text: z.string(),
  transcription_info: z
    .object({
      language: z.string().optional(),
      duration: z.number().nonnegative().optional(),
      duration_after_vad: z.number().nonnegative().optional(),
    })
    .optional(),
});

function timeoutMs(env: Bindings): number {
  const parsed = Number(env.ASSISTANT_VOICE_PROVIDER_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed >= 5_000 && parsed <= 60_000
    ? parsed
    : DEFAULT_TIMEOUT_MS;
}

function encodeBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += BINARY_CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + BINARY_CHUNK_SIZE));
  }
  return btoa(binary);
}

function providerStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const record = error as Record<string, unknown>;
  for (const key of ["status", "statusCode"]) {
    const value = record[key];
    if (typeof value === "number" && Number.isInteger(value)) return value;
  }
  return undefined;
}

export const cloudflareWhisperProvider: AssistantVoiceTranscriptionProvider = {
  async transcribe(env, audio) {
    if (!env.AI) {
      throw new AssistantVoiceProviderError("cloudflare_workers_ai", "configuration");
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs(env));
    try {
      const result = await env.AI.run(
        CLOUDFLARE_WHISPER_MODEL,
        {
          audio: encodeBase64(await audio.arrayBuffer()),
          task: "transcribe",
          vad_filter: true,
          condition_on_previous_text: false,
        },
        { signal: controller.signal },
      );
      const parsed = transcriptionSchema.safeParse(result);
      if (!parsed.success) {
        throw new AssistantVoiceProviderError("cloudflare_workers_ai", "invalid_response");
      }
      const text = parsed.data.text.replace(/\s+/g, " ").trim();
      if (!text) {
        throw new AssistantVoiceProviderError("cloudflare_workers_ai", "invalid_response");
      }
      const info = parsed.data.transcription_info;
      return {
        text,
        durationSeconds: info?.duration ?? info?.duration_after_vad ?? 0,
        ...(info?.language ? { languageCode: info.language } : {}),
      };
    } catch (error) {
      if (error instanceof AssistantVoiceProviderError) throw error;
      const status = providerStatus(error);
      if (controller.signal.aborted) {
        throw new AssistantVoiceProviderError("cloudflare_workers_ai", "timeout");
      }
      if (status === 429) {
        throw new AssistantVoiceProviderError("cloudflare_workers_ai", "rate_limit", status);
      }
      throw new AssistantVoiceProviderError("cloudflare_workers_ai", "unavailable", status);
    } finally {
      clearTimeout(timer);
    }
  },
};
