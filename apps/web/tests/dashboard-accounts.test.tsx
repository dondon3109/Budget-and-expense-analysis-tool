// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { DashboardSummary } from "@zoption/shared";
import type { ReactNode } from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({
  getDashboard: vi.fn(),
  getCashflowTrend: vi.fn(),
  getTransactions: vi.fn(),
  getTransferFeeInsight: vi.fn(),
  getBillingSummary: vi.fn(),
  createAccount: vi.fn(),
  updateAccount: vi.fn(),
  updateAccountInterest: vi.fn(),
  deleteAccount: vi.fn(),
}));
const dashboardExperienceState = vi.hoisted(() => ({
  hasCompletedInitialDashboardExperience: true,
  completeInitialDashboardExperience: vi.fn(),
}));

vi.mock("../src/auth/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "user-1", email: "user@example.com" } }),
}));
vi.mock("../src/components/dashboard/InitialDashboardExperienceProvider", () => ({
  useInitialDashboardExperience: () => dashboardExperienceState,
}));

vi.mock("../src/components/layout/AppShell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));

vi.mock("../src/components/dashboard/BudgetProgress", () => ({ BudgetProgress: () => null }));
vi.mock("../src/components/dashboard/InsightsPanel", () => ({ InsightsPanel: () => null }));
vi.mock("../src/components/dashboard/MonthlyTrend", () => ({ MonthlyTrend: () => null }));
vi.mock("../src/components/dashboard/SpendingByCategory", () => ({
  SpendingByCategory: () => null,
}));
vi.mock("../src/lib/api", async (importOriginal) => ({
  ...(await importOriginal()),
  ...apiMocks,
}));

import { DashboardPage } from "../src/pages/DashboardPage";

const billingSummary = {
  plan: "free" as const,
  status: null,
  interval: null,
  currentPeriodEndsAt: null,
  scheduledChangeAt: null,
  canCheckout: true,
  canManageBilling: false,
  nonTerminalSubscriptionCount: 0,
  usages: [],
  allowances: [],
};

const dashboard: DashboardSummary = {
  period: { from: "2026-07-01", to: "2026-07-31" },
  currency: "PHP",
  accountBalances: {
    currency: "PHP",
    overallBalanceMinor: 40_000,
    balancesByCurrency: { PHP: 40_000, USD: 0 },
    items: [
      {
        id: "bank",
        name: "Bank",
        type: "checking",
        currency: "PHP",
        balanceMinor: 25_000,
        balancesByCurrency: { PHP: 25_000, USD: 0 },
        archived: false,
        system: true,
      },
      {
        id: "cash",
        name: "Cash",
        type: "cash",
        currency: "PHP",
        balanceMinor: 10_000,
        balancesByCurrency: { PHP: 10_000, USD: 0 },
        archived: false,
        system: true,
      },
      {
        id: "custom",
        name: "Maya Wallet",
        type: "other",
        currency: "PHP",
        balanceMinor: 5_000,
        balancesByCurrency: { PHP: 5_000, USD: 0 },
        archived: false,
        system: false,
      },
      {
        id: "removed",
        name: "Old wallet",
        type: "other",
        currency: "PHP",
        balanceMinor: 0,
        balancesByCurrency: { PHP: 0, USD: 0 },
        archived: true,
        system: false,
      },
    ],
  },
  metrics: {
    moneyInMinor: 0,
    moneyOutMinor: 0,
    netMinor: 0,
    incomeByCurrency: { PHP: 0, USD: 0 },
    expenseByCurrency: { PHP: 0, USD: 0 },
    budgetLimitMinor: 0,
    remainingBudgetMinor: 0,
    budgetUsedPercent: 0,
  },
  spendingByCategory: [],
  monthlyTrend: [],
  budgetProgress: [],
  insights: { savingsMinor: 0, savingsRatePercent: null, recurringExpenses: [] },
};

const transferFeeInsight = {
  hasFees: true,
  totalTransfers: 4,
  totalFeeChargedTransfers: 2,
  feesByCurrency: { PHP: 1_500, USD: 0 },
  weekly: [
    {
      weekStart: "2026-07-20",
      weekEnd: "2026-07-26",
      transfers: 2,
      feeChargedTransfers: 2,
      feesByCurrency: { PHP: 1_500, USD: 0 },
    },
  ],
  recentWeekCount: 1,
  recentAverageTransfersPerWeek: 2,
  recentAverageFeeChargedTransfersPerWeek: 2,
};

function CurrentPath() {
  const location = useLocation();
  return <output data-testid="current-path">{`${location.pathname}${location.search}`}</output>;
}

function renderPage(initialEntry = "/app") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <DashboardPage />
        <CurrentPath />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Dashboard loading", () => {
  beforeEach(() => {
    dashboardExperienceState.hasCompletedInitialDashboardExperience = true;
    dashboardExperienceState.completeInitialDashboardExperience.mockReset();
    apiMocks.getBillingSummary.mockReset().mockResolvedValue(billingSummary);
    apiMocks.getCashflowTrend.mockReset().mockResolvedValue({
      view: "weekly",
      granularity: "day",
      range: { from: "2026-07-21", to: "2026-07-27" },
      points: [],
    });
    apiMocks.getTransactions.mockReset().mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 8,
      total: 0,
      totalPages: 1,
    });
    apiMocks.getTransferFeeInsight.mockReset().mockResolvedValue(transferFeeInsight);
  });

  afterEach(() => {
    cleanup();
    dashboardExperienceState.hasCompletedInitialDashboardExperience = true;
    vi.useRealTimers();
  });

  it("keeps the branded startup experience visible until the summary and minimum duration complete", async () => {
    vi.useFakeTimers();
    dashboardExperienceState.hasCompletedInitialDashboardExperience = false;
    let resolveDashboard: ((value: DashboardSummary) => void) | undefined;
    apiMocks.getDashboard.mockReset().mockImplementation(
      () =>
        new Promise<DashboardSummary>((resolve) => {
          resolveDashboard = resolve;
        }),
    );
    renderPage();

    expect(screen.getByText("Opening Zoption")).toBeInTheDocument();

    await act(async () => {
      resolveDashboard?.(dashboard);
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(3_000);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(screen.getByText("Your dashboard is ready")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Account management" })).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(480);
    });

    expect(
      screen.queryByRole("status", { name: "Your dashboard is ready" }),
    ).not.toBeInTheDocument();
    vi.useRealTimers();
  });
});

describe("Dashboard checkout intent", () => {
  beforeEach(() => {
    apiMocks.getBillingSummary.mockReset().mockResolvedValue(billingSummary);
    apiMocks.getDashboard.mockReset().mockResolvedValue(dashboard);
    apiMocks.getCashflowTrend.mockReset().mockResolvedValue({
      view: "weekly",
      granularity: "day",
      range: { from: "2026-07-21", to: "2026-07-27" },
      points: [],
    });
    apiMocks.getTransactions.mockReset().mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 8,
      total: 0,
      totalPages: 1,
    });
    apiMocks.getTransferFeeInsight.mockReset().mockResolvedValue(transferFeeInsight);
  });

  afterEach(cleanup);

  it("keeps the checkout intent active until a Free user closes the chooser", async () => {
    renderPage("/app?proCheckout=open&source=signup");

    const dialog = await screen.findByRole("dialog", {
      name: "Choose how you want to use Zoption Pro",
    });
    expect(screen.getByTestId("current-path")).toHaveTextContent(
      "/app?proCheckout=open&source=signup",
    );

    fireEvent.keyDown(dialog, { key: "Escape" });

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Choose how you want to use Zoption Pro" }),
      ).not.toBeInTheDocument();
      expect(screen.getByTestId("current-path")).toHaveTextContent("/app?source=signup");
    });
  });

  it("consumes the checkout intent without opening a duplicate checkout for Pro", async () => {
    apiMocks.getBillingSummary.mockResolvedValueOnce({ ...billingSummary, plan: "pro" });
    renderPage("/app?proCheckout=open");

    await waitFor(() => expect(screen.getByTestId("current-path")).toHaveTextContent("/app"));
    expect(
      screen.queryByRole("dialog", { name: "Choose how you want to use Zoption Pro" }),
    ).not.toBeInTheDocument();
  });
});

describe("Profile dashboard account management", () => {
  beforeEach(() => {
    apiMocks.getBillingSummary.mockReset().mockResolvedValue(billingSummary);
    apiMocks.getDashboard.mockReset().mockResolvedValue(dashboard);
    apiMocks.getCashflowTrend.mockReset().mockResolvedValue({
      view: "weekly",
      granularity: "day",
      range: { from: "2026-07-21", to: "2026-07-27" },
      points: [],
    });
    apiMocks.getTransactions.mockReset().mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 8,
      total: 0,
      totalPages: 1,
    });
    apiMocks.getTransferFeeInsight.mockReset().mockResolvedValue(transferFeeInsight);
    apiMocks.createAccount.mockReset().mockResolvedValue({});
    apiMocks.updateAccount.mockReset().mockResolvedValue({});
    apiMocks.updateAccountInterest.mockReset().mockResolvedValue({});
    apiMocks.deleteAccount.mockReset().mockResolvedValue(undefined);
  });

  afterEach(cleanup);

  it("offers a header action that opens the transaction form", async () => {
    renderPage();

    expect(await screen.findByRole("link", { name: "Add transaction" })).toHaveAttribute(
      "href",
      "/app/transactions?add=1",
    );
  });

  it("shows overall transfer fees on the Profile dashboard", async () => {
    apiMocks.getTransactions.mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 8,
      total: 4,
      totalPages: 1,
    });
    renderPage();

    const summary = await screen.findByRole("region", { name: "Monthly summary" });
    const stats = within(summary).getAllByRole("article");
    const feeStat = stats[2];

    expect(
      stats.map((stat) => stat.querySelector(".overview-stat-heading > span")?.textContent),
    ).toEqual(["Income", "Expenses", "Transfer fees (all time)", "Remaining budget"]);
    expect(feeStat).toHaveTextContent("₱15");
    expect(feeStat).toHaveTextContent("Across 2 fee-charged transfers");
  });

  it("keeps four summary sections while transfer fees are loading", async () => {
    apiMocks.getTransactions.mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 8,
      total: 4,
      totalPages: 1,
    });
    apiMocks.getTransferFeeInsight.mockReturnValue(new Promise(() => undefined));
    renderPage();

    const summary = await screen.findByRole("region", { name: "Monthly summary" });
    const stats = within(summary).getAllByRole("article");

    expect(stats).toHaveLength(4);
    expect(stats[2]).toHaveTextContent("Transfer fees (all time)");
    expect(stats[2]).toHaveTextContent("Loading transfer fees…");
  });

  it("renders a zero state when no transfer fees are recorded", async () => {
    apiMocks.getTransactions.mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 8,
      total: 4,
      totalPages: 1,
    });
    apiMocks.getTransferFeeInsight.mockResolvedValue({
      hasFees: false,
      totalTransfers: 0,
      totalFeeChargedTransfers: 0,
      feesByCurrency: { PHP: 0, USD: 0 },
      weekly: [],
      recentWeekCount: 0,
      recentAverageTransfersPerWeek: 0,
      recentAverageFeeChargedTransfersPerWeek: 0,
    });
    renderPage();

    const summary = await screen.findByRole("region", { name: "Monthly summary" });
    const feeStat = within(summary).getAllByRole("article")[2];

    expect(feeStat).toHaveTextContent("No transfer fees recorded yet");
    expect(feeStat).toHaveTextContent("₱0");
  });

  it("renders one Cash-first account list with history in its disclosure", async () => {
    renderPage();

    const accountManager = await screen.findByRole("region", { name: "Account management" });
    const names = Array.from(accountManager.querySelectorAll(".dashboard-account-name")).map(
      (element) => element.firstChild?.textContent,
    );

    expect(names).toEqual(["Cash", "Bank", "Maya Wallet"]);
    expect(within(accountManager).getByText("Primary")).toBeInTheDocument();
    expect(
      within(accountManager).queryByRole("button", { name: "Edit Cash" }),
    ).not.toBeInTheDocument();
    expect(
      within(accountManager).queryByRole("button", { name: "Remove Bank" }),
    ).not.toBeInTheDocument();
    expect(within(accountManager).getByRole("button", { name: "Edit Bank" })).toBeInTheDocument();
    expect(
      within(accountManager).getByRole("button", { name: "Edit Maya Wallet" }),
    ).toBeInTheDocument();
    const removedAccounts = within(accountManager)
      .getByText("Removed accounts (1)")
      .closest("details");
    expect(removedAccounts).not.toHaveAttribute("open");

    fireEvent.click(within(accountManager).getByText("Removed accounts (1)"));
    expect(removedAccounts).toHaveAttribute("open");
    expect(within(accountManager).getByText("Old wallet")).toBeInTheDocument();
  });

  it("shows each account's PHP and USD balances in the breakdown", async () => {
    const usdDashboard: DashboardSummary = {
      ...dashboard,
      accountBalances: {
        ...dashboard.accountBalances!,
        overallBalanceMinor: 25_000,
        balancesByCurrency: { PHP: 25_000, USD: 15_000 },
        items: (dashboard.accountBalances?.items ?? []).map((item) =>
          item.id === "bank" ? { ...item, balancesByCurrency: { PHP: 25_000, USD: 15_000 } } : item,
        ),
      },
    };
    apiMocks.getDashboard.mockReset().mockResolvedValue(usdDashboard);
    renderPage();

    const accountManager = await screen.findByRole("region", { name: "Account management" });
    const bankRow = within(accountManager).getByText("Bank").closest("li");
    expect(bankRow).not.toBeNull();
    expect(within(bankRow!).getByText("₱250")).toBeInTheDocument();
    expect(within(bankRow!).getByText("$150 USD")).toBeInTheDocument();
  });

  it("adds a custom account from the Profile dashboard", async () => {
    renderPage();
    const accountManager = await screen.findByRole("region", { name: "Account management" });

    fireEvent.click(within(accountManager).getByRole("button", { name: "Add account" }));
    fireEvent.change(within(accountManager).getByLabelText("Account name"), {
      target: { value: "SeaBank" },
    });
    fireEvent.change(within(accountManager).getByLabelText("Account type"), {
      target: { value: "savings" },
    });
    fireEvent.click(within(accountManager).getByRole("button", { name: "Add" }));

    await waitFor(() =>
      expect(apiMocks.createAccount).toHaveBeenCalledWith(
        { key: "user:user-1", userId: "user-1" },
        { name: "SeaBank", type: "savings" },
      ),
    );
  });

  it("lets you change an account's type from its edit dialog", async () => {
    renderPage();
    const accountManager = await screen.findByRole("region", { name: "Account management" });

    fireEvent.click(within(accountManager).getByRole("button", { name: "Edit Maya Wallet" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit account" });
    fireEvent.change(within(dialog).getByLabelText("Account type"), {
      target: { value: "savings" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(apiMocks.updateAccount).toHaveBeenCalledWith(
        { key: "user:user-1", userId: "user-1" },
        { id: "custom", input: { name: "Maya Wallet", type: "savings" } },
      ),
    );
  });

  it("lets a Pro user configure interest on the default Bank account", async () => {
    apiMocks.getBillingSummary.mockResolvedValueOnce({ ...billingSummary, plan: "zoption_pro" });
    renderPage();
    const accountManager = await screen.findByRole("region", { name: "Account management" });

    fireEvent.click(within(accountManager).getByRole("button", { name: "Edit Bank" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit account" });
    fireEvent.change(within(dialog).getByLabelText("Account type"), {
      target: { value: "savings" },
    });
    const earnInterest = within(dialog).getByRole("checkbox", { name: "Earn automatic interest" });
    await waitFor(() => expect(earnInterest).toBeEnabled());
    fireEvent.click(earnInterest);
    fireEvent.change(within(dialog).getByLabelText("Annual interest rate (%)"), {
      target: { value: "5" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(apiMocks.updateAccount).toHaveBeenCalledWith(
        { key: "user:user-1", userId: "user-1" },
        { id: "bank", input: { name: "Bank", type: "savings" } },
      ),
    );
    await waitFor(() =>
      expect(apiMocks.updateAccountInterest).toHaveBeenCalledWith(
        { key: "user:user-1", userId: "user-1" },
        {
          id: "bank",
          input: {
            enabled: true,
            annualRateBasisPoints: 500,
            frequency: "monthly",
            payDay: 15,
          },
        },
      ),
    );
    expect(apiMocks.updateAccountInterest).toHaveBeenCalled();
  });

  it("keeps interest settings hidden behind a Pro callout for free users", async () => {
    renderPage();
    const accountManager = await screen.findByRole("region", { name: "Account management" });

    fireEvent.click(within(accountManager).getByRole("button", { name: "Edit Bank" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit account" });
    fireEvent.change(within(dialog).getByLabelText("Account type"), {
      target: { value: "savings" },
    });

    expect(within(dialog).getByText(/Earn automatic interest on this account/)).toBeInTheDocument();
    expect(
      within(dialog).queryByRole("checkbox", { name: "Earn automatic interest" }),
    ).not.toBeInTheDocument();
    expect(within(dialog).getByText(/Automatic interest is a Pro feature/)).toBeInTheDocument();
    expect(within(dialog).queryByLabelText("Annual interest rate (%)")).not.toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(apiMocks.updateAccount).toHaveBeenCalledWith(
        { key: "user:user-1", userId: "user-1" },
        { id: "bank", input: { name: "Bank", type: "savings" } },
      ),
    );
    expect(apiMocks.updateAccountInterest).not.toHaveBeenCalled();
  });

  it("keeps historical records visible when the current month has no activity", async () => {
    apiMocks.getTransactions.mockResolvedValueOnce({
      items: [
        {
          id: "july-groceries",
          date: "2026-07-14",
          description: "Last month groceries",
          amountMinor: 2_300,
          currency: "PHP",
          kind: "expense",
          categoryId: "groceries",
          categoryName: "Groceries",
          categoryColor: "#d16b55",
          accountId: "cash",
          accountName: "Cash",
          notes: null,
        },
      ],
      page: 1,
      pageSize: 8,
      total: 1,
      totalPages: 1,
    });
    renderPage();

    expect(await screen.findByText("Last month groceries")).toBeInTheDocument();
    expect(screen.queryByText("Build your first monthly picture")).not.toBeInTheDocument();
    expect(apiMocks.getTransactions).toHaveBeenCalledWith(
      { key: "user:user-1", userId: "user-1" },
      { page: 1, pageSize: 8, sortBy: "date", sortDirection: "desc" },
    );
  });

  it("loads a selected month and keeps all-time history unfiltered", async () => {
    renderPage("/app?month=2026-07&source=profile");

    await waitFor(() =>
      expect(apiMocks.getDashboard).toHaveBeenCalledWith(
        { key: "user:user-1", userId: "user-1" },
        { from: "2026-07-01", to: "2026-07-31" },
      ),
    );
    expect(apiMocks.getCashflowTrend).toHaveBeenCalledWith(
      { key: "user:user-1", userId: "user-1" },
      { view: "weekly", anchorDate: "2026-07-31" },
    );
    expect(apiMocks.getTransactions).toHaveBeenCalledWith(
      { key: "user:user-1", userId: "user-1" },
      { page: 1, pageSize: 8, sortBy: "date", sortDirection: "desc" },
    );

    fireEvent.click(await screen.findByRole("button", { name: /Dashboard month: July 2026/ }));
    fireEvent.click(screen.getByRole("button", { name: "June 2026" }));

    await waitFor(() => {
      expect(screen.getByTestId("current-path")).toHaveTextContent(
        "/app?month=2026-06&source=profile",
      );
      expect(apiMocks.getDashboard).toHaveBeenCalledWith(
        { key: "user:user-1", userId: "user-1" },
        { from: "2026-06-01", to: "2026-06-30" },
      );
    });
  });
});
