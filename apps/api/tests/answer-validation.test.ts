import { describe, expect, it } from "vitest";

import {
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
});
