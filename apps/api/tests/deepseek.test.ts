import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DeepSeekError,
  DeepSeekProvider,
  type DeepSeekErrorKind,
  type DeepSeekFailureReason,
} from "../src/assistant/deepseek";
import type { ProviderCompletionRequest } from "../src/assistant/provider";
import type { Bindings } from "../src/types";

const env = {
  DB: {} as D1Database,
  DEEPSEEK_API_KEY: "test-key",
  DEEPSEEK_MODEL: "deepseek-v4-flash",
} satisfies Bindings;

const request: ProviderCompletionRequest = {
  messages: [{ role: "user", content: "Hello" }],
  tools: [],
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function completionResponse(
  message: {
    role: "assistant";
    content: string | null;
    reasoning_content?: string;
    tool_calls?: Array<{
      id: string;
      type: "function";
      function: { name: string; arguments: string };
    }>;
  },
  finishReason = "stop",
): Response {
  return jsonResponse({
    model: "deepseek-v4-flash",
    choices: [{ finish_reason: finishReason, message }],
    usage: { prompt_tokens: 12, completion_tokens: 4 },
  });
}

async function expectProviderError(
  promise: Promise<unknown>,
  expected: {
    kind: DeepSeekErrorKind;
    reason: DeepSeekFailureReason;
    providerStatus?: number;
  },
): Promise<DeepSeekError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(DeepSeekError);
    expect(error).toMatchObject(expected);
    return error as DeepSeekError;
  }
  throw new Error("Expected the provider to fail.");
}

afterEach(() => {
  vi.useRealTimers();
});

describe("DeepSeekProvider", () => {
  it("rejects a missing key without calling the provider", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const provider = new DeepSeekProvider(fetcher);

    await expectProviderError(provider.complete({ DB: env.DB }, request), {
      kind: "configuration",
      reason: "missing_api_key",
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("calls fetch without binding the provider as its receiver", async () => {
    const fetcher: typeof fetch = function (this: unknown) {
      expect(this).toBeUndefined();
      return Promise.resolve(
        completionResponse({ role: "assistant", content: "Verified answer." }),
      );
    };
    const provider = new DeepSeekProvider(fetcher);

    await expect(provider.complete(env, request)).resolves.toMatchObject({
      message: { content: "Verified answer." },
    });
  });

  it.each([
    [401, "configuration", "credentials_rejected"],
    [403, "configuration", "credentials_rejected"],
    [429, "rate_limit", "rate_limited"],
    [500, "unavailable", "upstream_unavailable"],
    [503, "unavailable", "upstream_unavailable"],
    [400, "invalid_response", "request_rejected"],
  ] as const)(
    "classifies provider HTTP %i without reading its body",
    async (status, kind, reason) => {
      const response = new Response("sensitive-provider-body", { status });
      const jsonSpy = vi.spyOn(response, "json");
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response);
      const provider = new DeepSeekProvider(fetcher);

      await expectProviderError(provider.complete(env, request), {
        kind,
        reason,
        providerStatus: status,
      });
      expect(jsonSpy).not.toHaveBeenCalled();
    },
  );

  it("does not retain rejected fetch details", async () => {
    const sensitive = "sk-secret prompt tenant-123 account balance 9000";
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error(sensitive));
    const provider = new DeepSeekProvider(fetcher);

    const error = await expectProviderError(provider.complete(env, request), {
      kind: "unavailable",
      reason: "fetch_failed",
    });
    expect(JSON.stringify(error)).not.toContain(sensitive);
    expect(error.message).not.toContain(sensitive);
  });

  it("classifies an aborted provider request as a timeout", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>().mockImplementation(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
        }),
    );
    const provider = new DeepSeekProvider(fetcher);
    const result = expectProviderError(
      provider.complete({ ...env, ASSISTANT_PROVIDER_TIMEOUT_MS: "10" }, request),
      { kind: "timeout", reason: "timed_out" },
    );

    await vi.advanceTimersByTimeAsync(10);
    await result;
  });

  it.each([
    ["invalid JSON", new Response("not-json", { status: 200 })],
    ["an invalid schema", jsonResponse({ choices: [] })],
  ])("classifies %s as a malformed response", async (_label, response) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response);
    const provider = new DeepSeekProvider(fetcher);

    await expectProviderError(provider.complete(env, request), {
      kind: "invalid_response",
      reason: "malformed_response",
    });
  });

  it("classifies content filtering without exposing response content", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        completionResponse(
          { role: "assistant", content: "sensitive blocked content" },
          "content_filter",
        ),
      );
    const provider = new DeepSeekProvider(fetcher);

    const error = await expectProviderError(provider.complete(env, request), {
      kind: "blocked",
      reason: "content_filtered",
    });
    expect(error.message).not.toContain("sensitive blocked content");
  });

  it("parses a successful text completion", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(completionResponse({ role: "assistant", content: "Verified answer." }));
    const provider = new DeepSeekProvider(fetcher);

    await expect(provider.complete(env, request)).resolves.toEqual({
      model: "deepseek-v4-flash",
      message: { role: "assistant", content: "Verified answer." },
      finishReason: "stop",
      usage: { promptTokens: 12, completionTokens: 4 },
    });
    const requestBody = fetcher.mock.calls[0]?.[1]?.body;
    expect(typeof requestBody).toBe("string");
    if (typeof requestBody !== "string") throw new Error("Expected a JSON request body.");
    expect(JSON.parse(requestBody)).toMatchObject({
      model: "deepseek-v4-flash",
      messages: request.messages,
      tools: request.tools,
      tool_choice: "auto",
      thinking: { type: "disabled" },
      max_tokens: 800,
      stream: false,
    });
  });

  it("parses a successful tool call", async () => {
    const toolCalls = [
      {
        id: "call-1",
        type: "function" as const,
        function: { name: "get_account_balances", arguments: "{}" },
      },
    ];
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      completionResponse(
        {
          role: "assistant",
          content: null,
          reasoning_content: "hidden provider reasoning",
          tool_calls: toolCalls,
        },
        "tool_calls",
      ),
    );
    const provider = new DeepSeekProvider(fetcher);

    await expect(provider.complete(env, request)).resolves.toEqual({
      model: "deepseek-v4-flash",
      message: { role: "assistant", content: null, tool_calls: toolCalls },
      finishReason: "tool_calls",
      usage: { promptTokens: 12, completionTokens: 4 },
    });
  });
});
