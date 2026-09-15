import { fireEvent, render, screen } from "@testing-library/react-native";

import TransactionsScreen from "../../../app/(app)/(tabs)/transactions";
import { useLocalTransactions } from "@/db/local-workspace-state";
import type { LocalTransactionItem } from "@/db/repository";
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
