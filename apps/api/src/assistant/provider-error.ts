export type AssistantProviderErrorKind =
  "configuration" | "rate_limit" | "unavailable" | "timeout" | "invalid_response" | "blocked";

export type AssistantProviderFailureReason =
  | "missing_api_key"
  | "credentials_rejected"
  | "rate_limited"
  | "upstream_unavailable"
  | "fetch_failed"
  | "timed_out"
  | "request_rejected"
  | "malformed_response"
  | "content_filtered";

/**
 * Unified error for every assistant chat provider (DeepSeek, OpenAI,
 * Anthropic, Gemini, Meta, Muse Spark). Provider-specific classes extend this
 * so existing `instanceof DeepSeekError` handling keeps working while new
 * providers map to the same safe HTTP responses and diagnostics.
 */
export class AssistantProviderError extends Error {
  constructor(
    readonly kind: AssistantProviderErrorKind,
    readonly reason: AssistantProviderFailureReason,
    message: string,
    readonly provider: string = "deepseek",
    readonly providerStatus?: number,
  ) {
    super(message);
    this.name = "AssistantProviderError";
  }
}
