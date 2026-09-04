import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { router } from "expo-router";

import HomeScreen from "../../../app/(app)/(tabs)/index";
import { useDashboardData, useSubscriptions } from "@/db/local-workspace-state";
import { usePlan } from "@/auth/plan-state";
import { useSyncState } from "@/sync/sync-state";
import { localIsoDate } from "./dashboard-view";

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
  useDashboardData: jest.fn(),
  useSubscriptions: jest.fn(),
}));

jest.mock("@/sync/sync-state", () => ({
  useSyncState: jest.fn(),
}));

jest.mock("@/auth/plan-state", () => ({
  usePlan: jest.fn(),
}));

describe("HomeScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(useSyncState).mockReturnValue({
      status: "synced",
      message: null,
      retry: jest.fn(),
    });
    jest.mocked(usePlan).mockReturnValue({
      plan: "free",
      status: "ready",
      retry: jest.fn(),
    });
    jest.mocked(useSubscriptions).mockReturnValue({
      subscriptions: [],
      loading: false,
      error: null,
      retry: jest.fn(),
    });
  });

  it("renders quick actions and onboarding step cards when workspace has no transactions", async () => {
    jest.mocked(useDashboardData).mockReturnValue({
      data: {
        transactions: [],
        accounts: [],
        budgets: [],
      },
      error: null,
      retry: jest.fn(),
    });

    await render(<HomeScreen />);

    // Quick Action tiles
    expect(screen.getByRole("button", { name: "Add transaction" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Scan receipt" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "View budgets" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "AI Assistant" })).toBeTruthy();

    // Onboarding guide
    expect(screen.getByText("Welcome to your workspace")).toBeTruthy();
    expect(screen.getByText("Set up accounts & categories")).toBeTruthy();
    expect(screen.getByText("Add transaction or scan receipt")).toBeTruthy();
    expect(screen.getByText("Set monthly budget limits")).toBeTruthy();
  });

  it("navigates on quick action button presses", async () => {
    jest.mocked(useDashboardData).mockReturnValue({
      data: {
        transactions: [],
        accounts: [],
        budgets: [],
      },
      error: null,
      retry: jest.fn(),
    });

    await render(<HomeScreen />);

    await fireEvent.press(screen.getByRole("button", { name: "Add transaction" }));
    expect(router.push).toHaveBeenCalledWith("/(app)/transaction");

    await fireEvent.press(screen.getByRole("button", { name: "Scan receipt" }));
    expect(router.push).toHaveBeenCalledWith("/(app)/receipt-scan");

    await fireEvent.press(screen.getByRole("button", { name: "View budgets" }));
    expect(router.push).toHaveBeenCalledWith("/(app)/(tabs)/budgets");

    await fireEvent.press(screen.getByRole("button", { name: "AI Assistant" }));
    expect(router.push).toHaveBeenCalledWith("/(app)/assistant");
  });

  it("renders the cash flow forecast card when active subscriptions exist", async () => {
    const today = localIsoDate(new Date());
    jest.mocked(useDashboardData).mockReturnValue({
      data: {
        transactions: [
          {
            id: "tx-1",
            date: today,
            description: "Salary deposit",
            amountMinor: 75_000_00,
            currency: "PHP",
            kind: "income",
            categoryId: "cat-income",
            categoryName: "Income",
            categoryColor: "#08776d",
            categoryIconEmoji: "💰",
            accountName: "Main Bank",
          },
        ],
        accounts: [
          {
            id: "acc-1",
            name: "Main Bank",
            type: "checking",
            currency: "PHP",
            balanceMinor: 70_500_00,
            balancesByCurrency: { PHP: 70_500_00, USD: 0 },
            archived: false,
            system: false,
          },
        ],
        budgets: [],
      },
      error: null,
      retry: jest.fn(),
    });
    jest.mocked(useSubscriptions).mockReturnValue({
      subscriptions: [
        {
          id: "sub-1",
          name: "Netflix",
          amountMinor: 54_900,
          currency: "PHP",
          billingCycle: "monthly",
          nextBillingDate: today,
          status: "active",
          categoryId: null,
          accountId: null,
          syncState: "synced",
        },
      ],
      loading: false,
      error: null,
      retry: jest.fn(),
    });

    await render(<HomeScreen />);

    expect(screen.getByText("Cash flow forecast")).toBeTruthy();
    expect(screen.getByText("Upcoming bills and renewals")).toBeTruthy();
    expect(screen.getByText("Netflix")).toBeTruthy();
  });

  it("renders rich financial overview when transactions exist", async () => {
    const today = localIsoDate(new Date());
    jest.mocked(useDashboardData).mockReturnValue({
      data: {
        transactions: [
          {
            id: "tx-1",
            date: today,
            description: "Salary deposit",
            amountMinor: 75_000_00,
            currency: "PHP",
            kind: "income",
            categoryId: "cat-income",
            categoryName: "Income",
            categoryColor: "#08776d",
            categoryIconEmoji: "💰",
            accountName: "Main Bank",
          },
          {
            id: "tx-2",
            date: today,
            description: "Supermarket groceries",
            amountMinor: -4_500_00,
            currency: "PHP",
            kind: "expense",
            categoryId: "cat-groceries",
            categoryName: "Groceries",
            categoryColor: "#2f65c8",
            categoryIconEmoji: "🛒",
            accountName: "Main Bank",
          },
        ],
        accounts: [
          {
            id: "acc-1",
            name: "Main Bank",
            type: "checking",
            currency: "PHP",
            balanceMinor: 70_500_00,
            balancesByCurrency: { PHP: 70_500_00, USD: 0 },
            archived: false,
            system: false,
          },
        ],
        budgets: [],
      },
      error: null,
      retry: jest.fn(),
    });

    await render(<HomeScreen />);

    // Total Balance card
    expect(screen.getByText("Total Balance")).toBeTruthy();
    expect(screen.getByText("Main Bank")).toBeTruthy();

    // Month summary
    expect(screen.getByText("This month")).toBeTruthy();
    expect(screen.getByText("Money in")).toBeTruthy();
    expect(screen.getByText("Money out")).toBeTruthy();
    expect(screen.getByText("Net flow")).toBeTruthy();
    expect(screen.getByText("Savings rate")).toBeTruthy();

    // Categories
    expect(screen.getByText("Spending by category")).toBeTruthy();
    expect(screen.getByText("Groceries")).toBeTruthy();

    // Recent activity
    expect(screen.getByText("Recent activity")).toBeTruthy();
    expect(screen.getByText("Salary deposit")).toBeTruthy();
    expect(screen.getByText("Supermarket groceries")).toBeTruthy();
  });

  it("triggers sync and dashboard retry on pull to refresh", async () => {
    const mockSyncRetry = jest.fn();
    const mockDashboardRetry = jest.fn();

    jest.mocked(useSyncState).mockReturnValue({
      status: "synced",
      message: null,
      retry: mockSyncRetry,
    });
    jest.mocked(useDashboardData).mockReturnValue({
      data: {
        transactions: [],
        accounts: [],
        budgets: [],
      },
      error: null,
      retry: mockDashboardRetry,
    });

    await render(<HomeScreen />);
    const refreshControl = screen.root?.queryAll((node) => node.type === "RCTRefreshControl")[0];
    expect(refreshControl).toBeTruthy();
    if (!refreshControl) throw new Error("RCTRefreshControl not found");

    await act(async () => {
      await fireEvent(refreshControl, "refresh");
    });

    expect(mockSyncRetry).toHaveBeenCalledTimes(1);
    expect(mockDashboardRetry).toHaveBeenCalledTimes(1);
  });
});
