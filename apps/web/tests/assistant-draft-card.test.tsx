// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AssistantConversation } from "../src/components/assistant/AssistantConversation";

afterEach(cleanup);

describe("assistant transaction draft card", () => {
  it("offers a drafted transaction for review and saves it only on the user's tap", () => {
    const onSave = vi.fn();
    const draftMessage = {
      id: "assistant-draft",
      threadId: "thread-1",
      role: "assistant" as const,
      content: "Your PHP 250.00 Jollibee expense is ready. Tap Save transaction.",
      status: "completed" as const,
      metadata: {
        promptVersion: "expert-v3",
        compliance: { posture: "budgeting_allowed" as const, topics: [] },
        sources: [],
        transactionEntry: true,
        transactionDraft: {
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
      },
      createdAt: "2026-08-02T10:00:00.000Z",
    };
    const { rerender } = render(
      <AssistantConversation
        assistantName="Aster"
        messages={[draftMessage]}
        loading={false}
        onPrompt={() => undefined}
        draftSave={{ onSave }}
      />,
    );

    const draft = screen.getByRole("region", { name: "Transaction draft" });
    expect(within(draft).getByText("GCash")).toBeInTheDocument();
    expect(within(draft).getByText(/Not saved yet/)).toBeInTheDocument();
    fireEvent.click(within(draft).getByRole("button", { name: "Save transaction" }));
    expect(onSave).toHaveBeenCalledWith("assistant-draft");

    rerender(
      <AssistantConversation
        assistantName="Aster"
        messages={[
          {
            ...draftMessage,
            metadata: {
              ...draftMessage.metadata,
              transactionDraft: {
                ...draftMessage.metadata.transactionDraft,
                status: "saved" as const,
                transactionId: "transaction-1",
              },
            },
          },
        ]}
        loading={false}
        onPrompt={() => undefined}
        draftSave={{ onSave }}
      />,
    );
    expect(screen.getByText("Saved to your transactions")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save transaction" })).not.toBeInTheDocument();
  });

  it("retires a draft a later correction replaced and keeps only the correction saveable", () => {
    const draftMetadata = {
      promptVersion: "expert-v3",
      compliance: { posture: "budgeting_allowed" as const, topics: [] },
      sources: [],
      transactionEntry: true,
    };
    const draft = {
      status: "pending" as const,
      kind: "expense" as const,
      date: "2026-08-02",
      description: "Jollibee",
      amountMinor: 20_000,
      currency: "PHP" as const,
      categoryId: "category-food",
      categoryName: "Food",
      accountId: "account-gcash",
      accountName: "GCash",
    };
    const onSave = vi.fn();
    render(
      <AssistantConversation
        assistantName="Aster"
        messages={[
          {
            id: "11111111-1111-4111-8111-111111111111",
            threadId: "thread-1",
            role: "assistant",
            content: "Your PHP 200.00 Jollibee expense is ready.",
            status: "completed",
            metadata: { ...draftMetadata, transactionDraft: draft },
            createdAt: "2026-08-02T10:00:00.000Z",
          },
          {
            id: "33333333-3333-4333-8333-333333333333",
            threadId: "thread-1",
            role: "assistant",
            content: "Updated to PHP 250.00.",
            status: "completed",
            metadata: {
              ...draftMetadata,
              transactionDraft: {
                ...draft,
                amountMinor: 25_000,
                replacesMessageId: "11111111-1111-4111-8111-111111111111",
              },
            },
            createdAt: "2026-08-02T10:01:00.000Z",
          },
        ]}
        loading={false}
        onPrompt={() => undefined}
        draftSave={{ onSave }}
      />,
    );

    const [original, correction] = screen.getAllByRole("region", { name: "Transaction draft" });
    expect(within(original!).getByText("Replaced by a newer draft below.")).toBeInTheDocument();
    expect(
      within(original!).queryByRole("button", { name: "Save transaction" }),
    ).not.toBeInTheDocument();
    fireEvent.click(within(correction!).getByRole("button", { name: "Save transaction" }));
    expect(onSave).toHaveBeenCalledWith("33333333-3333-4333-8333-333333333333");
  });
});
