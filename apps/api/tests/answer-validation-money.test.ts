import { describe, expect, it } from "vitest";

import { validateAssistantAnswer, validateToolArguments } from "../src/assistant/answer-validation";
import type { AssistantToolExecution } from "../src/assistant/tools";
import type { AssistantTurnPolicy } from "../src/assistant/turn-policy";

const policy: AssistantTurnPolicy = {
  currentDate: "2026-08-02",
  timeZone: "Asia/Manila",
  compliance: { posture: "budgeting_allowed", topics: [] },
  resolvedPeriod: { from: "2026-07-01", to: "2026-07-31" },
  requiredToolGroups: ["period_summary"],
};

function execution(data: unknown): AssistantToolExecution {
  return {
    name: "get_period_summary",
    arguments: { from: "2026-07-01", to: "2026-07-31" },
    result: {
      data,
      source: {
        sourceType: "transactions",
        period: { from: "2026-07-01", to: "2026-07-31" },
        recordCount: 2,
      },
      dataQuality: { status: "reliable", signals: [] },
    },
    content: "{}",
  };
}

function validate(content: string, data: unknown) {
  return validateAssistantAnswer(content, policy, [execution(data)], new Set(["period_summary"]));
}

describe("structural money grounding", () => {
  it("grounds an amount by value, not by currency decoration or decimal count", () => {
    const data = { expenses: "PHP 12,345.60" };

    expect(validate("You spent PHP 12,345.6.", data)).toEqual({ valid: true, reasons: [] });
    expect(validate("You spent PHP 12345.60.", data)).toEqual({ valid: true, reasons: [] });
    expect(validate("You spent 12,345.6 pesos.", data)).toEqual({ valid: true, reasons: [] });
  });

  it("rejects a fabricated amount in each reported format", () => {
    const data = { expenses: "PHP 12,345.60" };

    for (const draft of [
      // The four formats the audit listed, none of which the old two-decimal
      // money pattern compared against tool output.
      "You spent PHP 12,345.7.",
      "You spent 12,345.7 pesos.",
      "You spent PHP 12345.7.",
      // A whole-peso figure the old pattern also never matched.
      "You spent PHP 12,345.",
    ]) {
      expect(validate(draft, data).reasons, draft).toContain("unsupported_money");
    }
  });

  it("grounds centavo integers by value and rejects a fabricated one", () => {
    const data = { amountMinor: 123456 };

    expect(validate("The recorded value was 123456 centavos.", data)).toEqual({
      valid: true,
      reasons: [],
    });
    expect(validate("The recorded value was 123457 centavos.", data).reasons).toContain(
      "unsupported_money",
    );
  });

  it("grounds counts and durations against tool scalars", () => {
    const data = { transactionCount: 12, monthsCovered: 3 };

    expect(validate("That covers 12 transactions over 3 months.", data)).toEqual({
      valid: true,
      reasons: [],
    });
    expect(validate("That covers 19 transactions over 3 months.", data).reasons).toContain(
      "unsupported_numeric_claim",
    );
    expect(validate("That covers 12 transactions over 5 months.", data).reasons).toContain(
      "unsupported_numeric_claim",
    );
  });

  it("does not read integer ratios in education prose as amounts", () => {
    const educationPolicy: AssistantTurnPolicy = { ...policy, requiredToolGroups: [] };

    const guidance =
      "A common guideline is the 50/30/20 rule: 50 for needs, 30 for wants, and 20 for savings. " +
      "Split your income into 3 buckets and review them monthly.";
    expect(validateAssistantAnswer(guidance, educationPolicy, [], new Set())).toEqual({
      valid: true,
      reasons: [],
    });
  });

  it("rejects a sign the tool did not report", () => {
    const data = { expenses: "PHP -1,234.56" };

    expect(validate("Your recorded expenses were PHP -1,234.56.", data)).toEqual({
      valid: true,
      reasons: [],
    });
    expect(validate("Your recorded expenses were PHP 1,234.56.", data).reasons).toContain(
      "unsupported_money",
    );
  });

  it("keeps canonical tool amounts and percentages accepted", () => {
    expect(
      validate(
        "From 2026-07-01 to 2026-07-31, expenses were PHP 12,345.60 across 2 transactions.",
        {
          expenses: "PHP 12,345.60",
          savingsRatePercent: 25,
        },
      ),
    ).toEqual({ valid: true, reasons: [] });
  });
});

describe("trusted period tool arguments", () => {
  const noPeriod: AssistantTurnPolicy = { ...policy, resolvedPeriod: undefined };

  it("fails closed when no period resolved", () => {
    expect(
      validateToolArguments(
        "get_period_summary",
        { from: "2026-01-01", to: "2026-12-31" },
        noPeriod,
      ),
    ).toBe("untrusted_period");
    expect(
      validateToolArguments(
        "list_transactions",
        { from: "2026-01-01", to: "2026-06-30" },
        noPeriod,
      ),
    ).toBe("untrusted_period");
    // Omitting the bounds entirely is still the model choosing what to disclose.
    expect(validateToolArguments("list_transactions", {}, noPeriod)).toBe("untrusted_period");
    expect(validateToolArguments("get_account_balances", {}, noPeriod)).toBeNull();
  });

  it("still requires the resolved period when one exists", () => {
    expect(
      validateToolArguments("get_period_summary", { from: "2026-01-01", to: "2026-07-31" }, policy),
    ).toBe("untrusted_period");
    expect(
      validateToolArguments("list_transactions", { from: "2026-07-01", to: "2026-07-31" }, policy),
    ).toBeNull();
  });
});
