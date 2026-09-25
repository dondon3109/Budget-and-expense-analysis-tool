import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import {
  useDashboardData,
  useLocalWorkspace,
  useTransactionFormData,
} from "@/db/local-workspace-state";
import type { LocalDashboardData, TransactionFormData } from "@/db/repository";
import type { LocalWorkspace } from "@/db/workspace";
import { useDefaultSpendingAccountStore } from "@/stores/default-spending-account-store";
import { useSyncState } from "@/sync/sync-state";
import { WidgetIntentScreen } from "./WidgetIntentScreen";

// Focused guards for the review screen: the reconcile path must never compute a
// delta from a balance that has not been read yet, and the expense path must
// honour the account and category the speaker named in the transcript.

const reconcileParams = { transcript: "Reconcile BDO to 5000 pesos" };

let mockSearchParams: Record<string, string> = { ...reconcileParams };

jest.mock("expo-router", () => ({
  router: {
    replace: jest.fn(),
    push: jest.fn(),
    back: jest.fn(),
    canGoBack: jest.fn().mockReturnValue(true),
  },
  useLocalSearchParams: () => mockSearchParams,
}));

jest.mock("@/db/local-workspace-state", () => ({
  useLocalWorkspace: jest.fn(),
  useTransactionFormData: jest.fn(),
  useDashboardData: jest.fn(),
}));

jest.mock("@/sync/sync-state", () => ({
  useSyncState: jest.fn(),
}));

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

const createTransaction = jest.fn().mockResolvedValue("txn-1");

function formData(): TransactionFormData {
  return {
    accounts: [{ id: "a-bdo", name: "BDO", type: "checking", currency: "PHP", pending: false }],
    categories: [
      {
        id: "c-uncat",
        name: "Uncategorized",
        kind: "income",
        color: "#0f6b5b",
        iconEmoji: null,
        pending: false,
      },
    ],
    transaction: null,
    unavailableReason: null,
  };
}

// Mirrors the reporter's device: the spoken account and category only exist as
// local records, never in the native intent JSON.
function expenseFormData(): TransactionFormData {
  return {
    accounts: [
      { id: "a-bank", name: "Bank", type: "checking", currency: "PHP", pending: false },
      { id: "a-cash", name: "Cash", type: "cash", currency: "PHP", pending: false },
      { id: "a-gcash", name: "GCash", type: "other", currency: "PHP", pending: false },
    ],
    categories: [
      {
        id: "c-food",
        name: "Food & dining",
        kind: "expense",
        color: "#F59E0B",
        iconEmoji: null,
        pending: false,
      },
      {
        id: "c-uncat",
        name: "Uncategorized",
        kind: "expense",
        color: "#64748B",
        iconEmoji: null,
        pending: false,
      },
      {
        id: "c-salary",
        name: "Salary",
        kind: "income",
        color: "#0f6b5b",
        iconEmoji: null,
        pending: false,
      },
    ],
    transaction: null,
    unavailableReason: null,
  };
}

function dashboardWithBalance(balanceMinor: number | null): LocalDashboardData {
  return {
    transactions: [],
    recentTransactions: [],
    budgets: [],
    accounts: [
      {
        id: "a-bdo",
        name: "BDO",
        type: "checking",
        currency: "PHP",
        balanceMinor,
        archived: false,
      },
    ],
  };
}

describe("WidgetIntentScreen reconcile review", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = { ...reconcileParams };
    jest
      .mocked(useSyncState)
      .mockReturnValue({ status: "synced", message: null, retry: jest.fn() });
    jest.mocked(useLocalWorkspace).mockReturnValue({
      workspace: { transactionMutations: { createTransaction } } as unknown as LocalWorkspace,
      status: "ready",
      message: null,
      retry: jest.fn(),
      reopen: jest.fn(),
    });
    jest.mocked(useTransactionFormData).mockReturnValue({
      data: formData(),
      error: null,
      retry: jest.fn(),
    });
  });

  it("will not book a balance update before the current balance is known", async () => {
    jest.mocked(useDashboardData).mockReturnValue({ data: null, error: null, retry: jest.fn() });

    await render(<WidgetIntentScreen />);

    const button = screen.getByRole("button", { name: "Update balance" });
    expect(button).toBeDisabled();
    expect(screen.getByText("Reading the current balance from encrypted storage…")).toBeTruthy();

    await fireEvent.press(button);
    await waitFor(() => expect(createTransaction).not.toHaveBeenCalled());
  });

  it("books only the delta once a late balance read lands", async () => {
    // First paint: accounts are readable but the dashboard read has not settled.
    jest.mocked(useDashboardData).mockReturnValue({ data: null, error: null, retry: jest.fn() });
    const view = await render(<WidgetIntentScreen />);
    expect(screen.getByRole("button", { name: "Update balance" })).toBeDisabled();

    // The dashboard read lands with the account already holding 3,000.00.
    jest
      .mocked(useDashboardData)
      .mockReturnValue({ data: dashboardWithBalance(300000), error: null, retry: jest.fn() });
    await view.rerender(<WidgetIntentScreen />);

    const button = screen.getByRole("button", { name: "Update balance" });
    expect(button).not.toBeDisabled();

    await fireEvent.press(button);
    await waitFor(() => expect(createTransaction).toHaveBeenCalledTimes(1));
    expect(createTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "income", accountId: "a-bdo", amountMinor: 200000 }),
    );
  });

  it("surfaces a retry when the balance read fails", async () => {
    const retry = jest.fn();
    jest.mocked(useDashboardData).mockReturnValue({
      data: null,
      error: "Dashboard data could not be read from encrypted local storage.",
      retry,
    });

    await render(<WidgetIntentScreen />);

    expect(
      screen.getByText("Dashboard data could not be read from encrypted local storage."),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Update balance" })).toBeDisabled();

    await fireEvent.press(screen.getByRole("button", { name: "Retry balance" }));
    expect(retry).toHaveBeenCalled();
  });
});

describe("WidgetIntentScreen expense review", () => {
  const transcript = "I have spent 500 pesos for dinner today using cash";

  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = { transcript };
    useDefaultSpendingAccountStore.setState({ accountId: null });
    jest
      .mocked(useSyncState)
      .mockReturnValue({ status: "synced", message: null, retry: jest.fn() });
    jest.mocked(useLocalWorkspace).mockReturnValue({
      workspace: { transactionMutations: { createTransaction } } as unknown as LocalWorkspace,
      status: "ready",
      message: null,
      retry: jest.fn(),
      reopen: jest.fn(),
    });
    jest
      .mocked(useTransactionFormData)
      .mockReturnValue({ data: expenseFormData(), error: null, retry: jest.fn() });
    jest.mocked(useDashboardData).mockReturnValue({ data: null, error: null, retry: jest.fn() });
  });

  it("selects the account and category the speaker named", async () => {
    await render(<WidgetIntentScreen />);

    expect(screen.getByText("Confirm expense")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Account, Cash, PHP" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Category, Food & dining" })).toBeTruthy();
  });

  it("summarizes the raw merchant into a concise description", async () => {
    await render(<WidgetIntentScreen />);

    expect(screen.getByDisplayValue("Dinner")).toBeTruthy();
  });

  it("displays the voice note transcript banner when speech was heard", async () => {
    await render(<WidgetIntentScreen />);

    expect(screen.getByText("Voice note heard")).toBeTruthy();
    expect(screen.getByText("“I have spent 500 pesos for dinner today using cash”")).toBeTruthy();
  });

  it("renders a cancel button to dismiss the confirmation", async () => {
    await render(<WidgetIntentScreen />);

    const cancelButton = screen.getByRole("button", { name: "Cancel" });
    expect(cancelButton).toBeTruthy();
    await fireEvent.press(cancelButton);
  });

  it("falls back to Cash and Uncategorized when nothing matches", async () => {
    mockSearchParams = { transcript: "spent 150 pesos on misc" };

    await render(<WidgetIntentScreen />);

    expect(screen.getByRole("button", { name: "Account, Cash, PHP" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Category, Uncategorized" })).toBeTruthy();
  });

  it("starts an unnamed account on the default spending account", async () => {
    mockSearchParams = { transcript: "spent 150 pesos on misc" };
    useDefaultSpendingAccountStore.setState({ accountId: "a-gcash" });

    await render(<WidgetIntentScreen />);

    expect(screen.getByRole("button", { name: "Account, GCash, PHP" })).toBeTruthy();
  });

  it("still honours an account the speaker named over the default", async () => {
    useDefaultSpendingAccountStore.setState({ accountId: "a-gcash" });

    await render(<WidgetIntentScreen />);

    expect(screen.getByRole("button", { name: "Account, Cash, PHP" })).toBeTruthy();
  });
  it("saves a spoken income as income", async () => {
    mockSearchParams = { transcript: "Received 20,000 pesos salary to my GCash" };

    await render(<WidgetIntentScreen />);

    expect(screen.getByText("Confirm income")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Deposit to, GCash, PHP" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Category, Salary" })).toBeTruthy();

    await fireEvent.press(screen.getByRole("button", { name: "Save income" }));
    await waitFor(() => expect(createTransaction).toHaveBeenCalledTimes(1));
    expect(createTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "income",
        accountId: "a-gcash",
        categoryId: "c-salary",
        amountMinor: 2_000_000,
        description: "Salary",
      }),
    );
  });

  it("lets the user flip a misheard expense to income", async () => {
    await render(<WidgetIntentScreen />);

    await fireEvent.press(screen.getByRole("radio", { name: "Income" }));

    expect(screen.getByText("Confirm income")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Category, Salary" })).toBeTruthy();
  });
});

describe("WidgetIntentScreen adjustable reconcile", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = { ...reconcileParams };
    jest
      .mocked(useSyncState)
      .mockReturnValue({ status: "synced", message: null, retry: jest.fn() });
    jest.mocked(useLocalWorkspace).mockReturnValue({
      workspace: { transactionMutations: { createTransaction } } as unknown as LocalWorkspace,
      status: "ready",
      message: null,
      retry: jest.fn(),
      reopen: jest.fn(),
    });
    jest.mocked(useTransactionFormData).mockReturnValue({
      data: formData(),
      error: null,
      retry: jest.fn(),
    });
    jest
      .mocked(useDashboardData)
      .mockReturnValue({ data: dashboardWithBalance(300000), error: null, retry: jest.fn() });
  });

  it("allows the user to edit the target balance before updating", async () => {
    await render(<WidgetIntentScreen />);

    const input = screen.getByDisplayValue("5000.00");
    expect(input).toBeTruthy();

    // Change target balance to 6,000.00
    await fireEvent.changeText(input, "6000");

    const updateButton = screen.getByRole("button", { name: "Update balance" });
    await fireEvent.press(updateButton);

    await waitFor(() => expect(createTransaction).toHaveBeenCalledTimes(1));
    expect(createTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "income",
        accountId: "a-bdo",
        amountMinor: 300000, // 6,000.00 - 3,000.00 = 3,000.00 delta
      }),
    );
  });
});
