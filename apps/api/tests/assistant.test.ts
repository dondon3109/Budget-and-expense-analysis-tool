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
import type { Bindings } from "../src/types";

const env = {
  DB: {} as D1Database,
  DEEPSEEK_MODEL: "deepseek-v4-flash",
  ASSISTANT_TIME_ZONE: "Asia/Manila",
} satisfies Bindings;

function createReader(): FinancialReader {
  return {
    getAccountBalances: vi.fn(async () => ({ netPosition: "PHP 1,000.00" })),
    getPeriodSummary: vi.fn(async (_context: FinancialReadContext, input: PeriodSummaryInput) => ({
      period: input,
      currency: "PHP",
      expenses: "PHP 12,450.00",
    })),
    getBudgetStatus: vi.fn(async () => ({})),
    listTransactions: vi.fn(async () => ({ items: [] })),
    listCategories: vi.fn(async () => ({ items: [] })),
  };
}

describe("assistant orchestration", () => {
  it("executes an allowlisted tool with the server-owned tenant", async () => {
    const requests: ProviderCompletionRequest[] = [];
    const provider: AssistantProvider = {
      complete: vi.fn(
        async (_env: Bindings, request: ProviderCompletionRequest): Promise<ProviderCompletion> => {
          requests.push({
            messages: structuredClone(request.messages),
            tools: structuredClone(request.tools),
          });
          if (requests.length === 1) {
            return {
              model: "deepseek-v4-flash",
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
                      arguments: JSON.stringify({ from: "2026-07-01", to: "2026-07-27" }),
                    },
                  },
                ],
              },
            };
          }
          return {
            model: "deepseek-v4-flash",
            finishReason: "stop",
            message: {
              role: "assistant",
              content: "You spent ₱12,450 from July 1–27.",
            },
          };
        },
      ),
    };
    const reader = createReader();
    const orchestrator = createAssistantOrchestrator(provider, reader);

    const answer = await orchestrator.answer(env, "tenant-secret", [], "How much did I spend?");

    expect(answer.content).toContain("₱12,450");
    expect(reader.getPeriodSummary).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "tenant-secret" }),
      { from: "2026-07-01", to: "2026-07-27" },
    );
    expect(JSON.stringify(requests)).not.toContain("tenant-secret");
    expect(requests[0]?.messages[0]?.role).toBe("system");
    expect(requests[0]?.messages[0]?.content).toContain("Return plain text only");
    expect(requests[1]?.messages).toContainEqual(
      expect.objectContaining({ role: "tool", tool_call_id: "call-1" }),
    );
  });

  it("retries an empty completion before returning an error", async () => {
    const requests: ProviderCompletionRequest[] = [];
    const provider: AssistantProvider = {
      complete: vi.fn(
        async (_env: Bindings, request: ProviderCompletionRequest): Promise<ProviderCompletion> => {
          requests.push(structuredClone(request));
          if (requests.length === 1) {
            return {
              model: "deepseek-v4-flash",
              finishReason: "stop",
              message: { role: "assistant", content: null },
            };
          }
          return {
            model: "deepseek-v4-flash",
            finishReason: "stop",
            message: { role: "assistant", content: "You spent ₱12,450 this month." },
          };
        },
      ),
    };
    const orchestrator = createAssistantOrchestrator(provider, createReader());

    await expect(
      orchestrator.answer(env, "tenant-1", [], "How much did I spend?"),
    ).resolves.toMatchObject({ content: "You spent ₱12,450 this month." });
    expect(requests).toHaveLength(2);
    const retryMessage = requests[1]?.messages.at(-1);
    expect(retryMessage?.role).toBe("user");
    expect(retryMessage?.content).toContain("Provide the final answer now in plain text");
  });

  it("exposes no SQL, secret, or mutation tools", () => {
    const names = assistantToolDefinitions.map((tool) => tool.function.name);
    expect(names).toEqual([
      "get_account_balances",
      "get_period_summary",
      "get_budget_status",
      "list_transactions",
      "list_categories",
    ]);
    expect(names.join(" ")).not.toMatch(/sql|secret|token|create|update|delete/i);
  });

  it("rejects unknown tools before reaching a financial reader", async () => {
    await expect(
      executeAssistantTool(createReader(), { env, tenantId: "tenant-1" }, "run_sql", "{}"),
    ).rejects.toThrow("not available");
  });
});
