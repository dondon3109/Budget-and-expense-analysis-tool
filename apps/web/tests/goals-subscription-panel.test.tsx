// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import type { SubscriptionMonthItem } from "@zoption/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GoalsSubscriptionPanel } from "../src/components/dashboard/GoalsSubscriptionPanel";
import type { AuthenticatedWorkspace } from "../src/lib/workspace";

vi.mock("../src/lib/api", () => ({
  getFinancialGoals: vi.fn(),
  getSubscriptions: vi.fn(),
}));

import { getFinancialGoals, getSubscriptions } from "../src/lib/api";

const workspace: AuthenticatedWorkspace = { key: "user:test-user", userId: "test-user" };

const activeGoal = {
  id: "goal-1",
  name: "Emergency fund",
  targetAmountMinor: 120_000_00,
  currentAmountMinor: 30_000_00,
  targetDate: "2027-08-01",
  status: "active" as const,
  createdAt: "2026-08-02T00:00:00.000Z",
  updatedAt: "2026-08-02T00:00:00.000Z",
};

const pausedGoal = { ...activeGoal, id: "goal-2", name: "Vacation", status: "paused" as const };

const subscriptionItem: SubscriptionMonthItem = {
  id: "sub-1",
  name: "Streaming",
  amountMinor: 4_990_00,
  currency: "PHP",
  billingCycle: "monthly",
  nextBillingDate: "2026-08-15",
  status: "active",
  categoryId: "cat-1",
  categoryName: "Entertainment",
  categoryColor: "#a56f39",
  accountId: null,
  accountName: null,
  billingDate: "2026-08-15",
  monthlyCostMinor: 4_990_00,
};

function renderPanel() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <GoalsSubscriptionPanel workspace={workspace} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("GoalsSubscriptionPanel", () => {
  it("shows active goals with their progress and target date", async () => {
    vi.mocked(getFinancialGoals).mockResolvedValue({ items: [activeGoal, pausedGoal] });
    vi.mocked(getSubscriptions).mockResolvedValue({
      month: "2026-08",
      currency: "PHP",
      totalMonthlyCostMinor: 4_990_00,
      items: [subscriptionItem],
    });

    renderPanel();

    expect(await screen.findByText("Emergency fund")).toBeInTheDocument();
    const progress = screen.getByRole("progressbar", { name: "Emergency fund progress" });
    expect(progress).toHaveAttribute("aria-valuenow", "25");
    expect(screen.getByText("Target Aug 1, 2027")).toBeInTheDocument();
    // Paused goal is hidden.
    expect(screen.queryByText("Vacation")).not.toBeInTheDocument();
  });

  it("sums every active subscription in the current month", async () => {
    vi.mocked(getFinancialGoals).mockResolvedValue({ items: [] });
    vi.mocked(getSubscriptions).mockResolvedValue({
      month: "2026-08",
      currency: "PHP",
      totalMonthlyCostMinor: 4_990_00,
      items: [
        subscriptionItem,
        {
          ...subscriptionItem,
          id: "sub-2",
          name: "Cloud storage",
          amountMinor: 1_010_00,
          monthlyCostMinor: 1_010_00,
        },
      ],
    });

    renderPanel();

    expect(await screen.findByText("₱6,000")).toBeInTheDocument();
    expect(screen.getByText(/2 active plans/)).toBeInTheDocument();
  });

  it("shows empty states when there are no goals or subscriptions", async () => {
    vi.mocked(getFinancialGoals).mockResolvedValue({ items: [] });
    vi.mocked(getSubscriptions).mockResolvedValue({
      month: "2026-08",
      currency: "PHP",
      totalMonthlyCostMinor: 0,
      items: [],
    });

    renderPanel();

    expect(await screen.findByText("No active goals yet.")).toBeInTheDocument();
    expect(await screen.findByText("₱0")).toBeInTheDocument();
    expect(screen.getByText(/0 active plans/)).toBeInTheDocument();
  });

  it("filters out canceled subscriptions from the active plan count", async () => {
    vi.mocked(getFinancialGoals).mockResolvedValue({ items: [] });
    vi.mocked(getSubscriptions).mockResolvedValue({
      month: "2026-08",
      currency: "PHP",
      totalMonthlyCostMinor: 4_990_00,
      items: [
        subscriptionItem,
        { ...subscriptionItem, id: "sub-2", name: "Canceled", status: "canceled" },
      ],
    });

    renderPanel();

    await waitFor(() => expect(screen.getByText(/1 active plan/)).toBeInTheDocument());
  });
});
