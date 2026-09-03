import { z } from "zod";

import type { Bindings } from "../types";
import {
  ANTHROPIC_MODELS_ENDPOINT,
  assistantChatEndpoint,
  assistantModelsEndpointOverride,
  GEMINI_MODELS_ENDPOINT,
} from "./assistant-providers";
import { AssistantProviderError } from "./provider-error";

const MODEL_LIST_TIMEOUT_MS = 10_000;
const MAX_MODELS = 300;
const MAX_LIST_PAGES = 5;
const LIST_PAGE_SIZE = 100;

const openAiModelsSchema = z.object({
  data: z
    .array(z.object({ id: z.string().min(1) }).passthrough())
    .max(2_000)
    .optional()
    .default([]),
  has_more: z.boolean().optional(),
  last_id: z.string().min(1).optional(),
});

const geminiModelsSchema = z.object({
  models: z
    .array(
      z
        .object({
          name: z.string().min(1),
          displayName: z.string().optional(),
          supportedGenerationMethods: z.array(z.string()).optional(),
        })
        .passthrough(),
    )
    .max(2_000)
    .optional()
    .default([]),
  nextPageToken: z.string().min(1).optional(),
});

function classifyStatus(
  provider: string,
  status: number,
): {
  kind: "configuration" | "rate_limit" | "unavailable" | "invalid_response";
  reason: AssistantProviderError["reason"];
} {
  if (status === 429) return { kind: "rate_limit", reason: "rate_limited" };
  if (status === 401 || status === 403)
    return { kind: "configuration", reason: "credentials_rejected" };
  if (status >= 500) return { kind: "unavailable", reason: "upstream_unavailable" };
  return { kind: "invalid_response", reason: "request_rejected" };
}

/** Derive a vendor's OpenAI-style `/models` URL from its chat-completions endpoint. */
function openAiModelsUrl(chatEndpoint: string): string {
  const trimmed = chatEndpoint.replace(/\/$/, "");
  if (trimmed.endsWith("/models")) return trimmed;
  const suffix = "/chat/completions";
  if (trimmed.endsWith(suffix)) return `${trimmed.slice(0, -suffix.length)}/models`;
  return `${trimmed}/models`;
}

async function getJson(
  provider: string,
  url: string,
  headers: Record<string, string>,
  fetcher: typeof fetch,
): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("models_timeout"), MODEL_LIST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetcher(url, { method: "GET", headers, signal: controller.signal });
  } catch {
    if (controller.signal.aborted) {
      throw new AssistantProviderError(
        "timeout",
        "timed_out",
        "The provider took too long to list models.",
        provider,
      );
    }
    throw new AssistantProviderError(
      "unavailable",
      "fetch_failed",
      "The provider is unavailable.",
      provider,
    );
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) {
    const mapped = classifyStatus(provider, response.status);
    const message =
      mapped.reason === "credentials_rejected"
        ? "The provider rejected this key."
        : mapped.reason === "rate_limited"
          ? "The provider is temporarily rate limited."
          : mapped.reason === "upstream_unavailable"
            ? "The provider is temporarily unavailable."
            : "The provider rejected the model-list request.";
    throw new AssistantProviderError(
      mapped.kind,
      mapped.reason,
      message,
      provider,
      response.status,
    );
  }
  return response.json().catch(() => null);
}

function finalize(provider: string, ids: string[]): string[] {
  const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  unique.sort((a, b) => a.localeCompare(b));
  return unique.slice(0, MAX_MODELS);
}

function withParams(base: string, params: Record<string, string>): string {
  const url = new URL(base);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.toString();
}

function malformedModelsError(provider: string): AssistantProviderError {
  return new AssistantProviderError(
    "invalid_response",
    "malformed_response",
    "The provider returned an unusable model list.",
    provider,
  );
}

/**
 * Fetch every page of an OpenAI-style (`after`) or Anthropic-style
 * (`after_id`) model list. Vendors that omit `has_more` stop the walk with a
 * short final page. A malformed later page keeps what earlier pages returned.
 */
async function fetchOpenAiStyleModels(
  provider: string,
  baseUrl: string,
  headers: Record<string, string>,
  fetcher: typeof fetch,
  cursorParam: "after" | "after_id",
): Promise<string[]> {
  const ids: string[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < MAX_LIST_PAGES; page += 1) {
    const params: Record<string, string> = { limit: String(LIST_PAGE_SIZE) };
    if (cursor) params[cursorParam] = cursor;
    const parsed = openAiModelsSchema.safeParse(
      await getJson(provider, withParams(baseUrl, params), headers, fetcher),
    );
    if (!parsed.success) {
      if (ids.length > 0) break;
      throw malformedModelsError(provider);
    }
    const pageIds = parsed.data.data.map((entry) => entry.id);
    ids.push(...pageIds);
    const hasMore = parsed.data.has_more ?? pageIds.length >= LIST_PAGE_SIZE;
    const next = parsed.data.last_id ?? pageIds[pageIds.length - 1];
    if (!hasMore || !next) break;
    cursor = next;
  }
  if (ids.length === 0) throw malformedModelsError(provider);
  return finalize(provider, ids);
}

async function fetchGeminiModels(
  provider: string,
  baseUrl: string,
  headers: Record<string, string>,
  fetcher: typeof fetch,
): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < MAX_LIST_PAGES; page += 1) {
    const params: Record<string, string> = { pageSize: String(LIST_PAGE_SIZE) };
    if (pageToken) params["pageToken"] = pageToken;
    const parsed = geminiModelsSchema.safeParse(
      await getJson(provider, withParams(baseUrl, params), headers, fetcher),
    );
    if (!parsed.success) {
      if (ids.length > 0) break;
      throw malformedModelsError(provider);
    }
    ids.push(
      ...parsed.data.models
        .filter((entry) => entry.supportedGenerationMethods?.includes("generateContent") ?? true)
        .map((entry) => entry.name.replace(/^models\//, "")),
    );
    if (!parsed.data.nextPageToken) break;
    pageToken = parsed.data.nextPageToken;
  }
  if (ids.length === 0) throw malformedModelsError(provider);
  return finalize(provider, ids);
}

/**
 * List the model IDs a vendor key can access. Used by the admin UI so a new
 * key can pick a real model instead of the curated allowlist. Listing calls
 * are free on every supported vendor. The plaintext key stays in memory for
 * this single call and is never stored or logged.
 */
export async function listAssistantModels(
  env: Bindings | undefined,
  provider: string,
  secret: string | undefined,
  fetcher: typeof fetch = fetch,
): Promise<string[]> {
  const apiKey = secret?.trim();
  if (!apiKey) {
    throw new AssistantProviderError(
      "configuration",
      "missing_api_key",
      "Enter an API key before fetching models.",
      provider,
    );
  }

  if (provider === "anthropic") {
    const url = assistantModelsEndpointOverride(env, provider) ?? ANTHROPIC_MODELS_ENDPOINT;
    return fetchOpenAiStyleModels(
      provider,
      url,
      { Accept: "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      fetcher,
      "after_id",
    );
  }

  if (provider === "gemini") {
    const url = assistantModelsEndpointOverride(env, provider) ?? GEMINI_MODELS_ENDPOINT;
    return fetchGeminiModels(
      provider,
      url,
      { Accept: "application/json", "x-goog-api-key": apiKey },
      fetcher,
    );
  }

  if (
    provider === "openai" ||
    provider === "deepseek" ||
    provider === "meta" ||
    provider === "muse_spark"
  ) {
    const url =
      assistantModelsEndpointOverride(env, provider) ??
      openAiModelsUrl(assistantChatEndpoint(env, provider));
    return fetchOpenAiStyleModels(
      provider,
      url,
      { Accept: "application/json", Authorization: `Bearer ${apiKey}` },
      fetcher,
      "after",
    );
  }

  throw new AssistantProviderError(
    "invalid_response",
    "request_rejected",
    "This provider does not support model listing.",
    provider,
  );
}
