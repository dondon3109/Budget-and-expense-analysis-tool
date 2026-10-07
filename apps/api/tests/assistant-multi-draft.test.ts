import type { AssistantTransactionDraft } from "@zoption/shared";
import { describe, expect, it, vi } from "vitest";

import { createAssistantOrchestrator } from "../src/assistant/orchestrator";
import type { FinancialReader } from "../src/assistant/financial-reader";
import type { AssistantProvider, ProviderCompletion } from "../src/assistant/provider";
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

const entryPolicy: AssistantTurnPolicy = {
  currentDate: "2026-08-02",
  timeZone: "Asia/Manila",
  compliance: { posture: "budgeting_allowed", topics: [] },
  requiredToolGroups: ["transaction_entry"],
};

/** A reader whose drafts echo what the model asked for, as the real one resolves them. */
function draftingReader(): FinancialReader {
  return {
    draftTransaction: vi.fn(async (_context, input) => {
      const amount = `PHP ${Number(input.amount).toFixed(2)}`;
      return {
        envelope: {
          data: {
            status: "ready",
            saved: false,
            draft: {
              kind: input.kind,
              date: input.date,
              description: input.description,
              amount,
              categoryName: "Transport",
              accountName: "Cash",
            },
          },
          source: { sourceType: "transactions" },
          dataQuality: { status: "reliable", signals: [] },
        },
        draft: {
          status: "pending",
          kind: input.kind,
          date: input.date,
          description: input.description,
          amountMinor: Math.round(Number(input.amount) * 100),
          currency: "PHP",
          categoryId: "category-transport",
          categoryName: "Transport",
          accountId: "account-cash",
          accountName: "Cash",
        },
      };
    }),
  } as unknown as FinancialReader;
}

function draftCall(id: string, description: string, amount: string, replacesPreviousDraft = false) {
  return {
    id,
    type: "function" as const,
    function: {
      name: "draft_transaction",
      arguments: JSON.stringify({
        kind: "expense",
        description,
        categoryName: "Transport",
        accountName: "Cash",
        date: "2026-08-02",
        amount,
        currentDate: "2026-08-02",
        ...(replacesPreviousDraft ? { replacesPreviousDraft } : {}),
      }),
    },
  };
}

function providerFor(toolCalls: ReturnType<typeof draftCall>[], reply: string): AssistantProvider {
  let calls = 0;
  return {
    complete: vi.fn(async (): Promise<ProviderCompletion> => {
      calls += 1;
      if (calls === 1) {
        return {
          model: "deepseek-flash",
          finishReason: "tool_calls",
          message: { role: "assistant", content: null, tool_calls: toolCalls },
        };
      }
      return {
        model: "deepseek-flash",
        finishReason: "stop",
        message: { role: "assistant", content: reply },
      };
    }),
  };
}

describe("assistant replies with several transaction drafts", () => {
  it("gives each purchase listed in one message its own draft", async () => {
    const provider = providerFor(
      [draftCall("gas", "Gas", "50"), draftCall("gym", "Gym session", "40")],
      "I prepared drafts for Gas at PHP 50.00 and Gym session at PHP 40.00. Review each and tap Save transaction.",
    );
    const orchestrator = createAssistantOrchestrator(provider, draftingReader());

    const answer = await orchestrator.answer(
      env,
      "tenant-1",
      [],
      "I spent 50 for gas today and 40 for gym session",
      identity,
      entryPolicy,
      "",
    );

    const metadata = answer.responseMetadata;
    expect(metadata.transactionDraft?.description).toBe("Gas");
    expect(metadata.transactionDraft?.transactionId).toBeUndefined();
    expect(metadata.extraTransactionDrafts).toHaveLength(1);
    expect(metadata.extraTransactionDrafts?.[0]).toMatchObject({
      description: "Gym session",
      amountMinor: 4_000,
      status: "pending",
    });
    expect(metadata.extraTransactionDrafts?.[0]?.transactionId).toBeTruthy();
  });

  it("keeps one card when the model drafts the same purchase twice in a turn", async () => {
    const provider = providerFor(
      [draftCall("first", "Gas", "50"), draftCall("again", "Gas", "60", true)],
      "I created a draft of PHP 60.00 for Gas. Review it and tap Save transaction.",
    );
    const orchestrator = createAssistantOrchestrator(provider, draftingReader());

    const answer = await orchestrator.answer(
      env,
      "tenant-1",
      [],
      "I spent 50 for gas, no wait, 60",
      identity,
      entryPolicy,
      "",
    );

    expect(answer.responseMetadata.transactionDraft?.amountMinor).toBe(6_000);
    expect(answer.responseMetadata.extraTransactionDrafts).toBeUndefined();
  });

  it("records which of several earlier drafts a correction replaces", async () => {
    const provider = providerFor(
      [draftCall("gym", "Gym session", "250", true)],
      "I've created a new draft of PHP 250.00 for Gym session. Review it and tap Save transaction.",
    );
    const earlier: AssistantTransactionDraft = {
      status: "pending",
      kind: "expense",
      date: "2026-08-02",
      description: "Gas",
      amountMinor: 5_000,
      currency: "PHP",
      categoryId: "category-transport",
      categoryName: "Transport",
      accountId: "account-cash",
      accountName: "Cash",
    };
    const earlierId = "55555555-5555-4555-8555-555555555555";
    const orchestrator = createAssistantOrchestrator(provider, draftingReader());

    const answer = await orchestrator.answer(
      env,
      "tenant-1",
      [
        { role: "user", content: "I spent 50 for gas and 40 for gym" },
        {
          id: earlierId,
          role: "assistant",
          content: "Both drafts are ready.",
          metadata: {
            promptVersion: "expert-v3",
            compliance: { posture: "budgeting_allowed", topics: [] },
            sources: [],
            transactionEntry: true,
            transactionDraft: earlier,
            extraTransactionDrafts: [
              { ...earlier, description: "Gym session", amountMinor: 4_000, transactionId: "tx-2" },
            ],
          },
        },
      ],
      "Make the gym 250",
      identity,
      entryPolicy,
      "",
    );

    expect(answer.responseMetadata.transactionDraft).toMatchObject({
      description: "Gym session",
      replacesMessageId: earlierId,
      replacesSlot: 1,
    });
  });
});
