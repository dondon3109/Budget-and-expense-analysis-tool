import type { Bindings } from "../types";

export interface AssistantToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export type AssistantProviderMessage =
  | { role: "system" | "user"; content: string }
  | {
      role: "assistant";
      content: string | null;
      tool_calls?: AssistantToolCall[];
    }
  | { role: "tool"; tool_call_id: string; content: string };

export interface AssistantToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ProviderCompletionRequest {
  messages: AssistantProviderMessage[];
  tools: AssistantToolDefinition[];
  signal?: AbortSignal;
}

export interface ProviderCompletion {
  model: string;
  message: Extract<AssistantProviderMessage, { role: "assistant" }>;
  finishReason: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
  };
}

export interface AssistantProvider {
  complete(env: Bindings, request: ProviderCompletionRequest): Promise<ProviderCompletion>;
}
