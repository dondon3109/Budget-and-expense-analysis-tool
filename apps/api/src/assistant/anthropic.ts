import { z } from "zod";

import type { Bindings } from "../types";
import type {
  AssistantProvider,
  AssistantProviderMessage,
  AssistantToolDefinition,
  ProviderCompletion,
  ProviderCompletionRequest,
} from "./provider";
import { AssistantProviderError } from "./provider-error";

const ANTHROPIC_VERSION = "2023-06-01";

const responseSchema = z.object({
  model: z.string().min(1),
  stop_reason: z.string().nullable().optional(),
  content: z.array(
    z.union([
      z.object({ type: z.literal("text"), text: z.string() }),
      z.object({
        type: z.literal("tool_use"),
        id: z.string().min(1),
        name: z.string().min(1),
        input: z.unknown().optional(),
      }),
    ]),
  ),
  usage: z
    .object({
      input_tokens: z.number().int().nonnegative().optional(),
      output_tokens: z.number().int().nonnegative().optional(),
    })
    .optional(),
});

type AnthropicContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string };

function toAnthropicTools(tools: AssistantToolDefinition[]) {
  return tools.map((tool) => ({
    name: tool.function.name,
    description: tool.function.description,
    input_schema: tool.function.parameters,
  }));
}

function toAnthropicToolChoice(choice: ProviderCompletionRequest["toolChoice"]) {
  if (choice === "required") return { type: "any" as const };
  if (choice === "none") return { type: "none" as const };
  return { type: "auto" as const };
}

function toAnthropicMessages(messages: AssistantProviderMessage[]): {
  system: string | undefined;
  messages: Array<{ role: "user" | "assistant"; content: string | AnthropicContentBlock[] }>;
} {
  const systemParts: string[] = [];
  const converted: Array<{
    role: "user" | "assistant";
    content: string | AnthropicContentBlock[];
  }> = [];
  const pendingToolResults = new Map<string, string>();

  for (const message of messages) {
    if (message.role === "tool") {
      // Internal `tool` role becomes an Anthropic `user` tool_result block.
      pendingToolResults.set(message.tool_call_id, message.content);
      continue;
    }
    if (message.role === "system") {
      systemParts.push(message.content);
      continue;
    }
    if (message.role === "user") {
      converted.push({ role: "user", content: message.content });
      continue;
    }
    if (message.role === "assistant") {
      const blocks: AnthropicContentBlock[] = [];
      if (message.content) blocks.push({ type: "text", text: message.content });
      for (const call of message.tool_calls ?? []) {
        let input: Record<string, unknown> = {};
        try {
          const parsed: unknown = JSON.parse(call.function.arguments);
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            input = parsed as Record<string, unknown>;
          }
        } catch {
          input = {};
        }
        blocks.push({ type: "tool_use", id: call.id, name: call.function.name, input });
      }
      converted.push({
        role: "assistant",
        content: blocks.length > 0 ? blocks : "",
      });
      continue;
    }
  }

  // Fold pending tool results into `user` messages appended after their assistant turn.
  // The orchestrator always appends tool messages directly after the assistant
  // message that requested them, so attaching them to the next user turn keeps
  // the Anthropic alternating-role invariant without reordering history.
  if (pendingToolResults.size > 0) {
    const results: AnthropicContentBlock[] = [...pendingToolResults].map(([id, content]) => ({
      type: "tool_result" as const,
      tool_use_id: id,
      content,
    }));
    const last = converted[converted.length - 1];
    if (last && last.role === "assistant") {
      converted.push({ role: "user", content: results });
    } else if (last && last.role === "user" && Array.isArray(last.content)) {
      last.content = [...last.content, ...results];
    } else if (last && last.role === "user") {
      converted.push({ role: "user", content: results });
    } else {
      converted.push({ role: "user", content: results });
    }
  }

  return {
    system: systemParts.length > 0 ? systemParts.join("\n\n") : undefined,
    messages: converted,
  };
}

function configuredNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Native Anthropic Messages API client. Unlike the OpenAI-compatible vendors,
 * Anthropic uses `x-api-key` auth, a top-level `system` prompt, and
 * `tool_use`/`tool_result` blocks, so the translation lives here instead of
 * in the shared chat-completions client.
 */
export class AnthropicProvider implements AssistantProvider {
  readonly providerName = "anthropic";

  constructor(
    private readonly model: string,
    private readonly apiKey: string | undefined,
    private readonly endpoint = "https://api.anthropic.com/v1/messages",
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async complete(env: Bindings, request: ProviderCompletionRequest): Promise<ProviderCompletion> {
    const key = this.apiKey?.trim();
    if (!key) {
      throw new AssistantProviderError(
        "configuration",
        "missing_api_key",
        "The assistant provider is not configured.",
        this.providerName,
      );
    }

    const { system, messages } = toAnthropicMessages(request.messages);
    const timeoutMs = configuredNumber(env.ASSISTANT_PROVIDER_TIMEOUT_MS, 12_000);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort("provider_timeout"), timeoutMs);
    const abortFromParent = () => controller.abort(request.signal?.reason ?? "request_aborted");
    request.signal?.addEventListener("abort", abortFromParent, { once: true });

    let response: Response;
    try {
      response = await this.fetcher(this.endpoint, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "x-api-key": key,
          "anthropic-version": ANTHROPIC_VERSION,
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 800,
          temperature: 0.15,
          ...(system ? { system } : {}),
          messages,
          tools: toAnthropicTools(request.tools),
          tool_choice: toAnthropicToolChoice(request.toolChoice),
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
      if (response.status === 429) {
        throw new AssistantProviderError(
          "rate_limit",
          "rate_limited",
          "The assistant provider is temporarily rate limited.",
          this.providerName,
          response.status,
        );
      }
      if (response.status === 401 || response.status === 403) {
        throw new AssistantProviderError(
          "configuration",
          "credentials_rejected",
          "The assistant provider rejected its credentials.",
          this.providerName,
          response.status,
        );
      }
      if (response.status >= 500) {
        throw new AssistantProviderError(
          "unavailable",
          "upstream_unavailable",
          "The assistant provider is temporarily unavailable.",
          this.providerName,
          response.status,
        );
      }
      throw new AssistantProviderError(
        "invalid_response",
        "request_rejected",
        "The assistant provider rejected the request.",
        this.providerName,
        response.status,
      );
    }

    const parsed = responseSchema.safeParse(await response.json().catch(() => null));
    if (!parsed.success || parsed.data.content.length === 0) {
      throw new AssistantProviderError(
        "invalid_response",
        "malformed_response",
        "The assistant provider returned invalid data.",
        this.providerName,
      );
    }

    const stopReason = parsed.data.stop_reason ?? "end_turn";
    if (stopReason === "refusal") {
      throw new AssistantProviderError(
        "blocked",
        "content_filtered",
        "The assistant response was blocked.",
        this.providerName,
      );
    }

    const textParts: string[] = [];
    const toolCalls: ProviderCompletion["message"]["tool_calls"] = [];
    for (const block of parsed.data.content) {
      if (block.type === "text") textParts.push(block.text);
      else if (block.type === "tool_use") {
        toolCalls.push({
          id: block.id,
          type: "function",
          function: { name: block.name, arguments: JSON.stringify(block.input ?? {}) },
        });
      }
    }

    return {
      model: parsed.data.model,
      message: {
        role: "assistant",
        content: textParts.length > 0 ? textParts.join("") : null,
        ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
      },
      finishReason: stopReason === "tool_use" ? "tool_calls" : stopReason,
      ...(parsed.data.usage
        ? {
            usage: {
              promptTokens: parsed.data.usage.input_tokens,
              completionTokens: parsed.data.usage.output_tokens,
            },
          }
        : {}),
    };
  }
}

export function createAnthropicProvider(
  model: string,
  apiKey?: string,
  endpoint?: string,
  fetcher: typeof fetch = fetch,
): AssistantProvider {
  return new AnthropicProvider(model, apiKey, endpoint, fetcher);
}
