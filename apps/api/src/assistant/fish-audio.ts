import type { Bindings } from "../types";
import { AssistantVoiceProviderError, type AssistantVoiceSpeechProvider } from "./voice-provider";

const FISH_API_ORIGIN = "https://api.fish.audio";
const FREE_TTS_MODEL = "s2.1-pro-free";
const DEFAULT_TIMEOUT_MS = 30_000;

function timeoutMs(env: Bindings): number {
  const parsed = Number(env.ASSISTANT_VOICE_PROVIDER_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed >= 5_000 && parsed <= 60_000
    ? parsed
    : DEFAULT_TIMEOUT_MS;
}

async function fishFetch(env: Bindings, path: string, init: RequestInit): Promise<Response> {
  const apiKey = env.FISH_AUDIO_API_KEY?.trim();
  if (!apiKey) throw new AssistantVoiceProviderError("fish_audio", "configuration");

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
    if (response.status === 429) {
      throw new AssistantVoiceProviderError("fish_audio", "rate_limit", response.status);
    }
    throw new AssistantVoiceProviderError("fish_audio", "unavailable", response.status);
  } catch (error) {
    if (error instanceof AssistantVoiceProviderError) throw error;
    if (controller.signal.aborted) {
      throw new AssistantVoiceProviderError("fish_audio", "timeout");
    }
    throw new AssistantVoiceProviderError("fish_audio", "unavailable");
  } finally {
    clearTimeout(timer);
  }
}

export const fishAudioProvider: AssistantVoiceSpeechProvider = {
  async synthesize(env, text) {
    const model = env.FISH_AUDIO_TTS_MODEL?.trim() || FREE_TTS_MODEL;
    if (model !== FREE_TTS_MODEL) {
      throw new AssistantVoiceProviderError("fish_audio", "configuration");
    }
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
