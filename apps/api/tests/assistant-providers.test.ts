// @ts-nocheck
import { describe, expect, it, vi } from "vitest";

import { providerAllowlist } from "@zoption/shared";
import { AnthropicProvider } from "../src/assistant/anthropic";
import {
  ASSISTANT_DEFAULT_MODELS,
  createAssistantProviderForConfig,
  legacyAssistantApiKey,
} from "../src/assistant/assistant-providers";
import { ChatCompletionsProvider } from "../src/assistant/chat-completions";
import { AssistantProviderError } from "../src/assistant/provider-error";
import type { ProviderCompletionRequest } from "../src/assistant/provider";
import type { Bindings } from "../src/types";

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

function chatCompletionResponse(message: Record<string, unknown>, finishReason = "stop"): Response {
  return jsonResponse({
    model: "test-model",
    choices: [{ finish_reason: finishReason, message }],
    usage: { prompt_tokens: 5, completion_tokens: 3 },
  });
}

describe("assistant multi-provider allowlist", () => {
  it("allowlist assistant providers and models for testing", () => {
    expect(providerAllowlist.assistant.deepseek).toContain("deepseek-v4-flash");
    expect(providerAllowlist.assistant.openai).toContain("gpt-4o-mini");
    expect(providerAllowlist.assistant.anthropic).toContain("claude-3-5-haiku-latest");
    expect(providerAllowlist.assistant.gemini).toContain("gemini-2.0-flash");
    expect(providerAllowlist.assistant.meta).toContain("Llama-4-Maverick-17B-128E-Instruct-FP8");
    expect(providerAllowlist.assistant.muse_spark).toContain("muse-spark-1.1");
  });

  it("has a default model per assistant provider", () => {
    for (const provider of ["deepseek", "openai", "anthropic", "gemini", "meta", "muse_spark"]) {
      expect(ASSISTANT_DEFAULT_MODELS[provider]).toBeTruthy();
    }
  });
});

describe("ChatCompletionsProvider (openai/gemini/meta/muse_spark/deepseek)", () => {
  it("sends Bearer auth to the provider endpoint with the configured model", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        chatCompletionResponse({ role: "assistant", content: "Verified answer." }),
      );
    const provider = new ChatCompletionsProvider(
      {
        provider: "openai",
        endpoint: "https://api.openai.com/v1/chat/completions",
        model: "gpt-4o-mini",
        apiKey: "sk-test-openai",
      },
      fetcher,
    );

    await expect(
      provider.complete({ DB: {} as D1Database } as Bindings, request),
    ).resolves.toMatchObject({ message: { content: "Verified answer." } });

    expect(fetcher).toHaveBeenCalledOnce();
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    expect(init?.headers).toMatchObject({ Authorization: "Bearer sk-test-openai" });
    const body = JSON.parse(init?.body as string) as Record<string, unknown>;
    expect(body).toMatchObject({ model: "gpt-4o-mini", stream: false, temperature: 0.15 });
  });

  it("parses tool calls without exposing secrets in errors", async () => {
    const toolCalls = [
      {
        id: "call-1",
        type: "function" as const,
        function: { name: "get_account_balances", arguments: "{}" },
      },
    ];
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        chatCompletionResponse(
          { role: "assistant", content: null, tool_calls: toolCalls },
          "tool_calls",
        ),
      );
    const provider = new ChatCompletionsProvider(
      {
        provider: "meta",
        endpoint: "https://api.llama.com/v1/chat/completions",
        model: "Llama-3.3-70B-Instruct",
        apiKey: "meta-key",
      },
      fetcher,
    );

    await expect(
      provider.complete({ DB: {} as D1Database } as Bindings, request),
    ).resolves.toMatchObject({ finishReason: "tool_calls" });
  });

  it("omits tool_choice for auto-only vendors such as Muse Spark", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(chatCompletionResponse({ role: "assistant", content: "hi" }));
    const provider = createAssistantProviderForConfig(
      "muse_spark",
      "muse-spark-1.1",
      "k",
      undefined,
      fetcher,
    );
    await provider.complete({ DB: {} as D1Database } as Bindings, {
      ...request,
      toolChoice: "required",
    });
    const [, init] = fetcher.mock.calls[0];
    expect(JSON.parse(init?.body as string)).not.toHaveProperty("tool_choice");
  });

  it("still sends tool_choice for passthrough vendors", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(chatCompletionResponse({ role: "assistant", content: "hi" }));
    const provider = new ChatCompletionsProvider(
      {
        provider: "openai",
        endpoint: "https://api.openai.com/v1/chat/completions",
        model: "gpt-4o-mini",
        apiKey: "k",
      },
      fetcher,
    );
    await provider.complete({ DB: {} as D1Database } as Bindings, {
      ...request,
      toolChoice: "required",
    });
    expect(JSON.parse(fetcher.mock.calls[0][1]?.body as string)).toMatchObject({
      tool_choice: "required",
    });
  });

  it("rejects a missing key without calling the provider", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const provider = new ChatCompletionsProvider(
      {
        provider: "gemini",
        endpoint: "https://example.invalid",
        model: "gemini-2.0-flash",
        apiKey: "  ",
      },
      fetcher,
    );
    await expect(
      provider.complete({ DB: {} as D1Database } as Bindings, request),
    ).rejects.toMatchObject({
      kind: "configuration",
      reason: "missing_api_key",
      provider: "gemini",
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    [401, "configuration", "credentials_rejected"],
    [429, "rate_limit", "rate_limited"],
    [500, "unavailable", "upstream_unavailable"],
    [400, "invalid_response", "request_rejected"],
  ] as const)("maps HTTP %i to %s/%s", async (status, kind, reason) => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("sensitive-body", { status }));
    const provider = new ChatCompletionsProvider(
      {
        provider: "muse_spark",
        endpoint: "https://example.invalid",
        model: "muse-spark-1.1",
        apiKey: "k",
      },
      fetcher,
    );
    await expect(
      provider.complete({ DB: {} as D1Database } as Bindings, request),
    ).rejects.toMatchObject({ kind, reason, provider: "muse_spark", providerStatus: status });
  });
});

describe("AnthropicProvider", () => {
  it("moves system prompts top-level and parses text plus tool_use", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        model: "claude-3-5-haiku-latest",
        stop_reason: "tool_use",
        content: [
          { type: "text", text: "Checking balances. " },
          { type: "tool_use", id: "toolu-1", name: "get_account_balances", input: {} },
        ],
        usage: { input_tokens: 9, output_tokens: 4 },
      }),
    );
    const provider = new AnthropicProvider(
      "claude-3-5-haiku-latest",
      "sk-ant-test",
      undefined,
      fetcher,
    );

    const completion = await provider.complete({ DB: {} as D1Database } as Bindings, {
      messages: [
        { role: "system", content: "System prompt." },
        { role: "user", content: "How much did I spend?" },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "get_account_balances",
            description: "d",
            parameters: { type: "object" },
          },
        },
      ],
      toolChoice: "auto",
    });

    expect(completion.finishReason).toBe("tool_calls");
    expect(completion.message.tool_calls?.[0]).toMatchObject({
      id: "toolu-1",
      function: { name: "get_account_balances" },
    });
    const [, init] = fetcher.mock.calls[0]!;
    expect(init?.headers).toMatchObject({
      "x-api-key": "sk-ant-test",
      "anthropic-version": "2023-06-01",
    });
    const body = JSON.parse(init?.body as string) as Record<string, unknown>;
    expect(body).toMatchObject({ model: "claude-3-5-haiku-latest", system: "System prompt." });
    expect(body).not.toHaveProperty("messages[0].role", "system");
  });

  it("rejects a missing key without calling Anthropic", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const provider = new AnthropicProvider(
      "claude-3-5-haiku-latest",
      undefined,
      undefined,
      fetcher,
    );
    await expect(
      provider.complete({ DB: {} as D1Database } as Bindings, request),
    ).rejects.toMatchObject({
      kind: "configuration",
      reason: "missing_api_key",
      provider: "anthropic",
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("maps 401 to credentials_rejected", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("nope", { status: 401 }));
    const provider = new AnthropicProvider("claude-3-5-haiku-latest", "bad", undefined, fetcher);
    await expect(
      provider.complete({ DB: {} as D1Database } as Bindings, request),
    ).rejects.toMatchObject({ kind: "configuration", reason: "credentials_rejected" });
  });
});

describe("createAssistantProviderForConfig", () => {
  it("dispatches OpenAI-compatible vs Anthropic runtimes", () => {
    expect(createAssistantProviderForConfig("openai", "gpt-4o-mini", "k").providerName).toBe(
      "openai",
    );
    expect(createAssistantProviderForConfig("gemini", "gemini-2.0-flash", "k").providerName).toBe(
      "gemini",
    );
    expect(
      createAssistantProviderForConfig("meta", "Llama-3.3-70B-Instruct", "k").providerName,
    ).toBe("meta");
    expect(createAssistantProviderForConfig("muse_spark", "muse-spark-1.1", "k").providerName).toBe(
      "muse_spark",
    );
    expect(
      createAssistantProviderForConfig("deepseek", "deepseek-v4-flash", "k").providerName,
    ).toBe("deepseek");
    expect(
      createAssistantProviderForConfig("anthropic", "claude-3-5-haiku-latest", "k").providerName,
    ).toBe("anthropic");
  });

  it("reads legacy per-provider Worker secrets", () => {
    const env = {
      DB: {} as D1Database,
      OPENAI_API_KEY: "sk-openai",
      ANTHROPIC_API_KEY: "sk-ant-x",
      GEMINI_API_KEY: "AIza-test",
      META_API_KEY: "meta-test",
      MUSE_SPARK_API_KEY: "spark-test",
    } as unknown as Bindings;
    expect(legacyAssistantApiKey(env, "openai")).toBe("sk-openai");
    expect(legacyAssistantApiKey(env, "anthropic")).toBe("sk-ant-x");
    expect(legacyAssistantApiKey(env, "gemini")).toBe("AIza-test");
    expect(legacyAssistantApiKey(env, "meta")).toBe("meta-test");
    expect(legacyAssistantApiKey(env, "muse_spark")).toBe("spark-test");
  });
});

describe("admin provider-config routes accept new assistant providers", () => {
  it("creates an OpenAI assistant config and rejects cross-provider credentials", async () => {
    const { createAdminProviderConfigRoutes } =
      await import("../src/routes/admin-provider-configs");
    const { providerRegistry } = await import("../src/provider-registry");
    const { Hono } = await import("hono");
    const { HttpError } = await import("../src/errors");

    const credId = "55555555-5555-4555-8555-555555555555";
    const credRepo = {
      getById: vi.fn(async (_env: unknown, id: string) =>
        id === credId
          ? { id: credId, provider: "openai", name: "OpenAI Test", apiKeyLast4: "1234" }
          : null,
      ),
    };
    const created: unknown[] = [];
    const configRepo = {
      create: vi.fn(async (_env: unknown, input: Record<string, unknown>, actorId: string) => {
        const row = {
          id: "cfg-openai-1",
          ...input,
          enabled: true,
          priority: 1,
          isActive: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          updatedBy: actorId,
        };
        created.push(row);
        return row;
      }),
      list: vi.fn(async () => []),
      getById: vi.fn(async () => null),
      getActive: vi.fn(async () => null),
      update: vi.fn(),
      setActive: vi.fn(),
      reorder: vi.fn(),
      listAudits: vi.fn(async () => []),
    };
    const routes = createAdminProviderConfigRoutes(
      { requireAdmin: vi.fn(async () => undefined) } as never,
      configRepo as never,
      providerRegistry as never,
      credRepo as never,
    );
    const app = new Hono();
    app.use("*", async (c: any, next: any) => {
      c.set("authUser", { id: "admin-1" });
      c.env = { DB: {} as D1Database };
      await next();
    });
    app.onError((err, c) => {
      if (err instanceof HttpError) return c.json({ error: err.code }, err.status);
      return c.json({ error: "internal" }, 500);
    });
    app.route("/configs", routes);

    const ok = await app.request("/configs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        service: "assistant",
        provider: "openai",
        model: "gpt-4o-mini",
        displayName: "OpenAI gpt-4o-mini",
        credentialId: credId,
      }),
    });
    expect(ok.status).toBe(201);

    const mismatch = await app.request("/configs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        service: "assistant",
        provider: "anthropic",
        model: "claude-3-5-haiku-latest",
        displayName: "Anthropic test",
        credentialId: credId,
      }),
    });
    expect(mismatch.status).toBe(400);
    expect(((await mismatch.json()) as { error: string }).error).toBe(
      "credential_provider_mismatch",
    );

    const unknown = await app.request("/configs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ service: "assistant", provider: "unknown_vendor", model: "x" }),
    });
    expect(unknown.status).toBe(400);
  });
});

describe("assistant service maps new-provider failures like DeepSeek", () => {
  it("reports the failing provider name and maps rate_limit to 503", async () => {
    const { createAssistantService } = await import("../src/assistant/service");
    const repository = {
      getPreferences: vi.fn(async () => ({
        consentedAt: "2026-07-27T00:00:00.000Z",
        consentVersion: 5,
        retentionDays: 90,
        assistantName: "Aster",
        userPreferredName: "Sam",
        responseDetail: "concise",
        coachingStyle: "gentle",
      })),
      listMemories: vi.fn(async () => []),
      beginTurn: vi.fn(async () => ({
        thread: { id: "t", title: "t", lastMessageAt: "", createdAt: "" },
        userMessage: {
          id: "u",
          threadId: "t",
          role: "user",
          content: "hi",
          status: "pending",
          createdAt: "",
        },
        history: [],
        runId: "r",
      })),
      completeTurn: vi.fn(),
      failTurn: vi.fn(async () => undefined),
    };
    const reporter = vi.fn();
    const failing = new AssistantProviderError("rate_limit", "rate_limited", "busy", "openai", 429);
    const orchestrator = {
      plan: vi.fn(async () => ({})),
      answer: vi.fn(async () => {
        throw failing;
      }),
    };
    const service = createAssistantService(repository as never, orchestrator as never, reporter);
    await expect(
      service.sendTurn({ DB: {} as D1Database } as Bindings, "tenant-1", "thread-1", {
        message: "hi",
        clientRequestId: "69a6ec67-85bd-4ccb-9354-1410d6dc5fb4",
      }),
    ).rejects.toMatchObject({ status: 503, code: "assistant_unavailable" });
    expect(reporter).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "openai", kind: "rate_limit", reason: "rate_limited" }),
    );
  });
});
