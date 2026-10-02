import { describe, expect, it, vi } from "vitest";

import { createAssistantOrchestrator } from "../src/assistant/orchestrator";
import { buildAssistantSystemPrompt } from "../src/assistant/prompt";
import type { AssistantProvider } from "../src/assistant/provider";
import type { AssistantTurnPolicy } from "../src/assistant/turn-policy";
import type { Bindings } from "../src/types";

const policy: AssistantTurnPolicy = {
  currentDate: "2026-09-03",
  timeZone: "Asia/Manila",
  compliance: { posture: "general_education", topics: [] },
  requiredToolGroups: [],
};
const identity = {
  assistantName: "Pigoy",
  userPreferredName: "Don",
  responseDetail: "concise" as const,
  coachingStyle: "gentle" as const,
};

function prompt(goal?: Parameters<typeof buildAssistantSystemPrompt>[5]) {
  return buildAssistantSystemPrompt("2026-09-03", "Asia/Manila", identity, policy, "", goal);
}

function envWithGoal(goal: string | null) {
  const first = vi.fn(async () => ({ goal, otherText: null, selectedAt: null, skipped: false }));
  const bind = vi.fn(() => ({ first }));
  return { env: { DB: { prepare: vi.fn(() => ({ bind })) } } as unknown as Bindings, bind };
}

async function systemPromptSent(env: Bindings) {
  const complete = vi.fn(async () => ({
    message: { role: "assistant" as const, content: "Budgets compare plan to spending." },
    finishReason: "stop",
  }));
  const provider = { complete } as unknown as AssistantProvider;
  const orchestrator = createAssistantOrchestrator(provider, {} as never);
  await orchestrator.answer(env, "tenant-1", [], "What is a budget?", identity, policy, "");
  const request = (complete.mock.calls[0] as unknown[])[1] as {
    messages: { role: string; content: string }[];
  };
  return request.messages[0]!.content;
}

describe("assistant goal prompt line", () => {
  it("adds one goal line when a goal is set", () => {
    expect(prompt("build_budget")).toContain("User goal: build_budget.");
  });

  it("omits the line when no goal is set", () => {
    expect(prompt()).not.toContain("User goal");
    expect(prompt(null)).not.toContain("User goal");
  });

  it("reads the goal for the authenticated tenant when the prompt is built", async () => {
    const { env, bind } = envWithGoal("reduce_debt");
    expect(await systemPromptSent(env)).toContain("User goal: reduce_debt.");
    expect(bind).toHaveBeenCalledWith("tenant-1");
  });

  it("leaves the line out for a workspace without a goal or when the read fails", async () => {
    expect(await systemPromptSent(envWithGoal(null).env)).not.toContain("User goal");
    expect(await systemPromptSent({ DB: {} } as unknown as Bindings)).not.toContain("User goal");
  });
});
