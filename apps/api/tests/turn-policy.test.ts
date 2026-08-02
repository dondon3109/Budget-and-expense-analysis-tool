import { describe, expect, it } from "vitest";

import { classifyCompliance } from "../src/assistant/compliance-policy";
import { resolveAssistantPeriod } from "../src/assistant/date-range";
import { createAssistantTurnPolicy } from "../src/assistant/turn-policy";

describe("assistant compliance policy", () => {
  it.each([
    ["What stock should I buy?", "investment"],
    ["How should I file my taxes this year?", "tax"],
    ["Should I get whole life or term insurance?", "insurance"],
    ["How much should I put in my retirement account?", "retirement"],
    ["Write a will for me", "estate_legal"],
  ] as const)("redirects personalized regulated request: %s", (message, topic) => {
    const decision = classifyCompliance(message);
    expect(decision.posture).toBe("personalized_recommendation_redirect");
    expect(decision.topics).toContain(topic);
    expect(decision.deterministicResponse).toBeTruthy();
  });

  it.each([
    "What is an index fund?",
    "Explain what a tax deduction means",
    "How does term insurance work?",
  ])("allows general education with a disclaimer: %s", (message) => {
    const decision = classifyCompliance(message);
    expect(decision.posture).toBe("restricted_topic_education");
    expect(decision.deterministicResponse).toBeUndefined();
    expect(decision.disclaimer).toBeTruthy();
  });

  it("keeps debt payoff inside the budgeting scope", () => {
    expect(classifyCompliance("Which debt should I pay first?")).toEqual({
      posture: "budgeting_allowed",
      topics: [],
    });
  });
});

describe("assistant date resolution", () => {
  const currentDate = "2026-08-02";

  it.each([
    ["last month", { from: "2026-07-01", to: "2026-07-31" }],
    ["this month", { from: "2026-08-01", to: "2026-08-02" }],
    ["past 90 days", { from: "2026-05-05", to: "2026-08-02" }],
    ["2024", { from: "2024-01-01", to: "2024-12-31" }],
    ["February 2024", { from: "2024-02-01", to: "2024-02-29" }],
    ["July 1 to August 2, 2026", { from: "2026-07-01", to: "2026-08-02" }],
  ] as const)("resolves %s deterministically", (phrase, period) => {
    const result = resolveAssistantPeriod(
      [],
      `How much did I spend ${phrase}?`,
      currentDate,
      null,
      true,
    );
    expect(result.period).toMatchObject(period);
  });

  it("asks for a year when only a month name is supplied", () => {
    expect(
      resolveAssistantPeriod([], "How much did I spend in March?", currentDate, null, true)
        .clarification,
    ).toMatch(/year/i);
  });

  it("uses real tenant bounds for all-time and reports an empty ledger", () => {
    expect(
      resolveAssistantPeriod(
        [],
        "Show my all-time expenses",
        currentDate,
        { from: "2023-01-02", to: "2026-07-31", transactionCount: 42 },
        true,
      ).period,
    ).toMatchObject({ from: "2023-01-02", to: "2026-07-31" });
    expect(
      resolveAssistantPeriod([], "Show my all-time expenses", currentDate, null, true)
        .deterministicResponse,
    ).toMatch(/don't have any recorded transactions/i);
  });

  it("inherits a trusted structured period from the prior answer", () => {
    const period = { from: "2026-07-01", to: "2026-07-31", label: "last month" };
    const result = resolveAssistantPeriod(
      [
        { role: "user", content: "Show my spending last month" },
        {
          role: "assistant",
          content: "Your spending is available.",
          metadata: {
            promptVersion: "expert-v1",
            compliance: { posture: "budgeting_allowed", topics: [] },
            resolvedPeriod: period,
            sources: [],
          },
        },
      ],
      "What about my income?",
      currentDate,
      null,
      true,
    );
    expect(result.period).toEqual(period);
  });
});

describe("assistant turn policy", () => {
  it("requires grounded budget, category, and anomaly tools for overspending analysis", () => {
    const policy = createAssistantTurnPolicy({
      history: [],
      message: "Why did I overspend last month?",
      currentDate: "2026-08-02",
      timeZone: "Asia/Manila",
      transactionBounds: null,
    });
    expect(policy.resolvedPeriod).toMatchObject({ from: "2026-07-01", to: "2026-07-31" });
    expect(policy.requiredToolGroups).toEqual(
      expect.arrayContaining(["budget_comparison", "category_spending", "anomaly"]),
    );
  });

  it("returns compliance redirects without required tools", () => {
    const policy = createAssistantTurnPolicy({
      history: [],
      message: "What stock should I buy?",
      currentDate: "2026-08-02",
      timeZone: "Asia/Manila",
      transactionBounds: null,
    });
    expect(policy.deterministicResponse).toBeTruthy();
    expect(policy.requiredToolGroups).toEqual([]);
  });
});
