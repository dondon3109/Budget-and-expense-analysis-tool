import { z } from "zod";

import type { Bindings } from "../types";
import type { AssistantProvider, ProviderCompletion, ProviderCompletionRequest } from "./provider";
import { AssistantProviderError } from "./provider-error";

const toolCallSchema = z.object({
  id: z.string().min(1),
  type: z.literal("function"),
  function: z.object({
    name: z.string().min(1),
    arguments: z.string(),
  }),
});

const responseSchema = z.object({
  model: z.string().min(1),
  choices: z
    .array(
      z.object({
        finish_reason: z.string(),
        message: z.object({
          role: z.literal("assistant"),
          content: z.string().nullable(),
          tool_calls: z.array(toolCallSchema).optional(),
          reasoning_content: z.unknown().optional(),
        }),
      }),
    )
    .min(1),
  usage: z
    .object({
      prompt_tokens: z.number().int().nonnegative().optional(),
      completion_tokens: z.number().int().nonnegative().optional(),
    })
    .optional(),
});

export interface ChatCompletionsOptions {
  provider: string;
  endpoint: string;
  model: string;
  apiKey: string | undefined;
  /** Extra vendor-specific body fields (e.g. DeepSeek `thinking`). */
  extraBody?: Record<string, unknown>;
  /**
   * `"auto-only"` omits `tool_choice` from every request. Meta's Chat
   * Completions endpoint only supports the default auto behavior —
   * `"required"`, `"none"`, and named-function choices return HTTP 400.
   */
  toolChoiceStrategy?: "passthrough" | "auto-only";
}

function configuredNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

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

/**
 * Generic OpenAI Chat Completions client shared by DeepSeek, OpenAI, Gemini
 * (OpenAI-compatible endpoint), Meta Llama API, and Muse Spark. All of these
 * vendors accept the same messages/tools/tool_choice shape and Bearer auth.
 */
export class ChatCompletionsProvider implements AssistantProvider {
  readonly providerName: string;

  constructor(
    private readonly options: ChatCompletionsOptions,
    private readonly fetcher: typeof fetch = fetch,
  ) {
    this.providerName = options.provider;
  }

  async complete(env: Bindings, request: ProviderCompletionRequest): Promise<ProviderCompletion> {
    const apiKey = this.options.apiKey?.trim();
    if (!apiKey) {
      throw new AssistantProviderError(
        "configuration",
        "missing_api_key",
        "The assistant provider is not configured.",
        this.providerName,
      );
    }

    const timeoutMs = configuredNumber(env.ASSISTANT_PROVIDER_TIMEOUT_MS, 12_000);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort("provider_timeout"), timeoutMs);
    const abortFromParent = () => controller.abort(request.signal?.reason ?? "request_aborted");
    request.signal?.addEventListener("abort", abortFromParent, { once: true });

    const fetcher = this.fetcher;
    const toolChoice =
      this.options.toolChoiceStrategy === "auto-only" ? undefined : (request.toolChoice ?? "auto");
    let response: Response;
    try {
      response = await fetcher(this.options.endpoint, {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.options.model,
          messages: request.messages,
          tools: request.tools,
          ...(toolChoice === undefined ? {} : { tool_choice: toolChoice }),
          temperature: 0.15,
          max_tokens: 800,
          stream: false,
          ...this.options.extraBody,
        }),
        signal: controller.signal,
      });
    } catch {
      if (controller.signal.aborted) {
        throw new AssistantProviderError(
          "timeout",
          "timed_out",
          "The assistant provider timed out.",
          this.providerName,
        );
      }
      throw new AssistantProviderError(
        "unavailable",
        "fetch_failed",
        "The assistant provider is unavailable.",
        this.providerName,
      );
    } finally {
      clearTimeout(timeout);
      request.signal?.removeEventListener("abort", abortFromParent);
    }

    if (!response.ok) {
      const mapped = classifyStatus(this.providerName, response.status);
      const messages: Record<AssistantProviderError["reason"], string> = {
        missing_api_key: "The assistant provider is not configured.",
        credentials_rejected: "The assistant provider rejected its credentials.",
        rate_limited: "The assistant provider is temporarily rate limited.",
        upstream_unavailable: "The assistant provider is temporarily unavailable.",
        fetch_failed: "The assistant provider is unavailable.",
        timed_out: "The assistant provider timed out.",
        request_rejected: "The assistant provider rejected the request.",
        malformed_response: "The assistant provider returned invalid data.",
        content_filtered: "The assistant response was blocked.",
      };
      throw new AssistantProviderError(
        mapped.kind,
        mapped.reason,
        messages[mapped.reason],
        this.providerName,
        response.status,
      );
    }

    const parsed = responseSchema.safeParse(await response.json().catch(() => null));
    if (!parsed.success) {
      throw new AssistantProviderError(
        "invalid_response",
        "malformed_response",
        "The assistant provider returned invalid data.",
        this.providerName,
      );
    }
    const choice = parsed.data.choices[0]!;
    if (choice.finish_reason === "content_filter") {
      throw new AssistantProviderError(
        "blocked",
        "content_filtered",
        "The assistant response was blocked.",
        this.providerName,
      );
    }

    return {
      model: parsed.data.model,
      message: {
        role: "assistant",
        content: choice.message.content,
        ...(choice.message.tool_calls ? { tool_calls: choice.message.tool_calls } : {}),
      },
      finishReason: choice.finish_reason,
      ...(parsed.data.usage
        ? {
            usage: {
              promptTokens: parsed.data.usage.prompt_tokens,
              completionTokens: parsed.data.usage.completion_tokens,
            },
          }
        : {}),
    };
  }
}
