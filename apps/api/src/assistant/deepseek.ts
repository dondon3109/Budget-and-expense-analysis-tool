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

export class DeepSeekError extends Error {
  constructor(
    readonly kind: DeepSeekErrorKind,
    message: string,
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
      throw new DeepSeekError("configuration", "The assistant provider is not configured.");
    }

    const timeoutMs = configuredNumber(env.ASSISTANT_PROVIDER_TIMEOUT_MS, 12_000);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort("provider_timeout"), timeoutMs);
    const abortFromParent = () => controller.abort(request.signal?.reason ?? "request_aborted");
    request.signal?.addEventListener("abort", abortFromParent, { once: true });

    let response: Response;
    try {
      response = await this.fetcher(DEEPSEEK_ENDPOINT, {
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
          tool_choice: "auto",
          temperature: 0.15,
          max_tokens: 420,
          stream: false,
        }),
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted) {
        throw new DeepSeekError("timeout", "The assistant provider timed out.");
      }
      throw new DeepSeekError(
        "unavailable",
        error instanceof Error ? error.message : "The assistant provider is unavailable.",
      );
    } finally {
      clearTimeout(timeout);
      request.signal?.removeEventListener("abort", abortFromParent);
    }

    if (!response.ok) {
      if (response.status === 429) {
        throw new DeepSeekError(
          "rate_limit",
          "The assistant provider is temporarily rate limited.",
        );
      }
      if (response.status === 401 || response.status === 403) {
        throw new DeepSeekError(
          "configuration",
          "The assistant provider rejected its credentials.",
        );
      }
      if (response.status >= 500) {
        throw new DeepSeekError(
          "unavailable",
          "The assistant provider is temporarily unavailable.",
        );
      }
      throw new DeepSeekError("invalid_response", "The assistant provider rejected the request.");
    }

    const parsed = responseSchema.safeParse(await response.json().catch(() => null));
    if (!parsed.success) {
      throw new DeepSeekError("invalid_response", "The assistant provider returned invalid data.");
    }
    const choice = parsed.data.choices[0]!;
    if (choice.finish_reason === "content_filter") {
      throw new DeepSeekError("blocked", "The assistant response was blocked.");
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
