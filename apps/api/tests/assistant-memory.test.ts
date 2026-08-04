import { describe, expect, it } from "vitest";

import {
  buildMemoryBlock,
  deterministicExtract,
  isSensitiveMemory,
  MAX_MEMORY_CHARACTERS,
  runModelMemoryPass,
  sanitizeMemoryValue,
} from "../src/assistant/memory";
import type { AssistantProvider, ProviderCompletion } from "../src/assistant/provider";
import type { Bindings } from "../src/types";

const env = { DB: {} as D1Database } satisfies Bindings;

function providerWith(content: string): AssistantProvider {
  const completion: ProviderCompletion = {
    model: "deepseek-v4-flash",
    finishReason: "stop",
    message: { role: "assistant", content },
  };
  return { complete: async () => completion };
}

describe("assistant memory sanitization", () => {
  it("collapses whitespace and control characters", () => {
    expect(sanitizeMemoryValue("  Pay off\n\tmy card\u0000 first  ")).toBe("Pay off my card first");
  });

  it("caps fact length with an ellipsis", () => {
    const value = "x".repeat(300);
    const sanitized = sanitizeMemoryValue(value);
    expect(sanitized.length).toBeLessThanOrEqual(240);
    expect(sanitized.endsWith("…")).toBe(true);
  });

  it("flags secrets and card-like numbers", () => {
    expect(isSensitiveMemory("my password: hunter2")).toBe(true);
    expect(isSensitiveMemory("api_key=abc")).toBe(true);
    expect(isSensitiveMemory("card 4111-1111-1111-1111")).toBe(true);
    expect(isSensitiveMemory("I prefer avalanche payoff")).toBe(false);
  });
});

describe("deterministicExtract", () => {
  it("extracts an avalanche debt preference", () => {
    const result = deterministicExtract("I want to use the avalanche method for my debts");
    expect(result.memories).toEqual([
      expect.objectContaining({ kind: "preference", key: "debt_strategy", value: "avalanche" }),
    ]);
    expect(result.needsModelPass).toBe(false);
  });

  it("extracts a snowball debt preference", () => {
    const result = deterministicExtract("Snowball feels more motivating for me");
    expect(result.memories).toEqual([
      expect.objectContaining({ kind: "preference", key: "debt_strategy", value: "snowball" }),
    ]);
  });

  it("extracts an emergency fund target as a fact", () => {
    const result = deterministicExtract("I want to build an emergency fund target of PHP 100,000");
    expect(result.memories).toEqual([
      expect.objectContaining({
        kind: "fact",
        key: "emergency_fund_target",
        source: "deterministic",
      }),
    ]);
    expect(result.memories[0]!.value).toMatch(/emergency fund target of PHP 100,000/i);
  });

  it("requests a model pass only for deeper durable signals without deterministic hits", () => {
    const result = deterministicExtract("My rule is to always pay the smallest debt first");
    expect(result.memories).toEqual([]);
    expect(result.needsModelPass).toBe(true);
  });

  it("skips the model pass when a deterministic fact was already captured", () => {
    const result = deterministicExtract("I prefer avalanche, that is my rule of thumb");
    expect(result.memories.some((memory) => memory.key === "debt_strategy")).toBe(true);
    expect(result.needsModelPass).toBe(false);
  });

  it("returns nothing for ordinary questions", () => {
    const result = deterministicExtract("How much did I spend last month?");
    expect(result.memories).toEqual([]);
    expect(result.needsModelPass).toBe(false);
  });
});

describe("buildMemoryBlock", () => {
  const facts = [
    {
      id: "1",
      kind: "fact" as const,
      key: "a",
      value: "Emergency fund target PHP 100,000",
      source: "deterministic" as const,
      createdAt: "",
      updatedAt: "",
    },
    {
      id: "2",
      kind: "fact" as const,
      key: "b",
      value: "my password: hunter2",
      source: "model_assisted" as const,
      createdAt: "",
      updatedAt: "",
    },
  ];

  it("includes preferences, safe facts, and the thread summary", () => {
    const block = buildMemoryBlock({
      debtStrategy: "avalanche",
      responseDetail: "standard",
      coachingStyle: "direct",
      facts,
      threadSummary: "The user asked about their July spending.",
    });
    expect(block).toContain("Debt payoff preference: avalanche");
    expect(block).toContain("standard detail, direct coaching");
    expect(block).toContain("Emergency fund target PHP 100,000");
    expect(block).toContain("Earlier in this chat: The user asked about their July spending.");
  });

  it("drops sensitive facts and stays empty without facts", () => {
    const block = buildMemoryBlock({
      debtStrategy: null,
      responseDetail: "concise",
      coachingStyle: "gentle",
      facts,
    });
    expect(block).not.toContain("hunter2");
    expect(block).toContain("Emergency fund target PHP 100,000");
    const empty = buildMemoryBlock({
      debtStrategy: null,
      responseDetail: "concise",
      coachingStyle: "gentle",
      facts: [],
    });
    expect(empty).not.toContain("Emergency fund");
    expect(empty).toContain("Response style: concise detail, gentle coaching");
  });

  it("caps the injected block length", () => {
    const longFacts = Array.from({ length: 30 }, (_, index) => ({
      id: String(index),
      kind: "fact" as const,
      key: `k${index}`,
      value: `Durable fact number ${index} `.repeat(40),
      source: "deterministic" as const,
      createdAt: "",
      updatedAt: "",
    }));
    const block = buildMemoryBlock({
      debtStrategy: null,
      responseDetail: "concise",
      coachingStyle: "gentle",
      facts: longFacts,
    });
    expect(block.length).toBeLessThanOrEqual(MAX_MEMORY_CHARACTERS);
  });
});

describe("runModelMemoryPass", () => {
  it("returns no memories when the env flag is off", async () => {
    const memories = await runModelMemoryPass(
      { ...env, ASSISTANT_MEMORY_MODEL_PASS: "off" },
      providerWith('{"memories":[]}'),
      "anything",
    );
    expect(memories).toEqual([]);
  });

  it("parses validated memories and rejects secrets and malformed JSON", async () => {
    const memories = await runModelMemoryPass(
      { ...env, ASSISTANT_MEMORY_MODEL_PASS: "on" },
      providerWith(
        '{"memories":[{"key":"pay_smallest_first","value":"The user prefers paying the smallest debt first"},{"key":"secret","value":"token: abc123"},{"key":"bad"}]}',
      ),
      "I always pay the smallest debt first",
    );
    expect(memories).toEqual([
      expect.objectContaining({
        kind: "fact",
        key: "pay_smallest_first",
        source: "model_assisted",
      }),
    ]);

    const empty = await runModelMemoryPass(
      { ...env, ASSISTANT_MEMORY_MODEL_PASS: "on" },
      providerWith("not json"),
      "anything",
    );
    expect(empty).toEqual([]);
  });
});

