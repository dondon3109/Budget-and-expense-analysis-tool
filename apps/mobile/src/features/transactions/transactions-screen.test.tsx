import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";

import { TransactionsScreen } from "./TransactionsScreen";
import { useLocalTransactions, useLocalWorkspace } from "@/db/local-workspace-state";
import type { LocalTransactionItem } from "@/db/view-models";
import { useSyncState } from "@/sync/sync-state";

jest.mock("expo-router", () => ({
  router: {
    push: jest.fn(),
    replace: jest.fn(),
  },
}));

jest.mock("@react-native-community/netinfo", () => ({
  addEventListener: jest.fn(() => () => undefined),
  fetch: jest.fn(async () => ({ isInternetReachable: true, isConnected: true })),
  useNetInfo: () => ({ isInternetReachable: true, isConnected: true }),
}));

jest.mock("@/db/local-workspace-state", () => ({
  useLocalTransactions: jest.fn(),
  useLocalWorkspace: jest.fn(),
}));

jest.mock("@/telemetry/telemetry", () => ({
  telemetry: { capture: jest.fn() },
}));

jest.mock("@/sync/sync-state", () => ({
  useSyncState: jest.fn(),
}));

function item(
  id: string,
  amountMinor: number,
  kind: LocalTransactionItem["transaction"]["kind"],
): LocalTransactionItem {
  return {
    syncState: "synced",
    transaction: {
      id,
      date: "2026-09-15",
      description: id,
      amountMinor,
      currency: "PHP",
      kind,
      categoryId: "category-1",
      categoryName: "Category",
      categoryColor: "#123456",
      accountId: "account-1",
      accountName: "Cash",
      notes: null,
    },
  };
}

describe("TransactionsScreen month totals", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest
      .mocked(useLocalWorkspace)
      .mockReturnValue({ workspace: null } as ReturnType<typeof useLocalWorkspace>);
    jest.mocked(useSyncState).mockReturnValue({
      status: "synced",
      message: null,
      retry: jest.fn(),
    });
    jest.mocked(useLocalTransactions).mockReturnValue({
      items: [
        item("salary", 130_000, "income"),
        item("balance-adjustment-for-cash", -120_200, "expense"),
        item("session-and-wifi", -4_000, "expense"),
      ],
      error: null,
      retry: jest.fn(),
    });
  });

  it("names the month figure Net rather than Balance", async () => {
    await render(<TransactionsScreen />);

    expect(screen.getByText("Net")).toBeTruthy();
    expect(screen.queryByText("Balance")).toBeNull();
  });

  it("explains Net and how it differs from the account balance", async () => {
    await render(<TransactionsScreen />);

    expect(screen.queryByText(/Total Balance on Home/)).toBeNull();

    await fireEvent.press(screen.getByRole("button", { name: "What is Net?" }));

    expect(screen.getByText(/income minus expenses/)).toBeTruthy();
    expect(screen.getByText(/Total Balance on Home/)).toBeTruthy();
    expect(screen.getByText(/balance adjustment counts as income or an expense/i)).toBeTruthy();
  });
});

describe("TransactionsScreen select mode", () => {
  const deleteTransaction = jest.fn();
  const retry = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    deleteTransaction.mockResolvedValue(undefined);
    jest.mocked(useSyncState).mockReturnValue({ status: "synced", message: null, retry });
    jest.mocked(useLocalWorkspace).mockReturnValue({
      workspace: { transactionMutations: { deleteTransaction } },
    } as unknown as ReturnType<typeof useLocalWorkspace>);
    jest.mocked(useLocalTransactions).mockReturnValue({
      items: [item("salary", 130_000, "income"), item("coffee", -4_000, "expense")],
      error: null,
      retry: jest.fn(),
    });
  });

  it("long press starts select mode, and taps toggle instead of opening", async () => {
    await render(<TransactionsScreen />);
    expect(screen.getByRole("button", { name: "Add transaction" })).toBeTruthy();

    await fireEvent(screen.getByRole("button", { name: /^salary,/ }), "longPress");
    expect(screen.getByText("1 selected")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add transaction" })).toBeNull();

    await fireEvent.press(screen.getByRole("checkbox", { name: /^coffee,/ }));
    expect(screen.getByText("2 selected")).toBeTruthy();
    expect(router.push).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole("checkbox", { name: /^coffee,/ }));
    await fireEvent.press(screen.getByRole("checkbox", { name: /^salary,/ }));
    expect(screen.queryByText(/selected$/)).toBeNull();
    expect(screen.getByRole("button", { name: "Add transaction" })).toBeTruthy();
  });

  it("deletes the selection after confirming", async () => {
    await render(<TransactionsScreen />);
    await fireEvent(screen.getByRole("button", { name: /^salary,/ }), "longPress");
    await fireEvent.press(screen.getByRole("checkbox", { name: /^coffee,/ }));
    await fireEvent.press(screen.getByRole("button", { name: "Delete 2 selected" }));
    expect(deleteTransaction).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(deleteTransaction).toHaveBeenCalledTimes(2));
    expect(deleteTransaction).toHaveBeenCalledWith("salary");
    expect(deleteTransaction).toHaveBeenCalledWith("coffee");
    await waitFor(() => expect(retry).toHaveBeenCalled());
  });

  it("keeps the failed rows selected and shows the error", async () => {
    deleteTransaction.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("Blocked"));
    await render(<TransactionsScreen />);
    await fireEvent(screen.getByRole("button", { name: /^salary,/ }), "longPress");
    await fireEvent.press(screen.getByRole("checkbox", { name: /^coffee,/ }));
    await fireEvent.press(screen.getByRole("button", { name: "Delete 2 selected" }));
    await fireEvent.press(screen.getByRole("button", { name: "Delete" }));

    expect(await screen.findByText("Blocked")).toBeTruthy();
    expect(screen.getByText("1 selected")).toBeTruthy();
  });
});
