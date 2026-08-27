import type { ProviderConfig, ProviderService } from "@zoption/shared";
import { providerAllowlist } from "@zoption/shared";

import { createDeepSeekProvider } from "./assistant/deepseek";
import { createCloudflareWhisperProvider } from "./assistant/cloudflare-whisper";
import { createFishAudioProvider } from "./assistant/fish-audio";
import { createGoogleSttProvider } from "./assistant/google-stt";
import type { AssistantProvider } from "./assistant/provider";
import type { AssistantVoiceProviders } from "./assistant/voice-provider";
import type { Bindings } from "./types";
import type { ProviderConfigRepository } from "./db/provider-configs";
import { providerConfigRepository } from "./db/provider-configs";
import type { ProviderCredentialRepository } from "./db/provider-credentials";
import { providerCredentialRepository } from "./db/provider-credentials";
import { decryptSecret } from "./provider-credentials/crypto";

const CACHE_TTL_MS = 30_000;

type CacheEntry = { value: ProviderConfig | null; expiresAt: number };

export interface ProviderHealthStatus {
  service: ProviderService;
  provider: string;
  model: string;
  displayName?: string;
  configId?: string | null;
  hasCredential: boolean;
  credentialName: string | null;
  credentialId?: string | null;
  apiKeyLast4?: string | null;
  credentialSource?: "db" | "legacy" | "binding" | "none";
  details: string;
}

const CREDENTIAL_EXPECTATION: Record<ProviderService, Record<string, boolean>> = {
  assistant: { deepseek: true },
  // google via Cloud Run bridge uses ADC (attached SA) — no admin credential forwarded at runtime; REST health check can use admin credential optionally
  stt: { cloudflare_workers_ai: false, google: false },
  tts: { fish_audio: true },
};

function expectsCredential(service: ProviderService, provider: string): boolean {
  return CREDENTIAL_EXPECTATION[service]?.[provider] ?? true;
}

export interface ResolvedCredential {
  secret: string | null;
  last4: string | null;
  source: "db" | "legacy" | "binding" | "none";
}

export interface ProviderRegistry {
  getActive(env: Bindings, service: ProviderService): Promise<ProviderConfig | null>;
  getAll(env: Bindings, service?: ProviderService): Promise<ProviderConfig[]>;
  getAssistantProvider(
    env: Bindings,
  ): Promise<{
    provider: AssistantProvider;
    config: ProviderConfig | null;
    credential: ResolvedCredential | null;
  }>;
  getVoiceProviders(
    env: Bindings,
  ): Promise<{
    providers: AssistantVoiceProviders;
    sttConfig: ProviderConfig | null;
    ttsConfig: ProviderConfig | null;
  }>;
  getHealth(env: Bindings): Promise<ProviderHealthStatus[]>;
  getDecryptedSecret(env: Bindings, config: ProviderConfig | null): Promise<ResolvedCredential>;
  invalidate(service?: ProviderService): void;
  validateAllowlist(service: ProviderService, provider: string, model: string): boolean;
}

export function createProviderRegistry(
  repository: ProviderConfigRepository = providerConfigRepository,
  credentialRepository: ProviderCredentialRepository = providerCredentialRepository,
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

  async function resolveCredential(
    env: Bindings,
    config: ProviderConfig | null,
  ): Promise<ResolvedCredential> {
    if (!config) return { secret: null, last4: null, source: "none" };
    // Cloudflare Workers AI binding has no secret
    if (config.provider === "cloudflare_workers_ai") {
      const hasBinding = Boolean(env.AI);
      return { secret: null, last4: null, source: hasBinding ? "binding" : "none" };
    }
    // Try DB credential
    if (config.credentialId) {
      try {
        const row = await credentialRepository.getEncryptedById(env, config.credentialId);
        if (row?.encrypted_secret) {
          const master = env.PROVIDER_CREDENTIAL_ENCRYPTION_KEY?.trim() ?? "";
          if (!master) {
            return { secret: null, last4: row.api_key_last4 ?? null, source: "none" };
          }
          try {
            const plain = await decryptSecret(row.encrypted_secret, master);
            return { secret: plain, last4: row.api_key_last4, source: "db" };
          } catch {
            return { secret: null, last4: row.api_key_last4, source: "none" };
          }
        }
      } catch {
        // fall through to legacy
      }
    }
    // Legacy env fallback for one release
    if (expectsCredential(config.service, config.provider)) {
      const legacyMap: Record<string, string | undefined> = {
        deepseek: env.DEEPSEEK_API_KEY?.trim(),
        fish_audio: env.FISH_AUDIO_API_KEY?.trim(),
        google: (env as unknown as Record<string, string | undefined>)["GOOGLE_STT_API_KEY"],
      };
      const legacy = legacyMap[config.provider]?.trim();
      if (legacy) {
        return { secret: legacy, last4: legacy.slice(-4), source: "legacy" };
      }
    }
    return { secret: null, last4: null, source: "none" };
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

    async getDecryptedSecret(
      env: Bindings,
      config: ProviderConfig | null,
    ): Promise<ResolvedCredential> {
      return resolveCredential(env, config);
    },

    async getAssistantProvider(
      env: Bindings,
    ): Promise<{
      provider: AssistantProvider;
      config: ProviderConfig | null;
      credential: ResolvedCredential | null;
    }> {
      const cfg = await this.getActive(env, "assistant");
      const cred = await resolveCredential(env, cfg);
      const model = cfg?.model;
      // Inject decrypted secret when available; provider falls back to env otherwise
      const provider = createDeepSeekProvider(model, undefined, cred.secret ?? undefined);
      return { provider, config: cfg, credential: cred };
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
      const [sttCred, ttsCred] = await Promise.all([
        resolveCredential(env, sttCfg),
        resolveCredential(env, ttsCfg),
      ]);
      // Cloudflare Whisper needs binding, Google needs secret; Fish needs secret
      const transcription =
        sttCfg?.provider === "google"
          ? createGoogleSttProvider(sttCfg?.model, sttCred.secret ?? undefined)
          : createCloudflareWhisperProvider(sttCfg?.model);
      const speech = createFishAudioProvider(ttsCfg?.model, ttsCred.secret ?? undefined);
      // Attach sttCred for callers that need it (future google)
      void sttCred;
      return {
        providers: {
          transcription,
          speech,
        },
        sttConfig: sttCfg,
        ttsConfig: ttsCfg,
      };
    },

    async getHealth(env: Bindings): Promise<ProviderHealthStatus[]> {
      const [assistantCfg, sttCfg, ttsCfg] = await Promise.all([
        this.getActive(env, "assistant"),
        this.getActive(env, "stt"),
        this.getActive(env, "tts"),
      ]);
      const [assistantCred, sttCred, ttsCred] = await Promise.all([
        resolveCredential(env, assistantCfg),
        resolveCredential(env, sttCfg),
        resolveCredential(env, ttsCfg),
      ]);

      const build = (
        service: ProviderService,
        cfg: ProviderConfig | null,
        cred: ResolvedCredential,
        fallbackProvider: string,
        fallbackModel: string,
      ): ProviderHealthStatus => {
        if (!cfg) {
          // No DB config — report fallback env/binding
          if (service === "stt") {
            const hasBinding = Boolean(env.AI);
            return {
              service,
              provider: fallbackProvider,
              model: fallbackModel,
              configId: null,
              displayName: undefined,
              hasCredential: hasBinding,
              credentialName: null,
              credentialId: null,
              apiKeyLast4: null,
              credentialSource: hasBinding ? "binding" : "none",
              details: hasBinding
                ? "Workers AI binding available"
                : "Workers AI binding missing — check wrangler.jsonc ai binding",
            };
          }
          const legacyKey =
            service === "assistant" ? env.DEEPSEEK_API_KEY?.trim() : env.FISH_AUDIO_API_KEY?.trim();
          const legacyName = service === "assistant" ? "DEEPSEEK_API_KEY" : "FISH_AUDIO_API_KEY";
          return {
            service,
            provider: fallbackProvider,
            model: fallbackModel,
            configId: null,
            displayName: undefined,
            hasCredential: Boolean(legacyKey),
            credentialName: legacyName,
            credentialId: null,
            apiKeyLast4: legacyKey ? legacyKey.slice(-4) : null,
            credentialSource: legacyKey ? "legacy" : "none",
            details: legacyKey
              ? "Secret configured via legacy Worker secret (fallback, migrate to credential)"
              : `Missing — create a credential in admin UI`,
          };
        }
        const expects = expectsCredential(cfg.service, cfg.provider);
        let hasCredential: boolean;
        let details: string;
        if (cfg.provider === "cloudflare_workers_ai") {
          hasCredential = cred.source === "binding";
          details = hasCredential ? "Workers AI binding available" : "Workers AI binding missing";
        } else if (cfg.provider === "google") {
          // Google can use an encrypted DB credential (API key / token) and/or Cloud Run bridge ADC
          const bridgeUrl =
            (env as unknown as Record<string, string | undefined>).STT_BRIDGE_URL?.trim() ??
            (env as Bindings & { STT_BRIDGE_URL?: string }).STT_BRIDGE_URL?.trim();
          if (cred.source === "db") {
            hasCredential = true;
            details = bridgeUrl
              ? `Credential ••••${cred.last4} (encrypted) · Bridge connected`
              : `Credential ••••${cred.last4} (encrypted)`;
          } else if (bridgeUrl) {
            hasCredential = true;
            details = "Bridge configured (ADC in Cloud Run)";
          } else {
            hasCredential = false;
            details =
              "Missing credential — add a Google API key credential and link it to this configuration";
          }
        } else if (!expects) {
          hasCredential = true;
          details = "No credential required";
        } else if (cred.source === "db") {
          hasCredential = true;
          details = `Credential ••••${cred.last4} (encrypted)`;
        } else if (cred.source === "legacy") {
          hasCredential = true;
          details = `Credential ••••${cred.last4} via legacy Worker secret — migrate to UI credential`;
        } else {
          hasCredential = false;
          details = "Missing credential — add a credential and link it to this configuration";
        }
        return {
          service: cfg.service,
          provider: cfg.provider,
          model: cfg.model,
          displayName: cfg.displayName,
          configId: cfg.id,
          hasCredential,
          credentialName: cred.last4 ? `••••${cred.last4}` : null,
          credentialId: cfg.credentialId,
          apiKeyLast4: cred.last4,
          credentialSource:
            cred.source === "db"
              ? "db"
              : cred.source === "legacy"
                ? "legacy"
                : cred.source === "binding"
                  ? "binding"
                  : "none",
          details,
        };
      };

      return [
        build("assistant", assistantCfg, assistantCred, "deepseek", "deepseek-v4-flash"),
        build("stt", sttCfg, sttCred, "cloudflare_workers_ai", "@cf/openai/whisper-large-v3-turbo"),
        build("tts", ttsCfg, ttsCred, "fish_audio", "s2.1-pro-free"),
      ];
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
      displayName: `deepseek / ${model}`,
      credentialId: null,
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
      displayName: "cloudflare_workers_ai / @cf/openai/whisper-large-v3-turbo",
      credentialId: null,
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
      displayName: `fish_audio / ${model}`,
      credentialId: null,
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
