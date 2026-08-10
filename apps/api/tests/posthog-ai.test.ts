import { describe, expect, it, vi } from "vitest";

import { DeepSeekError } from "../src/assistant/deepseek";
import { createPostHogAiTelemetry } from "../src/assistant/posthog-ai";
import type { AssistantProvider, ProviderCompletionRequest } from "../src/assistant/provider";
import type { Bindings } from "../src/types";

const env = {
  DB: {} as D1Database,
  DEEPSEEK_MODEL: "deepseek-v4-flash",
  POSTHOG_AI_OBSERVABILITY_ENABLED: "true",
  POSTHOG_HOST: "https://us.i.posthog.com",
  POSTHOG_PROJECT_TOKEN: "phc_test-project-token",
  POSTHOG_AI_ENVIRONMENT: "preview",
} satisfies Bindings;

const sensitivePrompt = "My account balance is 9000 and tenant-sensitive-id owns it.";
const sensitiveAnswer = "Your verified account balance is 9000.";
const request: ProviderCompletionRequest = {
  messages: [{ role: "user", content: sensitivePrompt }],
  tools: [
    {
      type: "function",
      function: {
        name: "get_account_balances",
        description: "Sensitive tool definition",
        parameters: { account: "private-account" },
      },
    },
  ],
  toolChoice: "required",
};

function successfulProvider(): AssistantProvider {
  return {
    complete: vi.fn(async () => ({
      model: "deepseek-v4-flash",
      message: { role: "assistant" as const, content: sensitiveAnswer },
      finishReason: "stop",
      usage: { promptTokens: 42, completionTokens: 17 },
    })),
  };
}

function parseCapture(fetcher: ReturnType<typeof vi.fn<typeof fetch>>) {
  expect(fetcher).toHaveBeenCalledOnce();
  const [url, init] = fetcher.mock.calls[0]!;
  expect(url).toBe("https://us.i.posthog.com/batch/");
  expect(init).toMatchObject({ method: "POST" });
  if (typeof init?.body !== "string") throw new Error("Expected a JSON request body.");
  return JSON.parse(init.body) as {
    api_key: string;
    batch: Array<{
      event: string;
      timestamp: string;
      properties: Record<string, unknown>;
    }>;
  };
}

describe("PostHog AI Observability", () => {
  it("stays disabled unless the optional configuration is complete and approved", () => {
    expect(createPostHogAiTelemetry({ DB: env.DB })).toBeUndefined();
    expect(
      createPostHogAiTelemetry({
        ...env,
        POSTHOG_PROJECT_TOKEN: undefined,
      }),
    ).toBeUndefined();
    expect(
      createPostHogAiTelemetry({
        ...env,
        POSTHOG_HOST: "https://eu.i.posthog.com",
      }),
    ).toBeUndefined();
  });

  it("captures metadata-only generation fields in one anonymous batch", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(null, { status: 200 }));
    const times = [1_000, 2_500];
    const uuids = ["trace-uuid", "span-uuid"];
    const telemetry = createPostHogAiTelemetry(env, {
      fetcher,
      now: () => times.shift() ?? 2_500,
      randomUuid: () => uuids.shift() ?? "unexpected-uuid",
    });
    if (!telemetry) throw new Error("Expected enabled PostHog telemetry.");

    await expect(
      telemetry.complete("assistant_answer", successfulProvider(), env, request),
    ).resolves.toMatchObject({ finishReason: "stop" });
    telemetry.finalize("completed");
    await telemetry.flush();

    const capture = parseCapture(fetcher);
    expect(capture.api_key).toBe(env.POSTHOG_PROJECT_TOKEN);
    expect(capture.batch).toHaveLength(1);
    expect(capture.batch[0]).toMatchObject({
      event: "$ai_generation",
      timestamp: "1970-01-01T00:00:01.000Z",
    });

    const properties = capture.batch[0]!.properties;
    expect(properties).toEqual(
      expect.objectContaining({
        distinct_id: "trace-uuid",
        $process_person_profile: false,
        $geoip_disable: true,
        $ip: "0.0.0.0",
        $ai_trace_id: "trace-uuid",
        $ai_span_id: "span-uuid",
        $ai_span_name: "assistant_answer",
        $ai_provider: "deepseek",
        $ai_model: "deepseek-v4-flash",
        $ai_input_tokens: 42,
        $ai_output_tokens: 17,
        $ai_latency: 1.5,
        $ai_http_status: 200,
        $ai_is_error: false,
        $ai_stop_reason: "stop",
        $ai_stream: false,
        $ai_temperature: 0.15,
        $ai_max_tokens: 800,
        zoption_ai_schema_version: 1,
        zoption_ai_environment: "preview",
        zoption_ai_operation: "assistant_answer",
        zoption_provider_call_sequence: 1,
        zoption_tool_choice: "required",
        zoption_turn_outcome: "completed",
        zoption_trace_generation_count: 1,
      }),
    );
    expect(properties).not.toHaveProperty("$ai_input");
    expect(properties).not.toHaveProperty("$ai_output");
    expect(properties).not.toHaveProperty("$ai_output_choices");
    expect(properties).not.toHaveProperty("$ai_tools");
    expect(properties).not.toHaveProperty("$ai_input_state");
    expect(properties).not.toHaveProperty("$ai_output_state");
    const serialized = JSON.stringify(capture.batch);
    for (const forbidden of [
      sensitivePrompt,
      sensitiveAnswer,
      "get_account_balances",
      "private-account",
      "tenant-sensitive-id",
      "phc_test-project-token",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("groups multiple provider calls under one trace with unique generation spans", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(null, { status: 200 }));
    const times = [1_000, 1_100, 2_000, 2_400];
    const uuids = ["shared-trace", "answer-span", "memory-span"];
    const telemetry = createPostHogAiTelemetry(env, {
      fetcher,
      now: () => times.shift() ?? 2_400,
      randomUuid: () => uuids.shift() ?? "unexpected-uuid",
    });
    if (!telemetry) throw new Error("Expected enabled PostHog telemetry.");

    const provider = successfulProvider();
    await telemetry.complete("assistant_answer", provider, env, request);
    await telemetry.complete("assistant_memory_extraction", provider, env, {
      messages: [{ role: "user", content: "Another sensitive memory input" }],
      tools: [],
      toolChoice: "none",
    });
    telemetry.finalize("completed");
    await telemetry.flush();

    const events = parseCapture(fetcher).batch;
    expect(events).toHaveLength(2);
    expect(events.map((event) => event.properties.$ai_trace_id)).toEqual([
      "shared-trace",
      "shared-trace",
    ]);
    expect(events.map((event) => event.properties.$ai_span_id)).toEqual([
      "answer-span",
      "memory-span",
    ]);
    expect(events.map((event) => event.properties.zoption_ai_operation)).toEqual([
      "assistant_answer",
      "assistant_memory_extraction",
    ]);
    expect(events.map((event) => event.properties.zoption_provider_call_sequence)).toEqual([1, 2]);
    expect(events.map((event) => event.properties.zoption_trace_generation_count)).toEqual([2, 2]);
    expect(JSON.stringify(events)).not.toContain("Another sensitive memory input");
  });

  it("captures only stable provider error categories and known status", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(null, { status: 200 }));
    const telemetry = createPostHogAiTelemetry(env, {
      fetcher,
      now: (() => {
        const values = [10_000, 10_250];
        return () => values.shift() ?? 10_250;
      })(),
      randomUuid: (() => {
        const values = ["error-trace", "error-span"];
        return () => values.shift() ?? "unexpected-uuid";
      })(),
    });
    if (!telemetry) throw new Error("Expected enabled PostHog telemetry.");
    const provider: AssistantProvider = {
      complete: vi.fn(async () => {
        throw new DeepSeekError(
          "rate_limit",
          "rate_limited",
          "Sensitive upstream body and credentials",
          429,
        );
      }),
    };

    await expect(
      telemetry.complete("assistant_answer", provider, env, request),
    ).rejects.toBeInstanceOf(DeepSeekError);
    telemetry.finalize("provider_error");
    await telemetry.flush();

    const properties = parseCapture(fetcher).batch[0]!.properties;
    expect(properties).toMatchObject({
      $ai_is_error: true,
      $ai_error: { kind: "rate_limit", reason: "rate_limited" },
      $ai_http_status: 429,
      $ai_latency: 0.25,
      zoption_turn_outcome: "provider_error",
    });
    expect(JSON.stringify(properties)).not.toContain("Sensitive upstream body");
  });

  it("caps a trace at six generation events without blocking provider calls", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(null, { status: 200 }));
    const provider = successfulProvider();
    let clock = 1_000;
    let uuidSequence = 0;
    const telemetry = createPostHogAiTelemetry(env, {
      fetcher,
      now: () => {
        clock += 100;
        return clock;
      },
      randomUuid: () => `uuid-${uuidSequence++}`,
    });
    if (!telemetry) throw new Error("Expected enabled PostHog telemetry.");

    for (let call = 0; call < 7; call += 1) {
      await telemetry.complete("assistant_answer", provider, env, request);
    }
    telemetry.finalize("completed");
    await telemetry.flush();

    expect(provider.complete).toHaveBeenCalledTimes(7);
    const events = parseCapture(fetcher).batch;
    expect(events).toHaveLength(6);
    expect(events.map((event) => event.properties.zoption_provider_call_sequence)).toEqual([
      1, 2, 3, 4, 5, 6,
    ]);
    expect(events.every((event) => event.properties.zoption_trace_generation_count === 6)).toBe(
      true,
    );
  });

  it("bounds a stalled PostHog capture and resolves after aborting it", async () => {
    const fetcher = vi.fn<typeof fetch>(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), {
            once: true,
          });
        }),
    );
    const telemetry = createPostHogAiTelemetry(env, {
      captureTimeoutMs: 1,
      fetcher,
      now: () => 1_000,
      randomUuid: () => crypto.randomUUID(),
    });
    if (!telemetry) throw new Error("Expected enabled PostHog telemetry.");

    await telemetry.complete("assistant_answer", successfulProvider(), env, request);
    await expect(telemetry.flush()).resolves.toBeUndefined();

    const [, init] = fetcher.mock.calls[0]!;
    expect(init?.signal?.aborted).toBe(true);
  });

  it("never propagates PostHog capture failures", async () => {
    const telemetry = createPostHogAiTelemetry(env, {
      fetcher: vi.fn<typeof fetch>(async () => {
        throw new Error("PostHog unavailable");
      }),
      now: () => 1_000,
      randomUuid: () => crypto.randomUUID(),
    });
    if (!telemetry) throw new Error("Expected enabled PostHog telemetry.");

    await telemetry.complete("assistant_answer", successfulProvider(), env, request);
    await expect(telemetry.flush()).resolves.toBeUndefined();
  });
});
