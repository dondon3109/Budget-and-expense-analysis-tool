// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { AssistantAction } from "@zoption/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AssistantConversation } from "../src/components/assistant/AssistantConversation";

afterEach(cleanup);

function proposal(id: string, action: AssistantAction) {
  return {
    id,
    threadId: "thread-1",
    role: "assistant" as const,
    content: "Review the card below.",
    status: "completed" as const,
    metadata: {
      promptVersion: "expert-v4",
      compliance: { posture: "budgeting_allowed" as const, topics: [] },
      sources: [],
      assistantActionFlow: true,
      assistantAction: action,
    },
    createdAt: "2026-08-02T10:00:00.000Z",
  };
}

const goal: AssistantAction = {
  status: "pending",
  kind: "create_goal",
  summary: "Add savings goal Trip: target PHP 30,000.00 by 2027-01-31",
  input: {
    name: "Trip",
    targetAmountMinor: 3_000_000,
    currentAmountMinor: 0,
    targetDate: "2027-01-31",
    status: "active",
  },
};

describe("assistant action card", () => {
  it("applies a proposal only on the user's tap and hides it once superseded", () => {
    const onSave = vi.fn();
    const first = proposal("first", goal);
    const { rerender } = render(
      <AssistantConversation
        assistantName="Aster"
        messages={[first]}
        loading={false}
        onPrompt={() => undefined}
        actionSave={{ onSave }}
      />,
    );
    const card = screen.getByRole("region", { name: "Proposed change" });
    expect(within(card).getByText(/Add savings goal Trip/)).toBeInTheDocument();
    fireEvent.click(within(card).getByRole("button", { name: "Confirm" }));
    expect(onSave).toHaveBeenCalledWith("first");

    rerender(
      <AssistantConversation
        assistantName="Aster"
        messages={[first, proposal("second", goal)]}
        loading={false}
        onPrompt={() => undefined}
        actionSave={{ onSave }}
      />,
    );
    expect(screen.getAllByRole("button", { name: "Confirm" })).toHaveLength(1);
    expect(screen.getByText("Replaced by a newer proposal below.")).toBeInTheDocument();
  });

  it("labels a deletion as Delete and shows the result once done", () => {
    const base: AssistantAction = {
      status: "pending",
      kind: "delete_debt",
      targetId: "debt-1",
      targetName: "Visa",
      summary: "Delete debt Visa",
    };
    const { rerender } = render(
      <AssistantConversation
        assistantName="Aster"
        messages={[proposal("only", base)]}
        loading={false}
        onPrompt={() => undefined}
        actionSave={{ onSave: () => undefined }}
      />,
    );
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();

    rerender(
      <AssistantConversation
        assistantName="Aster"
        messages={[proposal("only", { ...base, status: "done" })]}
        loading={false}
        onPrompt={() => undefined}
        actionSave={{ onSave: () => undefined }}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Deleted");
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
  });
});
