import { describe, expect, it } from "vitest";

import {
  hasExplicitPeriod,
  needsPeriodClarification,
} from "../src/assistant/period-policy";
import type { AssistantHistoryMessage } from "../src/db/assistant";

const explicitPeriods = [
  "Show my income for August 2026",
  "Show my expenses from 2026-07-01 to 2026-07-31",
  "What did I spend last month?",
  "Give me my year-to-date savings",
  "Show my income for the past 90 days",
  "What are my all-time expenses?",
];

describe("assistant period policy", () => {
  it.each(explicitPeriods)("recognizes an explicit period in %s", (message) => {
    expect(hasExplicitPeriod(message)).toBe(true);
    expect(needsPeriodClarification([], message)).toBe(false);
  });

  it.each([
    "How much is my income on my bank account?",
    "What are my total expenses?",
    "Show my average spending",
    "What's left after expenses?",
    "What about my income?",
  ])("requires clarification for an aggregate without a period: %s", (message) => {
    expect(needsPeriodClarification([], message)).toBe(true);
  });

  it.each([
    "What is my Bank balance?",
    "How do income categories work?",
    "List my recent transactions",
  ])("does not intercept a non-period aggregate request: %s", (message) => {
    expect(needsPeriodClarification([], message)).toBe(false);
  });

  it("allows a short follow-up when the immediately preceding exchange established a period", () => {
    const history: AssistantHistoryMessage[] = [
      { role: "user", content: "Show my spending for August 2026" },
      {
        role: "assistant",
        content: "From August 1 to August 31, 2026, your expenses were PHP 1,000.00.",
      },
    ];

    expect(needsPeriodClarification(history, "What about my income?")).toBe(false);
  });

  it("does not reuse a period mentioned only by an assistant", () => {
    const history: AssistantHistoryMessage[] = [
      { role: "user", content: "Tell me about my account" },
      {
        role: "assistant",
        content: "Today is August 2, 2026. Which financial record should I check?",
      },
    ];

    expect(needsPeriodClarification(history, "What is my total income?")).toBe(true);
  });
});
