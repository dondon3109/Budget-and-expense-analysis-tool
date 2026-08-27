import type { ProviderConfig, ProviderService } from "@zoption/shared";
import { providerAllowlist } from "@zoption/shared";

import { createDeepSeekProvider } from "./assistant/deepseek";
import { createCloudflareWhisperProvider } from "./assistant/cloudflare-whisper";
import { createFishAudioProvider } from "./assistant/fish-audio";
import type { AssistantProvider } from "./assistant/provider";
import type { AssistantVoiceProviders } from "./assistant/voice-provider";
import type { Bindings } from "./types";
import type { ProviderConfigRepository } from "./db/provider-configs";
import { providerConfigRepository } from "./db/provider-configs";

const CACHE_TTL_MS = 30_000;

type CacheEntry = { value: ProviderConfig | null; expiresAt: number };

export interface ProviderRegistry {
  getActive(env: Bindings, service: ProviderService): Promise<ProviderConfig | null>;
  getAll(env: Bindings, service?: ProviderService): Promise<ProviderConfig[]>;
  getAssistantProvider(env: Bindings): Promise<{ provider: AssistantProvider; config: ProviderConfig | null }>;
  getVoiceProviders(env: Bindings): Promise<{ providers: AssistantVoiceProviders; sttConfig: ProviderConfig | null; ttsConfig: ProviderConfig | null }>;
  invalidate(service?: ProviderService): void;
  validateAllowlist(service: ProviderService, provider: string, model: string): boolean;
}

export function createProviderRegistry(
  repository: ProviderConfigRepository = providerConfigRepository,
): ProviderRegistry {
  const cache = new Map<ProviderService, CacheEntry>();

  function isValid(service: ProviderService, provider: string, model: string): boolean {
    const serviceMap = providerAllowlist[service];
    if (!serviceMap) return false;
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
    const models = (serviceMap as Record<string, readonly string[]>)[provider];
    if (!models) return false;
    return models.includes(model);
  }

  return {
    validateAllowlist(service, provider, model) {
      return isValid(service, provider, model);
    },

    async getActive(env: Bindings, service: ProviderService): Promise<ProviderConfig | null> {
      const now = Date.now();
      const cached = cache.get(service);
      if (cached && cached.expiresAt > now) return cached.value;

      let row: ProviderConfig | null;
      try {
        row = await repository.getActive(env, service);
      } catch {
        // DB unavailable (e.g., before migration) -> fallback to env below
        row = null;
      }

      // If DB has an active entry, cache and return it
      if (row) {
        cache.set(service, { value: row, expiresAt: now + CACHE_TTL_MS });
        return row;
      }

      // Fallback to env-based defaults when DB is empty or unavailable
      // This preserves production behavior before migration or if D1 is down.
      const fallback = envFallback(service, env);
      if (fallback) {
        // Don't cache fallback as active to always re-check DB quickly
        cache.set(service, { value: fallback, expiresAt: now + CACHE_TTL_MS / 3 });
        return fallback;
      }
      cache.set(service, { value: null, expiresAt: now + CACHE_TTL_MS });
      return null;
    },

    async getAll(env: Bindings, service?: ProviderService): Promise<ProviderConfig[]> {
      return repository.list(env, service);
    },

    async getAssistantProvider(env: Bindings): Promise<{ provider: AssistantProvider; config: ProviderConfig | null }> {
      const cfg = await this.getActive(env, "assistant");
      const model = cfg?.model;
      // Only deepseek is currently allowlisted; future providers can be switched here.
      const provider = createDeepSeekProvider(model);
      return { provider, config: cfg };
    },

    async getVoiceProviders(env: Bindings): Promise<{
      providers: AssistantVoiceProviders;
      sttConfig: ProviderConfig | null;
      ttsConfig: ProviderConfig | null;
    }> {
      const [sttCfg, ttsCfg] = await Promise.all([
        this.getActive(env, "stt"),
        this.getActive(env, "tts"),
      ]);
      return {
        providers: {
          transcription: createCloudflareWhisperProvider(sttCfg?.model),
          speech: createFishAudioProvider(ttsCfg?.model),
        },
        sttConfig: sttCfg,
        ttsConfig: ttsCfg,
      };
    },

    invalidate(service?: ProviderService): void {
      if (service) cache.delete(service);
      else cache.clear();
    },
  };
}

function envFallback(service: ProviderService, env: Bindings): ProviderConfig | null {
  const nowIso = new Date().toISOString();
  if (service === "assistant") {
    const model = env.DEEPSEEK_MODEL?.trim() || "deepseek-v4-flash";
    return {
      id: "env-fallback-assistant",
      service: "assistant",
      provider: "deepseek",
      model,
      enabled: true,
      priority: 1,
      isActive: true,
      createdAt: nowIso,
      updatedAt: nowIso,
      updatedBy: null,
    };
  }
  if (service === "stt") {
    return {
      id: "env-fallback-stt",
      service: "stt",
      provider: "cloudflare_workers_ai",
      model: "@cf/openai/whisper-large-v3-turbo",
      createdAt: nowIso,
      updatedAt: nowIso,
      updatedBy: null,
      enabled: true,
      priority: 1,
      isActive: true,
    };
  }
  if (service === "tts") {
    const model = env.FISH_AUDIO_TTS_MODEL?.trim() || "s2.1-pro-free";
    return {
      id: "env-fallback-tts",
      service: "tts",
      provider: "fish_audio",
      model,
      enabled: true,
      priority: 1,
      isActive: true,
      createdAt: nowIso,
      updatedAt: nowIso,
      updatedBy: null,
    };
  }
  return null;
}

export const providerRegistry = createProviderRegistry();
