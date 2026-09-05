import { describe, expect, it } from "vitest";

import {
  canonicalizePesoAmounts,
  correctivePrompt,
  deterministicPeriodSummaryAnswer,
  sanitizedAuditJson,
  validateAssistantAnswer,
  validateToolArguments,
} from "../src/assistant/answer-validation";
import type { AssistantToolExecution } from "../src/assistant/tools";
import type { AssistantTurnPolicy } from "../src/assistant/turn-policy";

const policy: AssistantTurnPolicy = {
  currentDate: "2026-08-02",
  timeZone: "Asia/Manila",
  compliance: { posture: "budgeting_allowed", topics: [] },
  resolvedPeriod: { from: "2026-07-01", to: "2026-07-31" },
  requiredToolGroups: ["period_summary"],
};

const execution: AssistantToolExecution = {
  name: "get_period_summary",
  arguments: { from: "2026-07-01", to: "2026-07-31" },
  result: {
    data: {
      expenses: "PHP 1,234.56",
      savingsRatePercent: 25,
      transactionCount: 4,
    },
    source: {
      sourceType: "transactions",
      period: { from: "2026-07-01", to: "2026-07-31" },
      recordCount: 4,
    },
    dataQuality: { status: "reliable", signals: [] },
  },
  content: "{}",
};

describe("assistant answer validation", () => {
  it("accepts exact backend facts and rejects fabricated or reformatted money", () => {
    expect(
      validateAssistantAnswer(
        "From 2026-07-01 to 2026-07-31, expenses were PHP 1,234.56 across 4 transactions.",
        policy,
        [execution],
        new Set(["period_summary"]),
      ),
    ).toEqual({ valid: true, reasons: [] });

    const result = validateAssistantAnswer(
      "Expenses were ₱9,999.00 and the savings rate was 80%.",
      policy,
      [execution],
      new Set(["period_summary"]),
    );
    expect(result.valid).toBe(false);
    expect(result.reasons).toEqual(
      expect.arrayContaining(["unsupported_currency_format", "unsupported_percentage"]),
    );
  });

  it("rejects model-selected dates before a financial query executes", () => {
    expect(
      validateToolArguments("get_period_summary", { from: "2026-01-01", to: "2026-07-31" }, policy),
    ).toBe("untrusted_period");
    expect(
      validateToolArguments("get_period_summary", { from: "2026-07-01", to: "2026-07-31" }, policy),
    ).toBeNull();
  });

  it("canonicalizes peso signs so grounded amounts validate, without weakening grounding", () => {
    expect(canonicalizePesoAmounts("You spent ₱1,234.56.")).toBe("You spent PHP 1,234.56.");
    expect(canonicalizePesoAmounts("Total: ₱ 2,000.00!")).toBe("Total: PHP 2,000.00!");
    expect(canonicalizePesoAmounts("You spent $5.00.")).toBe("You spent $5.00.");

    // Grounded ₱ amount: canonical form matches backend data exactly.
    expect(
      validateAssistantAnswer(
        canonicalizePesoAmounts("From 2026-07-01 to 2026-07-31, expenses were ₱1,234.56."),
        policy,
        [execution],
        new Set(["period_summary"]),
      ),
    ).toEqual({ valid: true, reasons: [] });

    // Fabricated ₱ amount: canonical form still rejected.
    const fabricated = validateAssistantAnswer(
      canonicalizePesoAmounts("Expenses were ₱9,999.00."),
      policy,
      [execution],
      new Set(["period_summary"]),
    );
    expect(fabricated.valid).toBe(false);
    expect(fabricated.reasons).toContain("unsupported_money");
  });

  it("adds repair guidance to the corrective prompt", () => {
    const prompt = correctivePrompt(
      { valid: false, reasons: ["unsupported_currency_format", "bare_money"] },
      policy,
      [execution],
    );
    expect(prompt).toContain("unsupported_currency_format");
    expect(prompt).toContain("Repair: ");
    expect(prompt).toContain("PHP 1,234.56");
  });

  it("removes identifiers, notes, secrets, and user fields from audit snapshots", () => {
    const snapshot = sanitizedAuditJson({
      id: "row-1",
      categoryId: "category-1",
      import_id: "import-1",
      tenantId: "tenant-1",
      userPreferredName: "Sam",
      notes: "private note",
      apiToken: "secret-token",
      paid: true,
      description: "Groceries",
    });

    expect(snapshot).toContain('"paid":true');
    expect(snapshot).toContain("Groceries");
    expect(snapshot).not.toContain("row-1");
    expect(snapshot).not.toContain("category-1");
    expect(snapshot).not.toContain("import-1");
    expect(snapshot).not.toContain("tenant-1");
    expect(snapshot).not.toContain("Sam");
    expect(snapshot).not.toContain("private note");
    expect(snapshot).not.toContain("secret-token");
  });

  it("renders a verified total-spend answer only for the single-group shape", () => {
    const satisfied = new Set(["period_summary"] as const);
    expect(deterministicPeriodSummaryAnswer(policy, [execution], satisfied)).toBe(
      "From 2026-07-01 to 2026-07-31, your recorded expenses were PHP 1,234.56.",
    );

    // Multi-group questions still need the model to synthesize across tools.
    expect(
      deterministicPeriodSummaryAnswer(
        { ...policy, requiredToolGroups: ["period_summary", "category_spending"] },
        [execution],
        new Set(["period_summary", "category_spending"]),
      ),
    ).toBeNull();

    // A filter miss must stay a plain not-found answer, never a substituted total.
    const filterMiss: AssistantToolExecution = {
      ...execution,
      result: {
        ...(execution.result as Record<string, unknown>),
        data: { categoryName: "Dining", filterMatched: false },
      },
    };
    expect(deterministicPeriodSummaryAnswer(policy, [filterMiss], satisfied)).toBeNull();

    // Insufficient data must keep the safe refusal instead of a zero-data total.
    const insufficient: AssistantToolExecution = {
      ...execution,
      result: {
        ...(execution.result as Record<string, unknown>),
        dataQuality: { status: "insufficient", signals: [] },
      },
    };
    expect(deterministicPeriodSummaryAnswer(policy, [insufficient], satisfied)).toBeNull();
  });
});
