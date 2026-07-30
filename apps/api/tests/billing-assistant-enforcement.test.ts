import type {
  AssistantMessage,
  AssistantMessageInput,
  AssistantPreferences,
  AssistantThread,
} from "@zoption/shared";
import { describe, expect, it, vi } from "vitest";

import type { AssistantOrchestrator } from "../src/assistant/orchestrator";
import { createAssistantService } from "../src/assistant/service";
import type { BillingRepository } from "../src/db/billing";
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
  retentionDays: 90,
  assistantName: "Aster",
  userPreferredName: "Sam",
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
    answer: vi.fn(async () => ({
      content: ASSISTANT_MESSAGE.content,
      model: "deepseek-chat",
      finishReason: "stop",
    })),
  };
}

function billing(consumeUsage: BillingRepository["consumeUsage"]) {
  return { consumeUsage } satisfies Pick<BillingRepository, "consumeUsage">;
}

describe("assistant billing quota enforcement", () => {
  it("does not consume quota for a duplicate turn", async () => {
    const duplicateStart: AssistantTurnStart = { ...START, duplicate: COMPLETED };
    const store = repository(vi.fn(async () => duplicateStart));
    const assistant = orchestrator();
    const consumeUsage = vi.fn(async () => undefined);
    const service = createAssistantService(store, assistant, undefined, billing(consumeUsage));

    await expect(service.sendTurn(ENV, TENANT_ID, THREAD_ID, INPUT)).resolves.toEqual(COMPLETED);

    expect(store.beginTurn).toHaveBeenCalledTimes(1);
    expect(consumeUsage).not.toHaveBeenCalled();
    expect(assistant.answer).not.toHaveBeenCalled();
    expect(store.completeTurn).not.toHaveBeenCalled();
    expect(store.failTurn).not.toHaveBeenCalled();
  });

  it("consumes quota exactly once after duplicate detection and before orchestration", async () => {
    const store = repository();
    const assistant = orchestrator();
    const consumeUsage = vi.fn(async () => undefined);
    const service = createAssistantService(store, assistant, undefined, billing(consumeUsage));

    await expect(service.sendTurn(ENV, TENANT_ID, THREAD_ID, INPUT)).resolves.toEqual(COMPLETED);

    expect(consumeUsage).toHaveBeenCalledOnce();
    expect(consumeUsage).toHaveBeenCalledWith(ENV, TENANT_ID, "assistant_question");
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
    const service = createAssistantService(store, assistant, undefined, billing(consumeUsage));

    await expect(service.sendTurn(ENV, TENANT_ID, THREAD_ID, INPUT)).rejects.toBe(denial);

    expect(consumeUsage).toHaveBeenCalledOnce();
    expect(store.failTurn).toHaveBeenCalledWith(ENV, TENANT_ID, START);
    expect(assistant.answer).not.toHaveBeenCalled();
    expect(store.completeTurn).not.toHaveBeenCalled();
  });
});
