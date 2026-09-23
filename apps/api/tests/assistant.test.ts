import type { AssistantToolResultEnvelope } from "@zoption/shared";
import { describe, expect, it, vi } from "vitest";

import { createAssistantOrchestrator } from "../src/assistant/orchestrator";
import type {
  FinancialReadContext,
  FinancialReader,
  PeriodSummaryInput,
} from "../src/assistant/financial-reader";
import type {
  AssistantProvider,
  ProviderCompletion,
  ProviderCompletionRequest,
} from "../src/assistant/provider";
import { assistantToolDefinitions, executeAssistantTool } from "../src/assistant/tools";
import type { AssistantTurnPolicy } from "../src/assistant/turn-policy";
import type { Bindings } from "../src/types";

const env = {
  DB: {} as D1Database,
  DEEPSEEK_MODEL: "deepseek-flash",
  ASSISTANT_TIME_ZONE: "Asia/Manila",
} satisfies Bindings;

const identity = {
  assistantName: "Aster",
  userPreferredName: "Sam",
  responseDetail: "concise" as const,
  coachingStyle: "gentle" as const,
};

const policy: AssistantTurnPolicy = {
  currentDate: "2026-08-02",
  timeZone: "Asia/Manila",
  compliance: { posture: "budgeting_allowed", topics: [] },
  resolvedPeriod: { from: "2026-07-01", to: "2026-07-31", label: "July 2026" },
  requiredToolGroups: ["period_summary"],
};

function envelope<T>(
  data: T,
  sourceType: "transactions" | "budgets" | "accounts" | "goals" | "debts" = "transactions",
): AssistantToolResultEnvelope<T> {
  return {
    data,
    source: {
      sourceType,
      period: { from: "2026-07-01", to: "2026-07-31" },
      recordCount: 4,
    },
    dataQuality: { status: "reliable", signals: [] },
  };
}

function createReader(): FinancialReader {
  return {
    getTransactionDateBounds: vi.fn(async () => ({
      from: "2026-01-01",
      to: "2026-08-02",
      transactionCount: 20,
    })),
    getAccountBalances: vi.fn(async () => envelope({ overallBalance: "PHP 1,000.00" }, "accounts")),
    getPeriodSummary: vi.fn(async (_context: FinancialReadContext, input: PeriodSummaryInput) =>
      envelope({
        period: { from: input.from, to: input.to },
        currency: "PHP",
        expenses: "PHP 12,450.00",
        transactionCount: 4,
      }),
    ),
    getSpendingByCategory: vi.fn(async () => envelope({ items: [] })),
    getBudgetVsActual: vi.fn(async () => envelope({ months: [] }, "budgets")),
    getBudgetStatus: vi.fn(async () => envelope({ months: [] }, "budgets")),
    detectRecurringCharges: vi.fn(async () => envelope({ items: [] })),
    detectSpendingAnomalies: vi.fn(async () => envelope({ items: [] })),
    calculateDebtPayoff: vi.fn(async () => envelope({ items: [] }, "debts")),
    calculateSavingsGoal: vi.fn(async () => envelope({ items: [] }, "goals")),
    listTransactions: vi.fn(async () => envelope({ items: [] })),
    listCategories: vi.fn(async () => envelope({ items: [] })),
  };
}

function toolCompletion(): ProviderCompletion {
  return {
    model: "deepseek-flash",
    finishReason: "tool_calls",
    message: {
      role: "assistant",
      content: null,
      tool_calls: [
        {
          id: "call-1",
          type: "function",
          function: {
            name: "get_period_summary",
            arguments: JSON.stringify({ from: "2026-07-01", to: "2026-07-31" }),
          },
        },
      ],
    },
  };
}

describe("assistant orchestration", () => {
  it("clarifies an ambiguous aggregate period without calling the provider", async () => {
    const provider: AssistantProvider = {
      complete: vi.fn(async (): Promise<ProviderCompletion> => {
        throw new Error("The provider should not be called for deterministic clarification.");
      }),
    };
    const reader = createReader();
    const orchestrator = createAssistantOrchestrator(provider, reader);

    const planned = await orchestrator.plan(
      env,
      "tenant-1",
      [],
      "How much is my income on my bank account?",
    );

    expect(planned.deterministicResponse).toBe(
      "Which month or date range should I use? For example, August 2026 or July 1 to August 2, 2026.",
    );
    expect(provider.complete).not.toHaveBeenCalled();
    expect(reader.getPeriodSummary).not.toHaveBeenCalled();
  });

  it("clarifies an ambiguous aggregate period in Tagalog without calling the provider", async () => {
    const provider: AssistantProvider = {
      complete: vi.fn(async (): Promise<ProviderCompletion> => {
        throw new Error("The provider should not be called for deterministic clarification.");
      }),
    };
    const reader = createReader();
    const orchestrator = createAssistantOrchestrator(provider, reader);

    const planned = await orchestrator.plan(
      env,
      "tenant-1",
      [],
      "Magkano ang kinita ko sa aking bangko?",
    );

    expect(planned.deterministicResponse).toBe(
      "Aling buwan o petsa ang nais mong gamitin? Halimbawa, Agosto 2026 o Hulyo 1 hanggang Agosto 2, 2026.",
    );
    expect(provider.complete).not.toHaveBeenCalled();
    expect(reader.getPeriodSummary).not.toHaveBeenCalled();
  });

  it("requires and audits a trusted-period tool before accepting grounded figures", async () => {
    const requests: ProviderCompletionRequest[] = [];
    const provider: AssistantProvider = {
      complete: vi.fn(
        async (_env: Bindings, request: ProviderCompletionRequest): Promise<ProviderCompletion> => {
          requests.push(structuredClone(request));
          if (requests.length === 1) return toolCompletion();
          return {
            model: "deepseek-flash",
            finishReason: "stop",
            message: {
              role: "assistant",
              content:
                "From 2026-07-01 to 2026-07-31, your recorded expenses were PHP 12,450.00 across 4 transactions.",
            },
          };
        },
      ),
    };
    const reader = createReader();
    const orchestrator = createAssistantOrchestrator(provider, reader);

    const answer = await orchestrator.answer(
      env,
      "tenant-secret",
      [],
      "How much did I spend in July 2026?",
      identity,
      policy,
      "",
    );

    expect(answer.content).toContain("PHP 12,450.00");
    expect(answer.audit).toMatchObject({
      providerCallCount: 2,
      validationStatus: "passed",
      toolCalls: [{ toolName: "get_period_summary" }],
    });
    expect(answer.responseMetadata.sources).toHaveLength(1);
    expect(reader.getPeriodSummary).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "tenant-secret" }),
      { from: "2026-07-01", to: "2026-07-31" },
    );
    expect(requests[0]?.toolChoice).toBe("required");
    expect(requests[1]?.toolChoice).toBe("auto");
    expect(JSON.stringify(requests)).not.toContain("tenant-secret");
    expect(requests[0]?.messages[0]?.content).toContain("Return plain text only");
    expect(requests[0]?.messages[0]?.content).toContain('"assistantName":"Aster"');
  });

  it("reads every required group itself when the model answers without tools", async () => {
    const requests: ProviderCompletionRequest[] = [];
    const provider: AssistantProvider = {
      complete: vi.fn(
        async (_env: Bindings, request: ProviderCompletionRequest): Promise<ProviderCompletion> => {
          requests.push(structuredClone(request));
          return {
            model: "deepseek-flash",
            finishReason: "stop",
            message: {
              role: "assistant",
              content: "Your recorded expenses were PHP 12,450.00 across 4 transactions.",
            },
          };
        },
      ),
    };
    const reader = createReader();
    const orchestrator = createAssistantOrchestrator(provider, reader);

    const answer = await orchestrator.answer(
      env,
      "tenant-1",
      [],
      "Why did I overspend in July 2026?",
      identity,
      {
        ...policy,
        requiredToolGroups: ["period_summary", "budget_comparison", "category_spending"],
      },
      "",
    );

    // Without the backend reads the draft would be refused on the unmet groups.
    expect(answer.finishReason).toBe("stop");
    expect(answer.audit.validationStatus).toBe("passed");
    expect(answer.audit.toolCalls.map((call) => call.toolName)).toEqual([
      "get_period_summary",
      "get_budget_vs_actual",
      "get_spending_by_category",
    ]);
    expect(answer.responseMetadata.sources).toHaveLength(3);
    expect(provider.complete).toHaveBeenCalledTimes(2);
    // The records have to reach the model as data for the retry to be grounded.
    expect(requests[1]?.messages.at(-1)).toMatchObject({ role: "user" });
    expect(JSON.stringify(requests[1]?.messages)).toContain("PHP 12,450.00");
    expect(requests[1]?.toolChoice).toBe("auto");
  });

  it("reads a required group before the final provider call", async () => {
    let calls = 0;
    const provider: AssistantProvider = {
      complete: vi.fn(async (): Promise<ProviderCompletion> => {
        calls += 1;
        if (calls < 4) {
          return {
            model: "deepseek-flash",
            finishReason: "tool_calls",
            message: {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: `call-${calls}`,
                  type: "function",
                  function: { name: "list_categories", arguments: "{}" },
                },
              ],
            },
          };
        }
        return {
          model: "deepseek-flash",
          finishReason: "stop",
          message: {
            role: "assistant",
            content: "Your recorded expenses were PHP 12,450.00 across 4 transactions.",
          },
        };
      }),
    };
    const reader = createReader();
    const orchestrator = createAssistantOrchestrator(provider, reader);

    const answer = await orchestrator.answer(
      env,
      "tenant-1",
      [],
      "How much did I spend in July 2026?",
      identity,
      policy,
      "",
    );

    expect(answer.audit.validationStatus).toBe("passed");
    expect(provider.complete).toHaveBeenCalledTimes(4);
    expect(reader.getPeriodSummary).toHaveBeenCalledTimes(1);
  });

  it("retries once when a draft uses an unverified peso format", async () => {
    let calls = 0;
    const provider: AssistantProvider = {
      complete: vi.fn(async (): Promise<ProviderCompletion> => {
        calls += 1;
        if (calls === 1) return toolCompletion();
        return {
          model: "deepseek-flash",
          finishReason: "stop",
          message: {
            role: "assistant",
            content:
              calls === 2 ? "You spent $12,450.00." : "Your recorded expenses were PHP 12,450.00.",
          },
        };
      }),
    };
    const orchestrator = createAssistantOrchestrator(provider, createReader());

    const answer = await orchestrator.answer(
      env,
      "tenant-1",
      [],
      "How much did I spend in July 2026?",
      identity,
      policy,
      "",
    );

    expect(answer.content).toBe("Your recorded expenses were PHP 12,450.00.");
    expect(answer.audit.validationStatus).toBe("passed");
    expect(provider.complete).toHaveBeenCalledTimes(3);
    expect(vi.mocked(provider.complete).mock.calls[2]?.[1].toolChoice).toBe("none");
  });

  it("returns a deterministic total when the corrective answer is still invalid", async () => {
    let calls = 0;
    const provider: AssistantProvider = {
      complete: vi.fn(async (): Promise<ProviderCompletion> => {
        calls += 1;
        if (calls === 1) return toolCompletion();
        return {
          model: "deepseek-flash",
          finishReason: "stop",
          message: { role: "assistant", content: "You spent ₱99,999.00." },
        };
      }),
    };
    const orchestrator = createAssistantOrchestrator(provider, createReader());

    const answer = await orchestrator.answer(
      env,
      "tenant-1",
      [],
      "How much did I spend in July 2026?",
      identity,
      policy,
      "",
    );

    expect(answer.content).toBe(
      "From 2026-07-01 to 2026-07-31, your recorded expenses were PHP 12,450.00.",
    );
    expect(answer.finishReason).toBe("deterministic");
    expect(answer.audit.validationStatus).toBe("passed");
    expect(answer.responseMetadata.sources).toHaveLength(1);
    expect(provider.complete).toHaveBeenCalledTimes(3);
  });

  it("exposes no SQL, secret, or mutation tools", () => {
    const names = assistantToolDefinitions.map((tool) => tool.function.name);
    expect(names).toEqual([
      "get_account_balances",
      "get_period_summary",
      "get_spending_by_category",
      "get_budget_vs_actual",
      "detect_recurring_charges",
      "detect_spending_anomalies",
      "calculate_debt_payoff",
      "calculate_savings_goal",
      "list_transactions",
      "list_categories",
    ]);
    expect(names.join(" ")).not.toMatch(/sql|secret|token|create|update|delete/i);
    expect(JSON.stringify(assistantToolDefinitions)).not.toMatch(/accountId|tenantId/);
  });

  it("passes validated account names to the financial reader", async () => {
    const reader = createReader();
    const context = { env, tenantId: "tenant-1" };

    await executeAssistantTool(
      reader,
      context,
      "get_account_balances",
      JSON.stringify({ accountName: "Bank" }),
    );

    expect(reader.getAccountBalances).toHaveBeenCalledWith(context, { accountName: "Bank" });
    await expect(
      executeAssistantTool(
        reader,
        context,
        "get_account_balances",
        JSON.stringify({ accountId: "account-1" }),
      ),
    ).rejects.toThrow("arguments were invalid");
  });

  it("rejects unknown tools before reaching a financial reader", async () => {
    await expect(
      executeAssistantTool(createReader(), { env, tenantId: "tenant-1" }, "run_sql", "{}"),
    ).rejects.toThrow("not available");
  });
});
