import type { Bindings } from "../types";
import { AnthropicProvider } from "./anthropic";
import { ChatCompletionsProvider } from "./chat-completions";
import type { AssistantProvider } from "./provider";

export const ASSISTANT_ENDPOINTS = {
  deepseek: "https://api.deepseek.com/chat/completions",
  openai: "https://api.openai.com/v1/chat/completions",
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
  meta: "https://api.llama.com/v1/chat/completions",
  muse_spark: "https://api.meta.ai/v1/chat/completions",
} as const;

export const ASSISTANT_DEFAULT_MODELS: Record<string, string> = {
  deepseek: "deepseek-v4-flash",
  openai: "gpt-4o-mini",
  anthropic: "claude-3-5-haiku-latest",
  gemini: "gemini-2.0-flash",
  meta: "Llama-4-Maverick-17B-128E-Instruct-FP8",
  muse_spark: "muse-spark-1.1",
};

function endpointOverride(env: Bindings | undefined, provider: string): string | undefined {
  if (!env) return undefined;
  const record = env as unknown as Record<string, string | undefined>;
  const key = `${provider.toUpperCase()}_API_URL`;
  return record[key]?.trim() || undefined;
}

export const ANTHROPIC_MESSAGES_ENDPOINT = "https://api.anthropic.com/v1/messages";
export const ANTHROPIC_MODELS_ENDPOINT = "https://api.anthropic.com/v1/models";
export const GEMINI_MODELS_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

/** Chat-completions endpoint for an assistant provider, honoring `<PROVIDER>_API_URL`. */
export function assistantChatEndpoint(env: Bindings | undefined, provider: string): string {
  const defaults = ASSISTANT_ENDPOINTS as unknown as Record<string, string>;
  return endpointOverride(env, provider) ?? defaults[provider] ?? ASSISTANT_ENDPOINTS.deepseek;
}

/** Model-listing endpoint override (`<PROVIDER>_MODELS_URL`) when a test gateway needs one. */
export function assistantModelsEndpointOverride(
  env: Bindings | undefined,
  provider: string,
): string | undefined {
  if (!env) return undefined;
  const record = env as unknown as Record<string, string | undefined>;
  return record[`${provider.toUpperCase()}_MODELS_URL`]?.trim() || undefined;
}

/**
 * Create the runtime assistant provider for an active DB configuration.
 * DeepSeek, OpenAI, Gemini, Meta, and Muse Spark share the OpenAI Chat
 * Completions shape; Anthropic uses its native Messages API.
 */
export function createAssistantProviderForConfig(
  provider: string,
  model: string | undefined,
  secret: string | undefined,
  env?: Bindings,
  fetcher: typeof fetch = fetch,
): AssistantProvider {
  const resolvedModel = model?.trim() || ASSISTANT_DEFAULT_MODELS[provider] || "deepseek-v4-flash";
  if (provider === "anthropic") {
    return new AnthropicProvider(
      resolvedModel,
      secret,
      endpointOverride(env, provider) ?? ANTHROPIC_MESSAGES_ENDPOINT,
      fetcher,
    );
  }
  const endpoint = assistantChatEndpoint(env, provider);
  return new ChatCompletionsProvider(
    {
      provider,
      endpoint,
      model: resolvedModel,
      apiKey: secret,
      ...(provider === "deepseek" ? { extraBody: { thinking: { type: "disabled" } } } : {}),
      // Meta rejects every tool_choice value except the default auto behavior.
      ...(provider === "muse_spark" ? { toolChoiceStrategy: "auto-only" as const } : {}),
    },
    fetcher,
  );
}

/** Legacy Worker-secret fallback per assistant provider (one release). */
export function legacyAssistantApiKey(env: Bindings, provider: string): string | undefined {
  const record = env as unknown as Record<string, string | undefined>;
  const map: Record<string, string | undefined> = {
    deepseek: env.DEEPSEEK_API_KEY?.trim(),
    openai: record["OPENAI_API_KEY"]?.trim(),
    anthropic: record["ANTHROPIC_API_KEY"]?.trim(),
    gemini: record["GEMINI_API_KEY"]?.trim() ?? record["GOOGLE_AI_STUDIO_API_KEY"]?.trim(),
    meta: record["META_API_KEY"]?.trim(),
    muse_spark: record["MUSE_SPARK_API_KEY"]?.trim(),
  };
  return map[provider]?.trim() || undefined;
}
