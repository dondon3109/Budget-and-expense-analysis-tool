import { describe, expect, it, vi } from "vitest";

import { createAssistantOrchestrator } from "../src/assistant/orchestrator";
import { buildAssistantSystemPrompt } from "../src/assistant/prompt";
import type { ProviderCompletionRequest } from "../src/assistant/provider";
import {
  STUB_ASSISTANT_MODEL,
  STUB_ASSISTANT_PROVIDER,
  createAssistantStubProvider,
  isAssistantStubEnabled,
} from "../src/assistant/stub";
import { assistantToolDefinitions } from "../src/assistant/tools";
import type { AssistantTurnPolicy } from "../src/assistant/turn-policy";
import { createProviderRegistry } from "../src/provider-registry";
import type { Bindings } from "../src/types";

const env = { DB: {} as D1Database } as Bindings;

const policy: AssistantTurnPolicy = {
  currentDate: "2026-09-03",
  timeZone: "Asia/Manila",
  compliance: { posture: "budgeting_allowed", topics: [] },
  resolvedPeriod: { from: "2026-09-01", to: "2026-09-03" },
  requiredToolGroups: ["period_summary"],
};

const identity = {
  assistantName: "Pigoy",
  userPreferredName: "Don",
  responseDetail: "concise" as const,
  coachingStyle: "gentle" as const,
};

const toolResult = {
  data: { expenses: "PHP 1,234.56" },
  source: {
    sourceType: "transactions",
    period: { from: "2026-09-01", to: "2026-09-03" },
    recordCount: 3,
  },
  dataQuality: { status: "reliable", signals: [] },
};

function systemPrompt(turnPolicy: AssistantTurnPolicy): string {
  return buildAssistantSystemPrompt(
    turnPolicy.currentDate,
    turnPolicy.timeZone,
    identity,
    turnPolicy,
    "",
  );
}

function createRegistry() {
  const repository = { getActive: vi.fn(async () => null), list: vi.fn(async () => []) };
  const credentials = { getEncryptedById: vi.fn(async () => null) };
  return {
    repository,
    registry: createProviderRegistry(repository as never, credentials as never),
  };
}

describe("assistant stub provider selection", () => {
  it("selects the stub when ASSISTANT_PROVIDER=stub without a D1 lookup", async () => {
    const { registry, repository } = createRegistry();
    const { provider, config, credential } = await registry.getAssistantProvider({
      ...env,
      ASSISTANT_PROVIDER: "stub",
    });

    expect(provider.providerName).toBe(STUB_ASSISTANT_PROVIDER);
    expect(config).toBeNull();
    expect(credential).toBeNull();
    expect(repository.getActive).not.toHaveBeenCalled();
  });

  it("resolves the configured provider when the flag is absent or different", async () => {
    for (const value of [undefined, "deepseek", "true", "on"]) {
      const { registry, repository } = createRegistry();
      const { provider, config } = await registry.getAssistantProvider({
        ...env,
        ...(value === undefined ? {} : { ASSISTANT_PROVIDER: value }),
      } as unknown as Bindings);

      expect(provider.providerName).toBe("deepseek");
      expect(config?.id).toBe("env-fallback-assistant");
      expect(repository.getActive).toHaveBeenCalledWith(expect.anything(), "assistant");
    }
  });

  it("never activates in production even with the flag set", async () => {
    const productionEnv = {
      ...env,
      ASSISTANT_PROVIDER: "stub",
      POSTHOG_AI_ENVIRONMENT: "production",
    };

    expect(isAssistantStubEnabled(productionEnv)).toBe(false);
    const { registry } = createRegistry();
    const { provider } = await registry.getAssistantProvider(productionEnv);
    expect(provider.providerName).toBe("deepseek");
  });
});

describe("assistant stub provider health", () => {
  it("reports the stub for the assistant service when the flag is set", async () => {
    const { registry, repository } = createRegistry();
    const health = await registry.getHealth({ ...env, ASSISTANT_PROVIDER: "stub" });

    const assistant = health.find((entry) => entry.service === "assistant");
    expect(assistant).toMatchObject({
      provider: STUB_ASSISTANT_PROVIDER,
      model: STUB_ASSISTANT_MODEL,
      configId: null,
      hasCredential: false,
      credentialName: null,
      apiKeyLast4: null,
      credentialSource: "none",
    });
    expect(assistant?.details).toContain("stub");
    expect(repository.getActive).not.toHaveBeenCalledWith(expect.anything(), "assistant");
    // Other services keep their own fallbacks.
    expect(health.find((entry) => entry.service === "stt")?.provider).toBe("cloudflare_workers_ai");
    expect(health.find((entry) => entry.service === "tts")?.provider).toBe("fish_audio");
  });

  it("reports the deepseek env fallback when the flag is absent", async () => {
    const { registry } = createRegistry();
    const health = await registry.getHealth(env);

    expect(health.find((entry) => entry.service === "assistant")).toMatchObject({
      provider: "deepseek",
      model: "deepseek-flash",
      configId: "env-fallback-assistant",
    });
  });

  it("never reports the stub in production", async () => {
    const { registry } = createRegistry();
    const health = await registry.getHealth({
      ...env,
      ASSISTANT_PROVIDER: "stub",
      POSTHOG_AI_ENVIRONMENT: "production",
    });

    expect(health.find((entry) => entry.service === "assistant")?.provider).toBe("deepseek");
  });
});

describe("assistant stub provider tool loop", () => {
  it("returns a tool call first and a final plain-text answer second", async () => {
    const provider = createAssistantStubProvider();
    const request: ProviderCompletionRequest = {
      messages: [
        { role: "system", content: systemPrompt(policy) },
        { role: "user", content: "How much did I spend this month?" },
      ],
      tools: assistantToolDefinitions,
    };

    const first = await provider.complete(env, request);
    expect(first.finishReason).toBe("tool_calls");
    expect(first.message.tool_calls).toHaveLength(1);
    const call = first.message.tool_calls![0]!;
    expect(call).toMatchObject({
      type: "function",
      function: { name: "get_period_summary" },
    });
    // The orchestrator rejects tool arguments that do not match the trusted policy.
    expect(JSON.parse(call.function.arguments)).toEqual({ from: "2026-09-01", to: "2026-09-03" });

    const second = await provider.complete(env, {
      ...request,
      toolChoice: "auto",
      messages: [
        ...request.messages,
        first.message,
        { role: "tool", tool_call_id: call.id, content: JSON.stringify(toolResult) },
      ],
    });

    expect(second.finishReason).toBe("stop");
    expect(second.message.tool_calls).toBeUndefined();
    expect(second.message.content).toContain("Offline assistant stub");
  });

  it("probes a no-argument read when the policy requires no tool group", async () => {
    const provider = createAssistantStubProvider();
    const completion = await provider.complete(env, {
      messages: [
        {
          role: "system",
          content: systemPrompt({ ...policy, requiredToolGroups: [] }),
        },
        { role: "user", content: "What is a budget?" },
      ],
      tools: assistantToolDefinitions,
    });

    expect(completion.finishReason).toBe("tool_calls");
    expect(completion.message.tool_calls?.[0]?.function.name).toBe("list_categories");
  });
});

describe("assistant stub provider through the orchestrator", () => {
  it("runs the tool loop and yields an answer that passes validation", async () => {
    const reader = { getPeriodSummary: vi.fn(async () => toolResult) };
    const orchestrator = createAssistantOrchestrator(
      createAssistantStubProvider(),
      reader as never,
    );

    const answer = await orchestrator.answer(
      env,
      "tenant-1",
      [],
      "How much did I spend this month?",
      identity,
      policy,
      "",
    );

    expect(reader.getPeriodSummary).toHaveBeenCalledWith(expect.anything(), {
      from: "2026-09-01",
      to: "2026-09-03",
    });
    expect(answer.finishReason).toBe("stop");
    expect(answer.model).toBe(STUB_ASSISTANT_MODEL);
    expect(answer.audit.providerCallCount).toBe(2);
    expect(answer.audit.validationStatus).toBe("passed");
    expect(answer.audit.toolCalls.map((call) => call.toolName)).toEqual(["get_period_summary"]);
    expect(answer.responseMetadata.sources).toHaveLength(1);
    expect(answer.content).toContain("Offline assistant stub");
  });
});
