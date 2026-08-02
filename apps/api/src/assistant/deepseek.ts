import { z } from "zod";

import type { Bindings } from "../types";
import type { AssistantProvider, ProviderCompletion, ProviderCompletionRequest } from "./provider";

const DEEPSEEK_ENDPOINT = "https://api.deepseek.com/chat/completions";

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

export type DeepSeekErrorKind =
  "configuration" | "rate_limit" | "unavailable" | "timeout" | "invalid_response" | "blocked";

export type DeepSeekFailureReason =
  | "missing_api_key"
  | "credentials_rejected"
  | "rate_limited"
  | "upstream_unavailable"
  | "fetch_failed"
  | "timed_out"
  | "request_rejected"
  | "malformed_response"
  | "content_filtered";

export class DeepSeekError extends Error {
  constructor(
    readonly kind: DeepSeekErrorKind,
    readonly reason: DeepSeekFailureReason,
    message: string,
    readonly providerStatus?: number,
  ) {
    super(message);
    this.name = "DeepSeekError";
  }
}

function configuredNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export class DeepSeekProvider implements AssistantProvider {
  constructor(private readonly fetcher: typeof fetch = fetch) {}

  async complete(env: Bindings, request: ProviderCompletionRequest): Promise<ProviderCompletion> {
    const apiKey = env.DEEPSEEK_API_KEY?.trim();
    if (!apiKey) {
      throw new DeepSeekError(
        "configuration",
        "missing_api_key",
        "The assistant provider is not configured.",
      );
    }

    const timeoutMs = configuredNumber(env.ASSISTANT_PROVIDER_TIMEOUT_MS, 12_000);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort("provider_timeout"), timeoutMs);
    const abortFromParent = () => controller.abort(request.signal?.reason ?? "request_aborted");
    request.signal?.addEventListener("abort", abortFromParent, { once: true });

    const fetcher = this.fetcher;
    let response: Response;
    try {
      response = await fetcher(DEEPSEEK_ENDPOINT, {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: env.DEEPSEEK_MODEL?.trim() || "deepseek-v4-flash",
          messages: request.messages,
          tools: request.tools,
          tool_choice: request.toolChoice ?? "auto",
          thinking: { type: "disabled" },
          temperature: 0.15,
          max_tokens: 800,
          stream: false,
        }),
        signal: controller.signal,
      });
    } catch {
      if (controller.signal.aborted) {
        throw new DeepSeekError("timeout", "timed_out", "The assistant provider timed out.");
      }
      throw new DeepSeekError(
        "unavailable",
        "fetch_failed",
        "The assistant provider is unavailable.",
      );
    } finally {
      clearTimeout(timeout);
      request.signal?.removeEventListener("abort", abortFromParent);
    }

    if (!response.ok) {
      if (response.status === 429) {
        throw new DeepSeekError(
          "rate_limit",
          "rate_limited",
          "The assistant provider is temporarily rate limited.",
          response.status,
        );
      }
      if (response.status === 401 || response.status === 403) {
        throw new DeepSeekError(
          "configuration",
          "credentials_rejected",
          "The assistant provider rejected its credentials.",
          response.status,
        );
      }
      if (response.status >= 500) {
        throw new DeepSeekError(
          "unavailable",
          "upstream_unavailable",
          "The assistant provider is temporarily unavailable.",
          response.status,
        );
      }
      throw new DeepSeekError(
        "invalid_response",
        "request_rejected",
        "The assistant provider rejected the request.",
        response.status,
      );
    }

    const parsed = responseSchema.safeParse(await response.json().catch(() => null));
    if (!parsed.success) {
      throw new DeepSeekError(
        "invalid_response",
        "malformed_response",
        "The assistant provider returned invalid data.",
      );
    }
    const choice = parsed.data.choices[0]!;
    if (choice.finish_reason === "content_filter") {
      throw new DeepSeekError("blocked", "content_filtered", "The assistant response was blocked.");
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

export const deepSeekProvider = new DeepSeekProvider();
