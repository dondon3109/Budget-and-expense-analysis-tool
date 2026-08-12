import { z } from "zod";

import type { Bindings } from "../types";

const FISH_API_ORIGIN = "https://api.fish.audio";
const FREE_TTS_MODEL = "s2.1-pro-free";
const DEFAULT_TIMEOUT_MS = 30_000;

const transcriptionSchema = z.object({
  text: z.string(),
  duration: z.number().nonnegative(),
  language_code: z.string().optional(),
});

export type FishAudioErrorKind =
  "configuration" | "timeout" | "rate_limit" | "unavailable" | "invalid_response";

export class FishAudioError extends Error {
  constructor(
    readonly kind: FishAudioErrorKind,
    readonly providerStatus?: number,
  ) {
    super("Fish Audio request failed.");
    this.name = "FishAudioError";
  }
}

export interface AssistantVoiceProvider {
  transcribe(
    env: Bindings,
    audio: File,
  ): Promise<{ text: string; durationSeconds: number; languageCode?: string }>;
  synthesize(env: Bindings, text: string): Promise<Response>;
}

function timeoutMs(env: Bindings): number {
  const parsed = Number(env.ASSISTANT_VOICE_PROVIDER_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed >= 5_000 && parsed <= 60_000
    ? parsed
    : DEFAULT_TIMEOUT_MS;
}

async function fishFetch(env: Bindings, path: string, init: RequestInit): Promise<Response> {
  const apiKey = env.FISH_AUDIO_API_KEY?.trim();
  if (!apiKey) throw new FishAudioError("configuration");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs(env));
  try {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${apiKey}`);
    const response = await fetch(`${FISH_API_ORIGIN}${path}`, {
      ...init,
      headers,
      signal: controller.signal,
    });
    if (response.ok) return response;
    await response.body?.cancel();
    if (response.status === 429) throw new FishAudioError("rate_limit", response.status);
    throw new FishAudioError("unavailable", response.status);
  } catch (error) {
    if (error instanceof FishAudioError) throw error;
    if (controller.signal.aborted) throw new FishAudioError("timeout");
    throw new FishAudioError("unavailable");
  } finally {
    clearTimeout(timer);
  }
}

export const fishAudioProvider: AssistantVoiceProvider = {
  async transcribe(env, audio) {
    const formData = new FormData();
    formData.set("audio", audio, audio.name || "voice-input.webm");
    formData.set("ignore_timestamps", "true");
    const response = await fishFetch(env, "/v1/asr", { method: "POST", body: formData });
    const parsed = transcriptionSchema.safeParse(await response.json().catch(() => null));
    if (!parsed.success) throw new FishAudioError("invalid_response");
    const text = parsed.data.text.replace(/\s+/g, " ").trim();
    if (!text) throw new FishAudioError("invalid_response");
    return {
      text,
      durationSeconds: parsed.data.duration,
      ...(parsed.data.language_code ? { languageCode: parsed.data.language_code } : {}),
    };
  },

  async synthesize(env, text) {
    const model = env.FISH_AUDIO_TTS_MODEL?.trim() || FREE_TTS_MODEL;
    if (model !== FREE_TTS_MODEL) throw new FishAudioError("configuration");
    return fishFetch(env, "/v1/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json", model },
      body: JSON.stringify({
        text,
        format: "mp3",
        latency: "balanced",
        normalize: true,
      }),
    });
  },
};
