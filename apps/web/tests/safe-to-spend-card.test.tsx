// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import type { SubscriptionMonthItem } from "@zoption/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SafeToSpendCard } from "../src/components/dashboard/SafeToSpendCard";
import type { AuthenticatedWorkspace } from "../src/lib/workspace";

vi.mock("../src/lib/api", () => ({
  getSubscriptions: vi.fn(),
}));

import { getSubscriptions } from "../src/lib/api";

const workspace: AuthenticatedWorkspace = { key: "user:test-user", userId: "test-user" };

// Wednesday at local noon. The card reads the local weekday, so building the instant
// from local calendar parts keeps "5 days left" and the August month key true in any
// timezone the suite runs in.
const WEDNESDAY = new Date(2026, 7, 19, 12, 0, 0);

function daysAfterWednesday(days: number): string {
  const date = new Date(2026, 7, 19 + days);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function subscription(overrides: Partial<SubscriptionMonthItem> = {}): SubscriptionMonthItem {
  return {
    id: "sub-1",
    name: "Cloud storage",
    amountMinor: 80_000,
    currency: "PHP",
    billingCycle: "monthly",
    nextBillingDate: daysAfterWednesday(2),
    billingDate: daysAfterWednesday(2),
    status: "active",
    categoryId: "cat-1",
    categoryName: "Technology",
    categoryColor: "#2563eb",
    accountId: null,
    accountName: null,
    monthlyCostMinor: 80_000,
    ...overrides,
  };
}

function mockSubscriptions(items: SubscriptionMonthItem[]) {
  vi.mocked(getSubscriptions).mockResolvedValue({
    month: "2026-08",
    currency: "PHP",
    totalMonthlyCostMinor: 0,
    items,
  });
}

function renderCard(props: { startingBalanceMinor: number; remainingBudgetMinor?: number }) {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter>
        <SafeToSpendCard workspace={workspace} {...props} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  // Only Date is faked, so React Query and Testing Library keep their real timers.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(WEDNESDAY);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("SafeToSpendCard", () => {
  it("paces the remaining budget across the days left in the week", async () => {
    mockSubscriptions([]);

    renderCard({ startingBalanceMinor: 1_000_000, remainingBudgetMinor: 500_000 });

    expect(await screen.findByText("₱1,000")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Safe to spend this week" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "Safe to spend this week" }),
    ).toBeInTheDocument();
    expect(screen.getByText("5 days left")).toBeInTheDocument();
    expect(
      await screen.findByText(
        "Forward guidance accounting for 0 active recurring bills and scheduled obligations.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Renewals" })).toHaveAttribute(
      "href",
      "/app/subscriptions",
    );
    await waitFor(() => expect(getSubscriptions).toHaveBeenCalledWith(workspace, "2026-08-01"));
  });

  it("paces the whole balance when the month has no budget plan", async () => {
    mockSubscriptions([]);

    // No budget rows means no weekly envelope, so the balance is paced instead.
    renderCard({ startingBalanceMinor: 1_000_000 });

    expect(await screen.findByText("₱2,000")).toBeInTheDocument();
    expect(
      await screen.findByText(
        "Forward guidance accounting for 0 active recurring bills and scheduled obligations.",
      ),
    ).toBeInTheDocument();
  });

  it("says the figure may still fall while renewals are loading", () => {
    vi.mocked(getSubscriptions).mockReturnValue(new Promise<never>(() => {}));

    renderCard({ startingBalanceMinor: 1_000_000, remainingBudgetMinor: 500_000 });

    expect(
      screen.getByText("Checking your renewals, so this figure may still fall."),
    ).toBeInTheDocument();
  });

  it("says the figure may be optimistic when renewals fail to load", async () => {
    vi.mocked(getSubscriptions).mockRejectedValue(new Error("offline"));

    renderCard({ startingBalanceMinor: 1_000_000, remainingBudgetMinor: 500_000 });

    expect(
      await screen.findByText("Renewals could not be loaded, so this figure may be optimistic."),
    ).toBeInTheDocument();
  });

  it("caps the amount when the 30-day projection is below the paced envelope", async () => {
    mockSubscriptions([]);

    // ₱5,000 over 5 days paces to ₱1,000, but the projection never rises above ₱600.
    renderCard({ startingBalanceMinor: 60_000, remainingBudgetMinor: 500_000 });

    expect(await screen.findByText("₱600")).toBeInTheDocument();
    expect(screen.queryByText("₱1,000")).not.toBeInTheDocument();
  });

  it("asks for minimal spending when nothing is safe to spend", async () => {
    mockSubscriptions([]);

    renderCard({ startingBalanceMinor: 1_000_000, remainingBudgetMinor: 0 });

    expect(await screen.findByText("₱0")).toBeInTheDocument();
    expect(
      await screen.findByText(
        "Keep spending minimal until your next planned deposit or balance adjustment.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("5 days left")).toBeInTheDocument();
  });

  it("lowers the amount for an active renewal and ignores a canceled one", async () => {
    mockSubscriptions([subscription()]);

    // ₱1,000 paced from the envelope, capped to ₱700 by the ₱800 renewal in two days.
    const { unmount } = renderCard({
      startingBalanceMinor: 150_000,
      remainingBudgetMinor: 500_000,
    });

    expect(await screen.findByText("₱700")).toBeInTheDocument();
    expect(
      await screen.findByText(
        "Forward guidance accounting for 1 active recurring bill and scheduled obligations.",
      ),
    ).toBeInTheDocument();

    unmount();
    mockSubscriptions([subscription({ status: "canceled" })]);

    renderCard({ startingBalanceMinor: 150_000, remainingBudgetMinor: 500_000 });

    expect(await screen.findByText("₱1,000")).toBeInTheDocument();
    expect(
      await screen.findByText(
        "Forward guidance accounting for 0 active recurring bills and scheduled obligations.",
      ),
    ).toBeInTheDocument();
  });
});
