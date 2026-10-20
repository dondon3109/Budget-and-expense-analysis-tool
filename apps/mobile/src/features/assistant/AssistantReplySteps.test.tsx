import { fireEvent, render, screen } from "@testing-library/react-native";

import type { AssistantWireMessage } from "@/api/assistant";

import { AssistantReplySteps, replySteps, replyThoughtSeconds } from "./AssistantReplySteps";

function message(
  role: "user" | "assistant",
  createdAt: string,
  metadata?: Record<string, unknown>,
): AssistantWireMessage {
  return {
    id: role + "-" + createdAt,
    threadId: "thread-1",
    role,
    content: "text",
    status: "completed",
    createdAt,
    ...(metadata ? { metadata } : {}),
  };
}

describe("replyThoughtSeconds", () => {
  it("times each reply from the question before it and skips gaps that were not one turn", () => {
    const seconds = replyThoughtSeconds([
      message("user", "2026-10-20T10:00:00.000Z"),
      message("assistant", "2026-10-20T10:00:08.400Z"),
      message("user", "2026-10-20T10:05:00.000Z"),
      message("assistant", "2026-10-20T11:05:00.000Z"),
    ]);
    expect(seconds.get("assistant-2026-10-20T10:00:08.400Z")).toBe(8);
    expect(seconds.has("assistant-2026-10-20T11:05:00.000Z")).toBe(false);
  });
});

describe("replySteps", () => {
  it("turns the reply's sources into labelled steps", () => {
    const steps = replySteps(
      message("assistant", "2026-10-20T10:00:08.000Z", {
        sources: [
          {
            label: "Spending by category",
            sourceType: "transactions",
            period: { label: "October 2026" },
            recordCount: 42,
          },
          { label: "Budget versus actual", sourceType: "budgets" },
          { sourceType: "accounts" },
        ],
      }),
    );
    expect(steps).toEqual([
      {
        label: "Spending by category",
        detail: "October 2026 · 42 records",
        icon: "swap-horizontal",
      },
      { label: "Budget versus actual", icon: "chart-donut" },
    ]);
  });
});

describe("AssistantReplySteps", () => {
  it("opens to the records checked when the summary is tapped", async () => {
    await render(
      <AssistantReplySteps
        steps={[{ label: "Spending by category", icon: "swap-horizontal" }]}
        thoughtSeconds={8}
      />,
    );
    expect(screen.queryByText("Spending by category")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: /Thought for 8 seconds/ }));
    expect(screen.getByText("Spending by category")).toBeTruthy();
  });
});
