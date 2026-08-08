import type {
  AssistantMemory,
  AssistantMessage,
  AssistantMessageInput,
  AssistantPreferences,
  AssistantThread,
  AssistantTurnResult,
} from "@zoption/shared";
import { describe, expect, it, vi } from "vitest";

import {
  DeepSeekError,
  type DeepSeekErrorKind,
  type DeepSeekFailureReason,
} from "../src/assistant/deepseek";
import type { AssistantOrchestrator } from "../src/assistant/orchestrator";
import type { AssistantProvider } from "../src/assistant/provider";
import { createAssistantService, type AssistantDiagnosticReporter } from "../src/assistant/service";
import type {
  AssistantCompletedTurn,
  AssistantRepository,
  AssistantTurnStart,
} from "../src/db/assistant";
import type { AssistantModelMemoryUsageRepository } from "../src/db/assistant-model-memory-usage";
import type { HttpError } from "../src/errors";
import type { Bindings } from "../src/types";

const env = { DB: {} as D1Database } satisfies Bindings;
const tenantId = "tenant-sensitive-id";
const threadId = "thread-sensitive-id";
const input: AssistantMessageInput = {
  message: "Sensitive prompt about an account balance",
  clientRequestId: "69a6ec67-85bd-4ccb-9354-1410d6dc5fb4",
};
const preferences: AssistantPreferences = {
  consentedAt: "2026-07-27T00:00:00.000Z",
  consentVersion: 3,
  retentionDays: 90,
  assistantName: "Aster",
  userPreferredName: "Sam",
  responseDetail: "concise",
  coachingStyle: "gentle",
};
const policy = {
  currentDate: "2026-08-02",
  timeZone: "Asia/Manila",
  compliance: { posture: "budgeting_allowed" as const, topics: [] },
  requiredToolGroups: ["account_balance" as const],
};
const responseMetadata = {
  promptVersion: "expert-v1",
  compliance: policy.compliance,
  sources: [],
};
const audit = {
  promptVersion: "expert-v1",
  compliancePolicyJson: JSON.stringify(policy),
  requiredToolGroupsJson: JSON.stringify(policy.requiredToolGroups),
  providerCallCount: 1,
  validationStatus: "passed" as const,
  toolCalls: [],
};
const thread: AssistantThread = {
  id: threadId,
  title: "Sensitive prompt",
  lastMessageAt: "2026-07-27T00:00:00.000Z",
  createdAt: "2026-07-27T00:00:00.000Z",
};
const userMessage: AssistantMessage = {
  id: "message-sensitive-id",
  threadId,
  role: "user",
  content: input.message,
  status: "pending",
  createdAt: "2026-07-27T00:00:00.000Z",
};
const assistantMessage: AssistantMessage = {
  id: "reply-sensitive-id",
  threadId,
  role: "assistant",
  content: "Verified answer.",
  status: "completed",
  createdAt: "2026-07-27T00:00:01.000Z",
};
const start: AssistantTurnStart = {
  thread,
  userMessage,
  history: [],
  runId: "run-sensitive-id",
};
const completed: AssistantCompletedTurn = {
  thread,
  userMessage: { ...userMessage, status: "completed" },
  assistantMessage,
};

function createRepository(): AssistantRepository {
  return {
    getPreferences: vi.fn(async () => preferences),
    grantConsent: vi.fn(async () => preferences),
    setAssistantIdentity: vi.fn(async () => preferences),
    setResponsePreferences: vi.fn(async () => preferences),
    listThreads: vi.fn(async () => ({ items: [], nextCursor: null })),
    listMessages: vi.fn(async () => ({ items: [], nextCursor: null })),
    createThread: vi.fn(async () => thread),
    beginTurn: vi.fn(async () => start),
    completeTurn: vi.fn(async () => completed),
    failTurn: vi.fn(async () => undefined),
    deleteThread: vi.fn(async () => undefined),
    deleteAllThreads: vi.fn(async () => undefined),
    cleanupExpired: vi.fn(async () => 0),
    listMemories: vi.fn(async () => []),
    getMemory: vi.fn(async () => null),
    upsertMemory: vi.fn(
      async (_env: Bindings, _tenantId: string, memory: AssistantMemory) => memory,
    ),
    deleteMemory: vi.fn(async () => undefined),
    clearMemories: vi.fn(async () => undefined),
  };
}

function failingOrchestrator(error: Error): AssistantOrchestrator {
  return {
    plan: vi.fn(async () => policy),
    answer: vi.fn(async () => {
      throw error;
    }),
  };
}

const cases: Array<{
  kind: DeepSeekErrorKind;
  reason: DeepSeekFailureReason;
  providerStatus?: number;
  status: HttpError["status"];
  code: string;
  message: string;
}> = [
  {
    kind: "configuration",
    reason: "credentials_rejected",
    providerStatus: 401,
    status: 503,
    code: "assistant_unavailable",
    message: "The assistant is temporarily unavailable. Try again later.",
  },
  {
    kind: "rate_limit",
    reason: "rate_limited",
    providerStatus: 429,
    status: 503,
    code: "assistant_unavailable",
    message: "The assistant is temporarily unavailable. Try again later.",
  },
  {
    kind: "unavailable",
    reason: "upstream_unavailable",
    providerStatus: 503,
    status: 503,
    code: "assistant_unavailable",
    message: "The assistant is temporarily unavailable. Try again later.",
  },
  {
    kind: "timeout",
    reason: "timed_out",
    status: 504,
    code: "assistant_timeout",
    message: "The assistant took too long. Try again.",
  },
  {
    kind: "invalid_response",
    reason: "malformed_response",
    status: 502,
    code: "assistant_provider_error",
    message: "The assistant returned an invalid response. Try again.",
  },
  {
    kind: "blocked",
    reason: "content_filtered",
    status: 422,
    code: "assistant_response_blocked",
    message: "The assistant could not provide a response to that question.",
  },
];

function successfulOrchestrator(): AssistantOrchestrator {
  return {
    plan: vi.fn(async () => policy),
    answer: vi.fn(async () => ({
      content: assistantMessage.content,
      model: "deepseek-v4-flash",
      finishReason: "stop",
      responseMetadata,
      audit,
    })),
  };
}

describe("assistant service provider failures", () => {
  it.each(cases)(
    "maps $kind/$reason to a safe response and diagnostic",
    async ({ kind, reason, providerStatus, status, code, message }) => {
      const sensitive = "sk-secret prompt balance 9000 tenant-sensitive-id";
      const repository = createRepository();
      const reporter = vi.fn<AssistantDiagnosticReporter>();
      const error = new DeepSeekError(kind, reason, sensitive, providerStatus);
      const service = createAssistantService(repository, failingOrchestrator(error), reporter);

      await expect(service.sendTurn(env, tenantId, threadId, input)).rejects.toMatchObject({
        status,
        code,
        message,
      });

      expect(repository.failTurn).toHaveBeenCalledWith(env, tenantId, start);
      expect(reporter).toHaveBeenCalledTimes(1);
      expect(reporter).toHaveBeenCalledWith({
        event: "assistant_provider_failure",
        provider: "deepseek",
        kind,
        reason,
        ...(providerStatus === undefined ? {} : { providerStatus }),
      });
      const serialized = JSON.stringify(reporter.mock.calls);
      expect(serialized).not.toContain(sensitive);
      expect(serialized).not.toContain(tenantId);
      expect(serialized).not.toContain(threadId);
      expect(serialized).not.toContain(input.clientRequestId);
      expect(Object.keys(reporter.mock.calls[0]![0]).sort()).toEqual(
        [
          "event",
          "kind",
          "provider",
          "reason",
          ...(providerStatus === undefined ? [] : ["providerStatus"]),
        ].sort(),
      );
    },
  );

  it("rethrows non-provider errors after failed-turn cleanup", async () => {
    const repository = createRepository();
    const reporter = vi.fn<AssistantDiagnosticReporter>();
    const unexpected = new Error("repository-sensitive-failure");
    const service = createAssistantService(repository, failingOrchestrator(unexpected), reporter);

    await expect(service.sendTurn(env, tenantId, threadId, input)).rejects.toBe(unexpected);
    expect(repository.failTurn).toHaveBeenCalledWith(env, tenantId, start);
    expect(reporter).not.toHaveBeenCalled();
  });

  it("does not let diagnostic failures alter provider error handling", async () => {
    const repository = createRepository();
    const reporter: AssistantDiagnosticReporter = () => {
      throw new Error("logging failed");
    };
    const service = createAssistantService(
      repository,
      failingOrchestrator(
        new DeepSeekError("unavailable", "fetch_failed", "Provider unavailable."),
      ),
      reporter,
    );

    await expect(service.sendTurn(env, tenantId, threadId, input)).rejects.toMatchObject({
      status: 503,
      code: "assistant_unavailable",
    });
    expect(repository.failTurn).toHaveBeenCalledWith(env, tenantId, start);
  });

  it("blocks generation before persistence when assistant identity is incomplete", async () => {
    const repository = createRepository();
    vi.mocked(repository.getPreferences).mockResolvedValue({
      ...preferences,
      assistantName: null,
      userPreferredName: null,
    });
    const orchestrator: AssistantOrchestrator = {
      plan: vi.fn(async () => policy),
      answer: vi.fn(),
    };
    const service = createAssistantService(repository, orchestrator);

    await expect(service.sendTurn(env, tenantId, threadId, input)).rejects.toMatchObject({
      status: 409,
      code: "assistant_identity_required",
    });
    expect(repository.beginTurn).not.toHaveBeenCalled();
    expect(orchestrator.answer).not.toHaveBeenCalled();
  });

  it("emits no provider diagnostic for successful turns", async () => {
    const repository = createRepository();
    const reporter = vi.fn<AssistantDiagnosticReporter>();
    const orchestrator: AssistantOrchestrator = {
      plan: vi.fn(async () => policy),
      answer: vi.fn(async () => ({
        content: assistantMessage.content,
        model: "deepseek-v4-flash",
        finishReason: "stop",
        responseMetadata,
        audit,
      })),
    };
    const service = createAssistantService(repository, orchestrator, reporter);

    await expect(service.sendTurn(env, tenantId, threadId, input)).resolves.toEqual(
      completed satisfies AssistantTurnResult,
    );
    expect(repository.completeTurn).toHaveBeenCalled();
    expect(repository.failTurn).not.toHaveBeenCalled();
    expect(reporter).not.toHaveBeenCalled();
  });
});

describe("assistant service model-memory pass usage", () => {
  const memoryInput: AssistantMessageInput = {
    ...input,
    message: "My rule is to always pay the smallest debt first",
  };

  function provider(): AssistantProvider {
    return {
      complete: vi.fn(async () => ({
        model: "deepseek-v4-flash",
        finishReason: "stop",
        message: {
          role: "assistant" as const,
          content:
            '{"memories":[{"key":"smallest_debt_first","value":"The user pays the smallest debt first"}]}',
        },
      })),
    };
  }

  function modelUsage(
    tryConsumePass: AssistantModelMemoryUsageRepository["tryConsumePass"],
  ): Pick<AssistantModelMemoryUsageRepository, "tryConsumePass"> {
    return { tryConsumePass };
  }

  it("reserves usage before running and persisting a model-assisted memory pass", async () => {
    const repository = createRepository();
    const assistantProvider = provider();
    const tryConsumePass = vi.fn(async () => true);
    const service = createAssistantService(
      repository,
      successfulOrchestrator(),
      undefined,
      undefined,
      assistantProvider,
      modelUsage(tryConsumePass),
    );
    const memoryEnv = { ...env, ASSISTANT_MEMORY_MODEL_PASS: "on" as const };

    await expect(service.sendTurn(memoryEnv, tenantId, threadId, memoryInput)).resolves.toEqual(
      completed,
    );

    expect(tryConsumePass).toHaveBeenCalledOnce();
    expect(tryConsumePass).toHaveBeenCalledWith(memoryEnv, tenantId);
    expect(assistantProvider.complete).toHaveBeenCalledOnce();
    expect(tryConsumePass.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(assistantProvider.complete).mock.invocationCallOrder[0]!,
    );
    expect(repository.upsertMemory).toHaveBeenCalledWith(
      memoryEnv,
      tenantId,
      expect.objectContaining({
        kind: "fact",
        key: "smallest_debt_first",
        source: "model_assisted",
      }),
    );
    expect(repository.getMemory).not.toHaveBeenCalled();
    expect(
      vi
        .mocked(repository.upsertMemory)
        .mock.calls.some(([, , memory]) => memory.key === "model_memory_pass_count"),
    ).toBe(false);
  });

  it("does not reserve model-pass usage while model-assisted memory is disabled", async () => {
    const repository = createRepository();
    const assistantProvider = provider();
    const tryConsumePass = vi.fn(async () => true);
    const service = createAssistantService(
      repository,
      successfulOrchestrator(),
      undefined,
      undefined,
      assistantProvider,
      modelUsage(tryConsumePass),
    );
    const memoryEnv = { ...env, ASSISTANT_MEMORY_MODEL_PASS: "off" as const };

    await expect(service.sendTurn(memoryEnv, tenantId, threadId, memoryInput)).resolves.toEqual(
      completed,
    );

    expect(tryConsumePass).not.toHaveBeenCalled();
    expect(assistantProvider.complete).not.toHaveBeenCalled();
    expect(
      vi
        .mocked(repository.upsertMemory)
        .mock.calls.some(([, , memory]) => memory.source === "model_assisted"),
    ).toBe(false);
  });

  it("skips the model pass when the atomic usage reservation is denied", async () => {
    const repository = createRepository();
    const assistantProvider = provider();
    const tryConsumePass = vi.fn(async () => false);
    const service = createAssistantService(
      repository,
      successfulOrchestrator(),
      undefined,
      undefined,
      assistantProvider,
      modelUsage(tryConsumePass),
    );
    const memoryEnv = { ...env, ASSISTANT_MEMORY_MODEL_PASS: "on" as const };

    await expect(service.sendTurn(memoryEnv, tenantId, threadId, memoryInput)).resolves.toEqual(
      completed,
    );

    expect(tryConsumePass).toHaveBeenCalledOnce();
    expect(assistantProvider.complete).not.toHaveBeenCalled();
    expect(
      vi
        .mocked(repository.upsertMemory)
        .mock.calls.some(([, , memory]) => memory.source === "model_assisted"),
    ).toBe(false);
  });
});
