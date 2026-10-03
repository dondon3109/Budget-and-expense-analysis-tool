import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { confirmAssistantAction, type AssistantWireMessage } from "@/api/assistant";

import { AssistantMessageRow } from "./AssistantMessageRow";
import { latestActionMessageId } from "./AssistantActionCard";

const mockRetry = jest.fn();

jest.mock("@/auth/session-state", () => {
  const session = { getAccessToken: jest.fn().mockResolvedValue("access-token") };
  return { useSessionSnapshot: () => session };
});

jest.mock("@/sync/sync-state", () => ({ useSyncState: () => ({ retry: mockRetry }) }));

jest.mock("@/api/assistant", () => ({
  confirmAssistantAction: jest.fn(),
  confirmAssistantTransactionDraft: jest.fn(),
}));

const action = {
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

const message: AssistantWireMessage = {
  id: "11111111-1111-4111-8111-111111111111",
  threadId: "22222222-2222-4222-8222-222222222222",
  role: "assistant",
  content: "Review the card below.",
  status: "completed",
  metadata: { sources: [], assistantActionFlow: true, assistantAction: action },
  createdAt: "2026-08-02T10:00:00.000Z",
};

describe("AssistantActionCard", () => {
  beforeEach(() => {
    jest.mocked(confirmAssistantAction).mockReset();
    mockRetry.mockReset();
  });

  it("applies the proposal on tap and pulls the result into the local workspace", async () => {
    const done = {
      ...message,
      metadata: { ...message.metadata, assistantAction: { ...action, status: "done" } },
    };
    jest.mocked(confirmAssistantAction).mockResolvedValue(done);
    const onDraftSaved = jest.fn();

    await render(
      <AssistantMessageRow
        message={message}
        latestActionId={message.id}
        onDraftSaved={onDraftSaved}
      />,
    );
    expect(screen.getByText(/Add savings goal Trip/)).toBeTruthy();
    await fireEvent.press(screen.getByText("Confirm"));

    await waitFor(() => expect(onDraftSaved).toHaveBeenCalledWith(done));
    expect(confirmAssistantAction).toHaveBeenCalledWith(
      { accessToken: "access-token" },
      message.id,
    );
    expect(mockRetry).toHaveBeenCalled();
  });

  it("offers no button once replaced, and Delete for a deletion", async () => {
    await render(
      <AssistantMessageRow message={message} latestActionId="another" onDraftSaved={jest.fn()} />,
    );
    expect(screen.queryByText("Confirm")).toBeNull();
    expect(screen.getByText("Replaced by a newer proposal below.")).toBeTruthy();

    await render(
      <AssistantMessageRow
        message={{
          ...message,
          id: "33333333-3333-4333-8333-333333333333",
          metadata: {
            assistantAction: {
              status: "pending",
              kind: "delete_debt",
              targetId: "debt-1",
              targetName: "Visa",
              summary: "Delete debt Visa",
            },
          },
        }}
        latestActionId="33333333-3333-4333-8333-333333333333"
        onDraftSaved={jest.fn()}
      />,
    );
    expect(screen.getByText("Delete")).toBeTruthy();
  });

  it("finds the newest proposal in a chat", () => {
    const later = { ...message, id: "later" };
    expect(latestActionMessageId([message, later, { ...message, id: "plain", metadata: {} }])).toBe(
      "later",
    );
  });
});
