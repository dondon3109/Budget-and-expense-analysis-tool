import type { Bindings } from "../types";
import type { AssistantProvider, ProviderCompletion, ProviderCompletionRequest } from "./provider";
import { AssistantProviderError } from "./provider-error";

const POSTHOG_US_HOST = "https://us.i.posthog.com";
const POSTHOG_CAPTURE_TIMEOUT_MS = 2_000;
const MAX_GENERATION_EVENTS = 6;
const TELEMETRY_SCHEMA_VERSION = 1;

type AssistantAiOperation = "assistant_answer" | "assistant_memory_extraction";
type AssistantAiTurnOutcome =
  "completed" | "validation_fallback" | "provider_error" | "application_error";

interface PostHogEvent {
  event: "$ai_generation";
  properties: Record<string, unknown>;
  timestamp: string;
}

export interface AssistantAiTelemetry {
  complete(
    operation: AssistantAiOperation,
    provider: AssistantProvider,
    env: Bindings,
    request: ProviderCompletionRequest,
  ): Promise<ProviderCompletion>;
  finalize(outcome: AssistantAiTurnOutcome): void;
  flush(): Promise<void>;
}

export type AssistantAiTelemetryFactory = (env: Bindings) => AssistantAiTelemetry | undefined;

interface PostHogAiDependencies {
  captureTimeoutMs?: number;
  fetcher?: typeof fetch;
  now?: () => number;
  randomUuid?: () => string;
}

interface PostHogAiConfig {
  environment: string;
  host: string;
  projectToken: string;
}

function resolveConfig(env: Bindings): PostHogAiConfig | undefined {
  if (env.POSTHOG_AI_OBSERVABILITY_ENABLED !== "true") return undefined;

  const host = env.POSTHOG_HOST?.trim();
  const projectToken = env.POSTHOG_PROJECT_TOKEN?.trim();
  const environment = env.POSTHOG_AI_ENVIRONMENT?.trim();
  if (host !== POSTHOG_US_HOST || !projectToken || !environment) return undefined;

  return { environment, host, projectToken };
}

function errorProperties(error: unknown): Record<string, unknown> {
  if (error instanceof AssistantProviderError) {
    return {
      $ai_is_error: true,
      $ai_error: { kind: error.kind, reason: error.reason },
      ...(error.providerStatus === undefined ? {} : { $ai_http_status: error.providerStatus }),
    };
  }
  return {
    $ai_is_error: true,
    $ai_error: { kind: "unexpected", reason: "provider_call_failed" },
  };
}

export function createPostHogAiTelemetry(
  env: Bindings,
  dependencies: PostHogAiDependencies = {},
): AssistantAiTelemetry | undefined {
  const config = resolveConfig(env);
  if (!config) return undefined;

  const captureTimeoutMs = dependencies.captureTimeoutMs ?? POSTHOG_CAPTURE_TIMEOUT_MS;
  const fetcher = dependencies.fetcher ?? fetch;
  const now = dependencies.now ?? Date.now;
  const randomUuid = dependencies.randomUuid ?? crypto.randomUUID.bind(crypto);
  const traceId = randomUuid();
  const events: PostHogEvent[] = [];
  let outcome: AssistantAiTurnOutcome = "application_error";

  return {
    async complete(operation, provider, providerEnv, request) {
      const startedAt = now();
      const spanId = randomUuid();
      const sequence = events.length + 1;
      const providerName = provider.providerName ?? "deepseek";
      const baseProperties = {
        distinct_id: traceId,
        $process_person_profile: false,
        $geoip_disable: true,
        $ip: "0.0.0.0",
        $ai_trace_id: traceId,
        $ai_span_id: spanId,
        $ai_span_name: operation,
        $ai_provider: providerName,
        $ai_model: providerEnv.DEEPSEEK_MODEL?.trim() || "deepseek-v4-flash",
        $ai_stream: false,
        $ai_temperature: 0.15,
        $ai_max_tokens: 800,
        zoption_ai_schema_version: TELEMETRY_SCHEMA_VERSION,
        zoption_ai_environment: config.environment,
        zoption_ai_operation: operation,
        zoption_provider_call_sequence: sequence,
        zoption_tool_choice: request.toolChoice ?? "auto",
      };

      try {
        const completion = await provider.complete(providerEnv, request);
        if (events.length < MAX_GENERATION_EVENTS) {
          events.push({
            event: "$ai_generation",
            timestamp: new Date(startedAt).toISOString(),
            properties: {
              ...baseProperties,
              $ai_model: completion.model,
              $ai_latency: Math.max(0, now() - startedAt) / 1_000,
              $ai_http_status: 200,
              $ai_is_error: false,
              $ai_stop_reason: completion.finishReason,
              ...(completion.usage?.promptTokens === undefined
                ? {}
                : { $ai_input_tokens: completion.usage.promptTokens }),
              ...(completion.usage?.completionTokens === undefined
                ? {}
                : { $ai_output_tokens: completion.usage.completionTokens }),
            },
          });
        }
        return completion;
      } catch (error) {
        if (events.length < MAX_GENERATION_EVENTS) {
          events.push({
            event: "$ai_generation",
            timestamp: new Date(startedAt).toISOString(),
            properties: {
              ...baseProperties,
              $ai_latency: Math.max(0, now() - startedAt) / 1_000,
              ...errorProperties(error),
            },
          });
        }
        throw error;
      }
    },

    finalize(nextOutcome) {
      outcome = nextOutcome;
    },

    async flush() {
      if (events.length === 0) return;

      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort("posthog_capture_timeout"),
        captureTimeoutMs,
      );
      try {
        await fetcher(`${config.host}/batch/`, {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            api_key: config.projectToken,
            batch: events.map((event) => ({
              ...event,
              properties: {
                ...event.properties,
                zoption_turn_outcome: outcome,
                zoption_trace_generation_count: events.length,
              },
            })),
          }),
          signal: controller.signal,
        });
      } catch {
        // AI observability is best-effort and must never alter an assistant response.
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}
