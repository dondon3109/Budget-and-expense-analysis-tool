import { assistantSkillForMessage, assistantSkills } from "@zoption/shared";
import { describe, expect, it, vi } from "vitest";

import type { FinancialReader } from "../src/assistant/financial-reader";
import { createAssistantOrchestrator } from "../src/assistant/orchestrator";
import type { AssistantProvider, ProviderCompletionRequest } from "../src/assistant/provider";
import { ASSISTANT_SKILL_PLANS } from "../src/assistant/skills";
import { requiredGroupToolCall } from "../src/assistant/answer-validation";
import { createAssistantTurnPolicy } from "../src/assistant/turn-policy";
import type { Bindings } from "../src/types";

const bounds = { from: "2026-01-01", to: "2026-10-20", transactionCount: 40 };

function plan(message: string) {
  return createAssistantTurnPolicy({
    history: [],
    message,
    currentDate: "2026-10-23",
    timeZone: "Asia/Manila",
    transactionBounds: bounds,
  });
}

describe("assistant skills", () => {
  it("matches only a skill's own prompt", () => {
    expect(assistantSkillForMessage("  give me a check-in on THIS month's money ")?.id).toBe(
      "monthly_checkin",
    );
    expect(assistantSkillForMessage("Give me a check-in on my money")).toBeUndefined();
  });

  it.each(assistantSkills.map((skill) => [skill.id, skill.prompt] as const))(
    "%s resolves a period and only groups the backend can read itself",
    (id, prompt) => {
      const policy = plan(prompt);
      expect(policy.skill).toBe(id);
      expect(policy.deterministicResponse).toBeUndefined();
      expect(policy.requiredToolGroups).toEqual(ASSISTANT_SKILL_PLANS[id].groups);
      for (const group of policy.requiredToolGroups) {
        expect(requiredGroupToolCall(group, policy)).not.toBeNull();
      }
    },
  );

  it("reads a skill's records before the first provider call", async () => {
    const requests: ProviderCompletionRequest[] = [];
    const provider: AssistantProvider = {
      complete: vi.fn(async (_env: Bindings, request: ProviderCompletionRequest) => {
        requests.push(structuredClone(request));
        return {
          model: "deepseek-flash",
          finishReason: "stop",
          message: {
            role: "assistant" as const,
            content: "Your goals are moving. A payoff plan would be a good next step.",
          },
        };
      }),
    };
    const reader = {
      getGoalsAndDebts: vi.fn(async () => ({
        data: { goals: [], debts: [] },
        source: { sourceType: "goals" as const, recordCount: 0 },
        dataQuality: { status: "reliable" as const, signals: [] },
      })),
    } as unknown as FinancialReader;
    const prompt = "How are my goals and debts doing?";

    const answer = await createAssistantOrchestrator(provider, reader).answer(
      {} as Bindings,
      "tenant-1",
      [],
      prompt,
      {
        assistantName: "Zo",
        userPreferredName: "Don",
        responseDetail: "concise",
        coachingStyle: "gentle",
      },
      plan(prompt),
      "",
    );

    expect(provider.complete).toHaveBeenCalledOnce();
    expect(reader.getGoalsAndDebts).toHaveBeenCalledOnce();
    expect(requests[0]!.messages.at(-1)!.content).toContain("get_goals_and_debts");
    expect(requests[0]!.messages[1]!.content).toContain("Goals and debt check-up");
    expect(answer.audit.validationStatus).toBe("passed");
  });
});
