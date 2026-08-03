import type {
  AssistantMessage,
  AssistantMessageInput,
  AssistantPreferences,
  AssistantThread,
} from "@zoption/shared";
import { describe, expect, it, vi } from "vitest";

import type { AssistantOrchestrator } from "../src/assistant/orchestrator";
import { createAssistantService } from "../src/assistant/service";
import type { AssistantUsageRepository } from "../src/db/assistant-usage";
import type {
  AssistantCompletedTurn,
  AssistantRepository,
  AssistantTurnStart,
} from "../src/db/assistant";
import { HttpError } from "../src/errors";
import type { Bindings } from "../src/types";

const ENV = { DB: {} as D1Database } satisfies Bindings;
const TENANT_ID = "user:user-1";
const THREAD_ID = "7f11d55a-c1ec-441e-a718-3b8fd895fa99";
const INPUT: AssistantMessageInput = {
  message: "How much did I spend?",
  clientRequestId: "69a6ec67-85bd-4ccb-9354-1410d6dc5fb4",
};

const PREFERENCES: AssistantPreferences = {
  consentedAt: "2026-07-27T00:00:00.000Z",
  consentVersion: 2,
  retentionDays: 90,
  assistantName: "Aster",
  userPreferredName: "Sam",
  responseDetail: "concise",
  coachingStyle: "gentle",
};

const POLICY = {
  currentDate: "2026-08-02",
  timeZone: "Asia/Manila",
  compliance: { posture: "budgeting_allowed" as const, topics: [] },
  requiredToolGroups: ["period_summary" as const],
};
const RESPONSE_METADATA = {
  promptVersion: "expert-v1",
  compliance: POLICY.compliance,
  sources: [],
};
const AUDIT = {
  promptVersion: "expert-v1",
  compliancePolicyJson: JSON.stringify(POLICY),
  requiredToolGroupsJson: JSON.stringify(POLICY.requiredToolGroups),
  providerCallCount: 1,
  validationStatus: "passed" as const,
  toolCalls: [],
};

const THREAD: AssistantThread = {
  id: THREAD_ID,
  title: "How much did I spend?",
  lastMessageAt: "2026-07-30T00:00:00.000Z",
  createdAt: "2026-07-30T00:00:00.000Z",
};

const USER_MESSAGE: AssistantMessage = {
  id: "message-1",
  threadId: THREAD_ID,
  role: "user",
  content: INPUT.message,
  status: "pending",
  createdAt: "2026-07-30T00:00:00.000Z",
};

const ASSISTANT_MESSAGE: AssistantMessage = {
  id: "message-2",
  threadId: THREAD_ID,
  role: "assistant",
  content: "You spent PHP 2,455.",
  status: "completed",
  createdAt: "2026-07-30T00:00:01.000Z",
};

const START: AssistantTurnStart = {
  thread: THREAD,
  userMessage: USER_MESSAGE,
  history: [],
  runId: "run-1",
};

const COMPLETED: AssistantCompletedTurn = {
  thread: THREAD,
  userMessage: { ...USER_MESSAGE, status: "completed" },
  assistantMessage: ASSISTANT_MESSAGE,
};

function repository(beginTurn: AssistantRepository["beginTurn"] = vi.fn(async () => START)) {
  return {
    getPreferences: vi.fn(async () => PREFERENCES),
    grantConsent: vi.fn(async () => PREFERENCES),
    setAssistantIdentity: vi.fn(async () => PREFERENCES),
    setResponsePreferences: vi.fn(async () => PREFERENCES),
    listThreads: vi.fn(async () => ({ items: [], nextCursor: null })),
    listMessages: vi.fn(async () => ({ items: [], nextCursor: null })),
    createThread: vi.fn(async () => THREAD),
    beginTurn,
    completeTurn: vi.fn(async () => COMPLETED),
    failTurn: vi.fn(async () => undefined),
    deleteThread: vi.fn(async () => undefined),
    deleteAllThreads: vi.fn(async () => undefined),
    cleanupExpired: vi.fn(async () => 0),
  } satisfies AssistantRepository;
}

function orchestrator(): AssistantOrchestrator {
  return {
    plan: vi.fn(async () => POLICY),
    answer: vi.fn(async () => ({
      content: ASSISTANT_MESSAGE.content,
      model: "deepseek-v4-flash",
      finishReason: "stop",
      responseMetadata: RESPONSE_METADATA,
      audit: AUDIT,
    })),
  };
}

function usage(consumeUsage: AssistantUsageRepository["consumeUsage"]) {
  return { consumeUsage } satisfies Pick<AssistantUsageRepository, "consumeUsage">;
}

describe("assistant billing quota enforcement", () => {
  it("does not consume quota for a duplicate turn", async () => {
    const duplicateStart: AssistantTurnStart = { ...START, duplicate: COMPLETED };
    const store = repository(vi.fn(async () => duplicateStart));
    const assistant = orchestrator();
    const consumeUsage = vi.fn(async () => undefined);
    const service = createAssistantService(store, assistant, undefined, usage(consumeUsage));

    await expect(service.sendTurn(ENV, TENANT_ID, THREAD_ID, INPUT)).resolves.toEqual(COMPLETED);

    expect(store.beginTurn).toHaveBeenCalledTimes(1);
    expect(consumeUsage).not.toHaveBeenCalled();
    expect(assistant.answer).not.toHaveBeenCalled();
    expect(store.completeTurn).not.toHaveBeenCalled();
    expect(store.failTurn).not.toHaveBeenCalled();
  });

  it("does not consume quota for a deterministic policy response", async () => {
    const store = repository();
    const assistant = orchestrator();
    vi.mocked(assistant.plan).mockResolvedValueOnce({
      ...POLICY,
      deterministicResponse: "Please choose a specific date range.",
    });
    const consumeUsage = vi.fn(async () => undefined);
    const service = createAssistantService(store, assistant, undefined, usage(consumeUsage));

    await expect(service.sendTurn(ENV, TENANT_ID, THREAD_ID, INPUT)).resolves.toEqual(COMPLETED);

    expect(consumeUsage).not.toHaveBeenCalled();
    expect(assistant.answer).not.toHaveBeenCalled();
    expect(store.completeTurn).toHaveBeenCalledOnce();
  });

  it("consumes quota exactly once after duplicate detection and before orchestration", async () => {
    const store = repository();
    const assistant = orchestrator();
    const consumeUsage = vi.fn(async () => undefined);
    const service = createAssistantService(store, assistant, undefined, usage(consumeUsage));

    await expect(service.sendTurn(ENV, TENANT_ID, THREAD_ID, INPUT)).resolves.toEqual(COMPLETED);

    expect(consumeUsage).toHaveBeenCalledOnce();
    expect(consumeUsage).toHaveBeenCalledWith(ENV, TENANT_ID);
    expect(vi.mocked(store.beginTurn).mock.invocationCallOrder[0]).toBeLessThan(
      consumeUsage.mock.invocationCallOrder[0]!,
    );
    expect(consumeUsage.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(assistant.answer).mock.invocationCallOrder[0]!,
    );
    expect(store.failTurn).not.toHaveBeenCalled();
  });

  it("fails the persisted turn and prevents orchestration when quota is denied", async () => {
    const store = repository();
    const assistant = orchestrator();
    const denial = new HttpError(
      409,
      "monthly_limit_reached",
      "You have reached this month’s plan limit.",
      {
        feature: "assistant_question",
        used: 4,
        limit: 4,
        resetsAt: "2026-07-31T16:00:00.000Z",
        billingPath: "/app/settings",
      },
    );
    const consumeUsage = vi.fn(async () => {
      throw denial;
    });
    const service = createAssistantService(store, assistant, undefined, usage(consumeUsage));

    await expect(service.sendTurn(ENV, TENANT_ID, THREAD_ID, INPUT)).rejects.toBe(denial);

    expect(consumeUsage).toHaveBeenCalledOnce();
    expect(store.failTurn).toHaveBeenCalledWith(ENV, TENANT_ID, START);
    expect(assistant.answer).not.toHaveBeenCalled();
    expect(store.completeTurn).not.toHaveBeenCalled();
  });
});
