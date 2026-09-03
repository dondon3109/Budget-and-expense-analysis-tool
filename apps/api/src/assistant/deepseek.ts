import type { Bindings } from "../types";
import { ChatCompletionsProvider } from "./chat-completions";
import type { AssistantProvider, ProviderCompletion, ProviderCompletionRequest } from "./provider";
import {
  AssistantProviderError,
  type AssistantProviderErrorKind,
  type AssistantProviderFailureReason,
} from "./provider-error";

const DEEPSEEK_ENDPOINT = "https://api.deepseek.com/chat/completions";

export type DeepSeekErrorKind = AssistantProviderErrorKind;
export type DeepSeekFailureReason = AssistantProviderFailureReason;

/**
 * Kept for backwards compatibility: new code should catch
 * {@link AssistantProviderError}. DeepSeek failures always carry
 * `provider: "deepseek"` so existing diagnostics keep reporting correctly.
 */
export class DeepSeekError extends AssistantProviderError {
  constructor(
    kind: DeepSeekErrorKind,
    reason: DeepSeekFailureReason,
    message: string,
    providerStatus?: number,
  ) {
    super(kind, reason, message, "deepseek", providerStatus);
    this.name = "DeepSeekError";
  }
}

function toDeepSeekError(error: unknown): never {
  if (error instanceof DeepSeekError) throw error;
  if (error instanceof AssistantProviderError) {
    throw new DeepSeekError(error.kind, error.reason, error.message, error.providerStatus);
  }
  throw error;
}

export class DeepSeekProvider implements AssistantProvider {
  readonly providerName = "deepseek";

  constructor(
    private readonly fetcher: typeof fetch = fetch,
    private readonly modelOverride?: string,
    private readonly apiKeyOverride?: string,
  ) {}

  async complete(env: Bindings, request: ProviderCompletionRequest): Promise<ProviderCompletion> {
    const delegate = new ChatCompletionsProvider(
      {
        provider: "deepseek",
        endpoint: DEEPSEEK_ENDPOINT,
        model: this.modelOverride?.trim() || env.DEEPSEEK_MODEL?.trim() || "deepseek-v4-flash",
        apiKey: this.apiKeyOverride?.trim() || env.DEEPSEEK_API_KEY?.trim(),
        extraBody: { thinking: { type: "disabled" } },
      },
      this.fetcher,
    );
    try {
      return await delegate.complete(env, request);
    } catch (error) {
      return toDeepSeekError(error);
    }
  }
}

export const deepSeekProvider = new DeepSeekProvider();

export function createDeepSeekProvider(
  model?: string,
  fetcher: typeof fetch = fetch,
  apiKey?: string,
): AssistantProvider {
  return new DeepSeekProvider(fetcher, model, apiKey);
}
