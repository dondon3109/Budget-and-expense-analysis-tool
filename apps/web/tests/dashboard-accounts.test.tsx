// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { DashboardSummary } from "@zoption/shared";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({
  getDashboard: vi.fn(),
  getCashflowTrend: vi.fn(),
  createAccount: vi.fn(),
  updateAccount: vi.fn(),
  deleteAccount: vi.fn(),
}));

vi.mock("../src/auth/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "user-1", email: "user@example.com" } }),
}));

vi.mock("../src/components/layout/AppShell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));

vi.mock("../src/components/dashboard/BudgetProgress", () => ({ BudgetProgress: () => null }));
vi.mock("../src/components/dashboard/InsightsPanel", () => ({ InsightsPanel: () => null }));
vi.mock("../src/components/dashboard/MonthlyTrend", () => ({ MonthlyTrend: () => null }));
vi.mock("../src/components/dashboard/OverviewStatBar", () => ({ OverviewStatBar: () => null }));
vi.mock("../src/components/dashboard/SpendingByCategory", () => ({
  SpendingByCategory: () => null,
}));
vi.mock("../src/lib/api", () => apiMocks);

import { DashboardPage } from "../src/pages/DashboardPage";

const dashboard: DashboardSummary = {
  period: { from: "2026-07-01", to: "2026-07-31" },
  currency: "PHP",
  accountBalances: {
    currency: "PHP",
    overallBalanceMinor: 40_000,
    items: [
      {
        id: "bank",
        name: "Bank",
        type: "checking",
        currency: "PHP",
        balanceMinor: 25_000,
        archived: false,
        system: true,
      },
      {
        id: "cash",
        name: "Cash",
        type: "cash",
        currency: "PHP",
        balanceMinor: 10_000,
        archived: false,
        system: true,
      },
      {
        id: "custom",
        name: "Maya Wallet",
        type: "other",
        currency: "PHP",
        balanceMinor: 5_000,
        archived: false,
        system: false,
      },
      {
        id: "removed",
        name: "Old wallet",
        type: "other",
        currency: "PHP",
        balanceMinor: 0,
        archived: true,
        system: false,
      },
    ],
  },
  metrics: {
    moneyInMinor: 0,
    moneyOutMinor: 0,
    netMinor: 0,
    budgetLimitMinor: 0,
    remainingBudgetMinor: 0,
    budgetUsedPercent: 0,
  },
  spendingByCategory: [],
  monthlyTrend: [],
  budgetProgress: [],
  insights: { savingsMinor: 0, savingsRatePercent: null, recurringExpenses: [] },
};

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Profile dashboard account management", () => {
  beforeEach(() => {
    apiMocks.getDashboard.mockReset().mockResolvedValue(dashboard);
    apiMocks.getCashflowTrend.mockReset().mockResolvedValue({
      view: "weekly",
      granularity: "day",
      range: { from: "2026-07-21", to: "2026-07-27" },
      points: [],
    });
    apiMocks.createAccount.mockReset().mockResolvedValue({});
    apiMocks.updateAccount.mockReset().mockResolvedValue({});
    apiMocks.deleteAccount.mockReset().mockResolvedValue(undefined);
  });

  afterEach(cleanup);

  it("renders one Cash-first account list with history in its disclosure", async () => {
    renderPage();

    const accountManager = await screen.findByRole("region", { name: "Account management" });
    const names = Array.from(accountManager.querySelectorAll(".dashboard-account-name")).map(
      (element) => element.firstChild?.textContent,
    );

    expect(names).toEqual(["Cash", "Bank", "Maya Wallet"]);
    expect(within(accountManager).getByText("Primary")).toBeInTheDocument();
    expect(
      within(accountManager).queryByRole("button", { name: "Rename Cash" }),
    ).not.toBeInTheDocument();
    expect(
      within(accountManager).queryByRole("button", { name: "Remove Bank" }),
    ).not.toBeInTheDocument();
    expect(
      within(accountManager).getByRole("button", { name: "Rename Maya Wallet" }),
    ).toBeInTheDocument();
    const removedAccounts = within(accountManager)
      .getByText("Removed accounts (1)")
      .closest("details");
    expect(removedAccounts).not.toHaveAttribute("open");

    fireEvent.click(within(accountManager).getByText("Removed accounts (1)"));
    expect(removedAccounts).toHaveAttribute("open");
    expect(within(accountManager).getByText("Old wallet")).toBeInTheDocument();
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
});
