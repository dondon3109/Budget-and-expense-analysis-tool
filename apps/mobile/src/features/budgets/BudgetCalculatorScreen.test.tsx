import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { useAccountBalances, useBudgetPlan, useLocalWorkspace } from "@/db/local-workspace-state";
import type { LocalWorkspace } from "@/db/workspace";
import { useSyncState } from "@/sync/sync-state";

import { BudgetCalculatorScreen } from "./BudgetCalculatorScreen";

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ scope: "month", month: "2026-07-01" }),
}));

jest.mock("@/db/local-workspace-state", () => ({
  useAccountBalances: jest.fn(),
  useBudgetPlan: jest.fn(),
  useLocalWorkspace: jest.fn(),
}));

jest.mock("@/features/family/active-workspace", () => ({
  useActiveWorkspace: () => ({ family: null, writable: true }),
}));

jest.mock("@/sync/sync-state", () => ({
  useSyncState: jest.fn(),
}));

const CATEGORIES = [
  {
    id: "housing",
    name: "Housing",
    kind: "expense" as const,
    color: "#008300",
    iconEmoji: "🏠",
    pending: false,
  },
  {
    id: "food",
    name: "Food & dining",
    kind: "expense" as const,
    color: "#e87ba4",
    iconEmoji: "🍔",
    pending: false,
  },
  {
    id: "leisure",
    name: "Leisure",
    kind: "expense" as const,
    color: "#eb6834",
    iconEmoji: "🎁",
    pending: false,
  },
];

describe("BudgetCalculatorScreen", () => {
  const setBudgetLimits = jest.fn().mockResolvedValue(undefined);
  const retrySync = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(useSyncState).mockReturnValue({
      status: "synced",
      message: null,
      retry: retrySync,
    });
    jest.mocked(useLocalWorkspace).mockReturnValue({
      workspace: {
        transactionMutations: { setBudgetLimits },
      } as unknown as LocalWorkspace,
      status: "ready",
      message: null,
      retry: jest.fn(),
      reopen: jest.fn(),
    });
    jest.mocked(useBudgetPlan).mockReturnValue({
      data: { budgets: [], categories: CATEGORIES, event: null },
      error: null,
      retry: jest.fn(),
    });
    jest.mocked(useAccountBalances).mockReturnValue({
      accounts: [
        {
          id: "acc-bank",
          name: "Payroll",
          type: "checking",
          currency: "PHP",
          balanceMinor: 3_000_000,
          balancesByCurrency: { PHP: 3_000_000 },
          archived: false,
        },
        {
          id: "acc-usd",
          name: "USD Wallet",
          type: "savings",
          currency: "USD",
          balanceMinor: 100_000,
          balancesByCurrency: { USD: 100_000 },
          archived: false,
        },
        {
          id: "acc-zero",
          name: "Empty Cash",
          type: "cash",
          currency: "PHP",
          balanceMinor: 0,
          balancesByCurrency: { PHP: 0 },
          archived: false,
        },
      ],
      error: null,
      retry: jest.fn(),
    });
  });

  it("auto-splits a selected account balance and applies exact limits to existing categories", async () => {
    await render(<BudgetCalculatorScreen />);

    await fireEvent.press(screen.getByRole("button", { name: /Payroll/ }));
    expect(screen.getByText("₱15,000.00")).toBeTruthy();
    expect(screen.getByText("₱9,000.00")).toBeTruthy();
    expect(screen.getByText("₱6,000.00")).toBeTruthy();

    await fireEvent.press(screen.getByRole("button", { name: "Housing: Needs" }));
    await fireEvent.press(screen.getByRole("button", { name: "Food & dining: Needs" }));
    await fireEvent.press(screen.getByRole("button", { name: "Leisure: Wants" }));

    await fireEvent.press(screen.getByRole("button", { name: "Apply to July 2026" }));

    await waitFor(() =>
      expect(setBudgetLimits).toHaveBeenCalledWith({ scope: "month", month: "2026-07-01" }, [
        { categoryId: "housing", limitMinor: 750_000 },
        { categoryId: "food", limitMinor: 750_000 },
        { categoryId: "leisure", limitMinor: 900_000 },
      ]),
    );
    expect(retrySync).toHaveBeenCalled();
    expect(screen.getByText(/Applied 3 category limits to July 2026/)).toBeTruthy();
  });

  it("explains a negative take-home amount instead of crashing", async () => {
    await render(<BudgetCalculatorScreen />);

    await fireEvent.changeText(screen.getByLabelText(/Monthly take-home pay/), "-500");
    expect(screen.getByText("Enter an amount of zero or more.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Apply to July 2026" })).toBeDisabled();
  });

  it("explains a category limit above the supported maximum instead of saving it", async () => {
    await render(<BudgetCalculatorScreen />);

    await fireEvent.changeText(screen.getByLabelText(/Monthly take-home pay/), "3000000000");
    await fireEvent.press(screen.getByRole("button", { name: "Housing: Needs" }));
    await fireEvent.press(screen.getByRole("button", { name: "Apply to July 2026" }));

    expect(screen.getByText(/A category limit is above the supported limit/)).toBeTruthy();
    expect(setBudgetLimits).not.toHaveBeenCalled();
  });

  it("blocks apply on currency mismatch and explains zero-balance accounts", async () => {
    await render(<BudgetCalculatorScreen />);

    await fireEvent.press(screen.getByRole("button", { name: /Empty Cash/ }));
    expect(screen.getByText(/zero balance/i)).toBeTruthy();

    await fireEvent.press(screen.getByRole("button", { name: /USD Wallet/ }));
    expect(screen.getByText("$500.00")).toBeTruthy();
    expect(screen.getByText(/Budgets use PHP/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Apply to July 2026" })).toBeDisabled();
  });
});
