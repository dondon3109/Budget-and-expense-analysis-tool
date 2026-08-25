import { fireEvent, render, screen } from "@testing-library/react-native";

import { useBudgetMonth, useLocalWorkspace } from "@/db/local-workspace-state";
import type { LocalWorkspace } from "@/db/workspace";
import { useSyncState } from "@/sync/sync-state";
import { BudgetsScreen } from "./BudgetsScreen";

jest.mock("expo-router", () => ({
  router: {
    push: jest.fn(),
  },
}));

jest.mock("@react-native-community/netinfo", () => ({
  addEventListener: jest.fn(() => () => undefined),
  fetch: jest.fn(async () => ({ isInternetReachable: true, isConnected: true })),
  useNetInfo: () => ({ isInternetReachable: true, isConnected: true }),
}));

jest.mock("@/db/local-workspace-state", () => ({
  useLocalWorkspace: jest.fn(),
  useBudgetMonth: jest.fn(),
}));

jest.mock("@/sync/sync-state", () => ({
  useSyncState: jest.fn(),
}));

describe("BudgetsScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(useSyncState).mockReturnValue({
      status: "synced",
      message: null,
      retry: jest.fn(),
    });
    jest.mocked(useLocalWorkspace).mockReturnValue({
      workspace: {
        transactionMutations: {
          setBudgetLimit: jest.fn().mockResolvedValue(undefined),
        },
      } as unknown as LocalWorkspace,
      status: "ready",
      message: null,
      retry: jest.fn(),
      reopen: jest.fn(),
    });
  });

  it("renders zero-budget view with quick start categories and opens editor when tapped", async () => {
    jest.mocked(useBudgetMonth).mockReturnValue({
      data: {
        budgets: [],
        categories: [
          {
            id: "cat-1",
            name: "Dining Out",
            kind: "expense",
            color: "#FF5722",
            iconEmoji: "🍔",
            pending: false,
          },
          {
            id: "cat-2",
            name: "Groceries",
            kind: "expense",
            color: "#0F766E",
            iconEmoji: "🛒",
            pending: false,
          },
        ],
      },
      error: null,
      retry: jest.fn(),
    });

    await render(<BudgetsScreen />);

    expect(screen.getByText("Add a category budget")).toBeTruthy();
    expect(screen.getByText("Quick start with your categories")).toBeTruthy();
    expect(screen.getByText("Dining Out")).toBeTruthy();
    expect(screen.getByText("Groceries")).toBeTruthy();
    expect(screen.getByText("Stay within spending targets")).toBeTruthy();

    const diningCard = screen.getByRole("button", { name: "Set budget for Dining Out" });
    await fireEvent.press(diningCard);

    expect(screen.getByText("Monthly spending limit")).toBeTruthy();
  });

  it("renders summary card metrics and category budget rows with emoji when budgets exist", async () => {
    jest.mocked(useBudgetMonth).mockReturnValue({
      data: {
        budgets: [
          {
            id: "budget-1",
            categoryId: "cat-1",
            categoryName: "Dining",
            categoryColor: "#FF5722",
            limitMinor: 50_000,
            spentMinor: 20_000,
            syncState: "synced",
          },
        ],
        categories: [
          {
            id: "cat-1",
            name: "Dining",
            kind: "expense",
            color: "#FF5722",
            iconEmoji: "🍔",
            pending: false,
          },
        ],
      },
      error: null,
      retry: jest.fn(),
    });

    await render(<BudgetsScreen />);

    expect(screen.getByText("Monthly Budget")).toBeTruthy();
    expect(screen.getByText("On track")).toBeTruthy();
    expect(screen.getByText("Dining")).toBeTruthy();
    expect(screen.getByText("🍔", { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByText("40% used")).toBeTruthy();
  });

  it("navigates months and shows 'This month' quick return pill when shifted", async () => {
    jest.mocked(useBudgetMonth).mockReturnValue({
      data: {
        budgets: [],
        categories: [],
      },
      error: null,
      retry: jest.fn(),
    });

    await render(<BudgetsScreen />);

    const nextMonthButton = screen.getByRole("button", { name: "Next month" });
    await fireEvent.press(nextMonthButton);

    expect(screen.getByText("This month")).toBeTruthy();
  });
});
