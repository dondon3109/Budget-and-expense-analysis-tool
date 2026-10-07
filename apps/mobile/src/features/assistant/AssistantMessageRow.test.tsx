import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { confirmAssistantTransactionDraft, type AssistantWireMessage } from "@/api/assistant";

import { AssistantMessageRow, replacedDraftKeys } from "./AssistantMessageRow";

const mockRetry = jest.fn();

jest.mock("@/auth/session-state", () => {
  const session = { getAccessToken: jest.fn().mockResolvedValue("access-token") };
  return { useSessionSnapshot: () => session };
});

jest.mock("@/sync/sync-state", () => ({ useSyncState: () => ({ retry: mockRetry }) }));

jest.mock("@/api/assistant", () => ({
  confirmAssistantTransactionDraft: jest.fn(),
}));

const draft = {
  status: "pending",
  kind: "expense",
  date: "2026-08-02",
  description: "Jollibee",
  amountMinor: 25_000,
  currency: "PHP",
  categoryId: "category-food",
  categoryName: "Food",
  accountId: "account-gcash",
  accountName: "GCash",
};

const message: AssistantWireMessage = {
  id: "11111111-1111-4111-8111-111111111111",
  threadId: "22222222-2222-4222-8222-222222222222",
  role: "assistant",
  content: "Your Jollibee expense is ready. Tap Save transaction.",
  status: "completed",
  metadata: { sources: [], transactionEntry: true, transactionDraft: draft },
  createdAt: "2026-08-02T10:00:00.000Z",
};

describe("AssistantMessageRow", () => {
  beforeEach(() => {
    jest.mocked(confirmAssistantTransactionDraft).mockReset();
    mockRetry.mockReset();
  });

  it("saves a drafted transaction on tap and pulls it into the local workspace", async () => {
    const saved = {
      ...message,
      metadata: {
        ...message.metadata,
        transactionDraft: { ...draft, status: "saved", transactionId: "transaction-1" },
      },
    };
    jest.mocked(confirmAssistantTransactionDraft).mockResolvedValue(saved);
    const onDraftSaved = jest.fn();

    await render(<AssistantMessageRow message={message} onDraftSaved={onDraftSaved} />);
    expect(screen.getByText("GCash")).toBeTruthy();
    await fireEvent.press(screen.getByText("Save transaction"));

    await waitFor(() => expect(onDraftSaved).toHaveBeenCalledWith(saved));
    expect(confirmAssistantTransactionDraft).toHaveBeenCalledWith(
      { accessToken: "access-token" },
      message.id,
      0,
    );
    expect(mockRetry).toHaveBeenCalled();
  });

  it("shows a card per draft and saves the one that was tapped", async () => {
    const gym = { ...draft, description: "Gym session", amountMinor: 4_000, transactionId: "t-2" };
    const two: AssistantWireMessage = {
      ...message,
      metadata: { transactionEntry: true, transactionDraft: draft, extraTransactionDrafts: [gym] },
    };
    jest.mocked(confirmAssistantTransactionDraft).mockResolvedValue(two);

    await render(<AssistantMessageRow message={two} onDraftSaved={jest.fn()} />);
    expect(screen.getAllByLabelText("Transaction draft")).toHaveLength(2);
    expect(screen.getByText("Gym session")).toBeTruthy();
    await fireEvent.press(screen.getAllByText("Save transaction")[1]!);

    await waitFor(() =>
      expect(confirmAssistantTransactionDraft).toHaveBeenCalledWith(
        { accessToken: "access-token" },
        message.id,
        1,
      ),
    );
  });

  it("shows a saved draft without a save button", async () => {
    await render(
      <AssistantMessageRow
        message={{
          ...message,
          metadata: { transactionDraft: { ...draft, status: "saved", transactionId: "t-1" } },
        }}
        onDraftSaved={jest.fn()}
      />,
    );
    expect(screen.getByText("Saved to your transactions")).toBeTruthy();
    expect(screen.queryByText("Save transaction")).toBeNull();
  });

  it("retires a draft a later correction replaced", async () => {
    const correction: AssistantWireMessage = {
      ...message,
      id: "33333333-3333-4333-8333-333333333333",
      metadata: {
        transactionDraft: { ...draft, amountMinor: 30_000, replacesMessageId: message.id },
      },
    };
    const replaced = replacedDraftKeys([message, correction]);
    expect([...replaced]).toEqual([message.id + ":0"]);

    await render(
      <AssistantMessageRow message={message} replacedDrafts={replaced} onDraftSaved={jest.fn()} />,
    );
    expect(screen.getByText("Replaced by a newer draft below.")).toBeTruthy();
    expect(screen.queryByText("Save transaction")).toBeNull();
  });

  it("renders a plain reply without a draft card", async () => {
    await render(
      <AssistantMessageRow
        message={{ ...message, metadata: undefined }}
        onDraftSaved={jest.fn()}
      />,
    );
    expect(screen.queryByLabelText("Transaction draft")).toBeNull();
  });
});
