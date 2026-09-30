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
import { validateToolArguments } from "../src/assistant/answer-validation";
import {
  assistantToolDefinitions,
  executeAssistantTool,
  executeAssistantToolDetailed,
} from "../src/assistant/tools";
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
    suggestTransactionDetails: vi.fn(async () =>
      envelope({
        place: "Jollibee",
        placeMatched: true,
        suggestions: [
          {
            description: "Jollibee",
            categoryName: "Food",
            accountName: "GCash",
            typicalAmount: "PHP 180.00",
          },
        ],
      }),
    ),
    draftTransaction: vi.fn(async () => ({
      envelope: envelope({
        status: "ready",
        saved: false,
        draft: {
          kind: "expense",
          date: "2026-08-02",
          description: "Jollibee",
          amount: "PHP 250.00",
          categoryName: "Food",
          accountName: "GCash",
        },
      }),
      draft: {
        status: "pending" as const,
        kind: "expense" as const,
        date: "2026-08-02",
        description: "Jollibee",
        amountMinor: 25_000,
        currency: "PHP" as const,
        categoryId: "category-food",
        categoryName: "Food",
        accountId: "account-gcash",
        accountName: "GCash",
      },
    })),
  };
}

const entryPolicy: AssistantTurnPolicy = {
  currentDate: "2026-08-02",
  timeZone: "Asia/Manila",
  compliance: { posture: "budgeting_allowed", topics: [] },
  requiredToolGroups: ["transaction_entry"],
};

function entryToolCompletion(): ProviderCompletion {
  return {
    model: "deepseek-flash",
    finishReason: "tool_calls",
    message: {
      role: "assistant",
      content: null,
      tool_calls: [
        {
          id: "call-suggest",
          type: "function",
          function: {
            name: "suggest_transaction_details",
            arguments: JSON.stringify({ through: "2026-08-02", place: "Jollibee" }),
          },
        },
        {
          id: "call-draft",
          type: "function",
          function: {
            name: "draft_transaction",
            arguments: JSON.stringify({
              kind: "expense",
              description: "Jollibee",
              categoryName: "Food",
              accountName: "GCash",
              date: "2026-08-02",
              amount: "250",
              currentDate: "2026-08-02",
            }),
          },
        },
      ],
    },
  };
}

function textCompletion(content: string): ProviderCompletion {
  return {
    model: "deepseek-flash",
    finishReason: "stop",
    message: { role: "assistant", content },
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
      "suggest_transaction_details",
      "draft_transaction",
    ]);
    expect(names.join(" ")).not.toMatch(/sql|secret|token|create|update|delete|save/i);
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

  it("returns a drafted transaction in metadata without showing its ids to the model", async () => {
    const requests: ProviderCompletionRequest[] = [];
    const provider: AssistantProvider = {
      complete: vi.fn(
        async (_env: Bindings, request: ProviderCompletionRequest): Promise<ProviderCompletion> => {
          requests.push(structuredClone(request));
          if (requests.length === 1) return entryToolCompletion();
          return textCompletion(
            "Your PHP 250.00 Jollibee expense from GCash is ready. Review it and tap Save transaction.",
          );
        },
      ),
    };
    const orchestrator = createAssistantOrchestrator(provider, createReader());

    const answer = await orchestrator.answer(
      env,
      "tenant-1",
      [],
      "I spent 250 at Jollibee",
      identity,
      entryPolicy,
      "",
    );

    expect(answer.audit.validationStatus).toBe("passed");
    expect(answer.responseMetadata).toMatchObject({
      transactionEntry: true,
      transactionDraft: { status: "pending", amountMinor: 25_000, accountId: "account-gcash" },
    });
    expect(requests[0]?.toolChoice).toBe("required");
    expect(JSON.stringify(requests)).not.toMatch(/account-gcash|category-food/);
    expect(JSON.stringify(answer.audit.toolCalls)).not.toMatch(/account-gcash|category-food/);
  });

  it("never lets a reply claim an unconfirmed draft was saved", async () => {
    let calls = 0;
    const provider: AssistantProvider = {
      complete: vi.fn(async (): Promise<ProviderCompletion> => {
        calls += 1;
        if (calls === 1) return entryToolCompletion();
        return textCompletion("Done! I've saved your PHP 250.00 Jollibee expense.");
      }),
    };
    const orchestrator = createAssistantOrchestrator(provider, createReader());

    const answer = await orchestrator.answer(
      env,
      "tenant-1",
      [],
      "I spent 250 at Jollibee",
      identity,
      entryPolicy,
      "",
    );

    expect(answer.finishReason).toBe("deterministic");
    expect(answer.content).toBe(
      "I prepared this expense for you to review: PHP 250.00 for Jollibee (Food, GCash) on 2026-08-02. It is not saved yet. Tap Save transaction on the draft card below to add it; if you do not see the card, update the app.",
    );
    expect(answer.responseMetadata.transactionDraft?.status).toBe("pending");
  });

  it("attaches no draft to a reply that falls back to the generic refusal", async () => {
    let calls = 0;
    const provider: AssistantProvider = {
      complete: vi.fn(async (): Promise<ProviderCompletion> => {
        calls += 1;
        if (calls === 1) return entryToolCompletion();
        return textCompletion("Done! I've saved your PHP 250.00 Jollibee expense.");
      }),
    };
    const reader = createReader();
    const drafted = await reader.draftTransaction({ env, tenantId: "tenant-1" }, {} as never);
    // Markup in the stored description makes the restated draft fail validation too.
    vi.mocked(reader.draftTransaction).mockResolvedValue({
      ...drafted,
      envelope: {
        ...drafted.envelope,
        data: {
          ...(drafted.envelope.data as object),
          draft: {
            ...(drafted.envelope.data as { draft: object }).draft,
            description: "<b>Jollibee</b>",
          },
        },
      },
    });
    const orchestrator = createAssistantOrchestrator(provider, reader);

    const answer = await orchestrator.answer(
      env,
      "tenant-1",
      [],
      "I spent 250 at Jollibee",
      identity,
      entryPolicy,
      "",
    );

    expect(answer.finishReason).toBe("validation_fallback");
    expect(answer.responseMetadata.transactionDraft).toBeUndefined();
  });

  it("rejects a draft dated after today", async () => {
    await expect(
      executeAssistantToolDetailed(
        createReader(),
        { env, tenantId: "tenant-1" },
        "draft_transaction",
        JSON.stringify({
          kind: "expense",
          description: "Jollibee",
          categoryName: "Food",
          accountName: "GCash",
          date: "2026-08-03",
          amount: "250",
          currentDate: "2026-08-02",
        }),
        (name, args) => validateToolArguments(name, args, entryPolicy),
      ),
    ).rejects.toThrow("future_transaction_date");
  });

  it("lists the newest transactions when no period was asked for", async () => {
    const reader = createReader();
    const detailPolicy: AssistantTurnPolicy = { ...entryPolicy, requiredToolGroups: [] };
    const validate = (name: string, args: unknown) =>
      validateToolArguments(name, args, detailPolicy);

    await executeAssistantToolDetailed(
      reader,
      { env, tenantId: "tenant-1" },
      "list_transactions",
      "{}",
      validate,
    );
    expect(reader.listTransactions).toHaveBeenCalledWith(expect.anything(), { page: 1 });
    await expect(
      executeAssistantToolDetailed(
        reader,
        { env, tenantId: "tenant-1" },
        "list_transactions",
        JSON.stringify({ from: "2020-01-01", to: "2026-08-02" }),
        validate,
      ),
    ).rejects.toThrow("untrusted_period");
  });

  it("rejects unknown tools before reaching a financial reader", async () => {
    await expect(
      executeAssistantTool(createReader(), { env, tenantId: "tenant-1" }, "run_sql", "{}"),
    ).rejects.toThrow("not available");
  });
});
