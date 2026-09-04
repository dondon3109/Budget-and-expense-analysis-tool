import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAssistantOrchestrator } from "../src/assistant/orchestrator";
import type {
  AssistantProvider,
  ProviderCompletion,
  ProviderCompletionRequest,
} from "../src/assistant/provider";
import type { AssistantTurnPolicy } from "../src/assistant/turn-policy";
import type { Bindings } from "../src/types";

const policy: AssistantTurnPolicy = {
  currentDate: "2026-09-03",
  timeZone: "Asia/Manila",
  compliance: { posture: "budgeting_allowed", topics: [] },
  resolvedPeriod: { from: "2026-09-01", to: "2026-09-03" },
  requiredToolGroups: [],
};

const identity = {
  assistantName: "Pigoy",
  userPreferredName: "Don",
  responseDetail: "concise" as const,
  coachingStyle: "gentle" as const,
};

/** Provider stub that honors the turn abort signal exactly like real providers. */
function slowProvider(delayMs: number): AssistantProvider & { calls: number } {
  const stub = {
    calls: 0,
    complete(_env: Bindings, request: ProviderCompletionRequest) {
      stub.calls += 1;
      return new Promise<ProviderCompletion>((resolve, reject) => {
        if (request.signal?.aborted) {
          reject(new Error("aborted before start"));
          return;
        }
        const timer = setTimeout(
          () =>
            resolve({
              model: "stub",
              message: { role: "assistant", content: "Done." },
              finishReason: "stop",
            }),
          delayMs,
        );
        request.signal?.addEventListener(
          "abort",
          () => {
            clearTimeout(timer);
            reject(new Error("aborted mid-call"));
          },
          { once: true },
        );
      });
    },
  };
  return stub;
}

describe("assistant overall turn timeout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("lets a slow single-call turn finish instead of aborting at the old ceiling", async () => {
    const orchestrator = createAssistantOrchestrator(slowProvider(30_000), {} as never);
    const pending = orchestrator.answer(
      {} as unknown as Bindings,
      "tenant-1",
      [],
      "Hello",
      identity,
      policy,
      "",
      undefined,
    );
    await vi.advanceTimersByTimeAsync(30_000);
    const result = await pending;
    expect(result.content).toBe("Done.");
    expect(result.finishReason).toBe("stop");
  });
});
