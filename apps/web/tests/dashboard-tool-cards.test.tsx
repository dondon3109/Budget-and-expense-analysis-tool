// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import type { SubscriptionMonthItem } from "@zoption/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DashboardToolCards } from "../src/components/dashboard/DashboardToolCards";
import type { AuthenticatedWorkspace } from "../src/lib/workspace";

vi.mock("../src/lib/api", () => ({
  getSubscriptions: vi.fn(),
}));

import { getSubscriptions } from "../src/lib/api";

const workspace: AuthenticatedWorkspace = { key: "user:test-user", userId: "test-user" };

// Noon UTC mid-month: the projection starts from the UTC calendar day and the subscription
// month key comes from the local calendar day, so both stay August on any machine.
const NOW = new Date("2026-08-19T12:00:00Z");

function subscription(overrides: Partial<SubscriptionMonthItem> = {}): SubscriptionMonthItem {
  return {
    id: "sub-1",
    name: "Cloud storage",
    amountMinor: 30_000,
    currency: "PHP",
    billingCycle: "monthly",
    nextBillingDate: "2026-08-21",
    billingDate: "2026-08-21",
    status: "active",
    categoryId: "cat-1",
    categoryName: "Technology",
    categoryColor: "#2563eb",
    accountId: null,
    accountName: null,
    monthlyCostMinor: 30_000,
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

function renderCards(startingBalanceMinor: number) {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter>
        <DashboardToolCards workspace={workspace} startingBalanceMinor={startingBalanceMinor} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  // Only Date is faked, so React Query and Testing Library keep their real timers.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("DashboardToolCards", () => {
  it("links to the forecast and the remittance calculator", () => {
    mockSubscriptions([]);

    renderCards(100_000);

    expect(screen.getByRole("link", { name: /cash flow forecast/i })).toHaveAttribute(
      "href",
      "/app/subscriptions?view=forecast",
    );
    expect(screen.getByRole("link", { name: /remittance calculator/i })).toHaveAttribute(
      "href",
      "/app/plan#remittance-calculator",
    );
    expect(
      screen.getByRole("heading", { level: 3, name: "Cash flow forecast" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 3, name: "Remittance calculator" }),
    ).toBeInTheDocument();
  });

  it("reports the lowest projected balance and the renewals inside the window", async () => {
    mockSubscriptions([
      subscription(),
      subscription({
        id: "sub-2",
        name: "Music",
        amountMinor: 20_000,
        nextBillingDate: "2026-09-02",
        billingDate: "2026-09-02",
      }),
      subscription({ id: "sub-3", name: "Old gym", amountMinor: 90_000, status: "canceled" }),
    ]);

    renderCards(100_000);

    const forecastLink = await screen.findByRole("link", { name: /cash flow forecast/i });
    // The projected figure only settles once the month's renewals have loaded.
    expect(await within(forecastLink).findByText("₱500")).toBeInTheDocument();
    expect(
      within(forecastLink).getByText("Lowest on Sep 2 · 2 renewals in the next 30 days"),
    ).toBeInTheDocument();
    expect(getSubscriptions).toHaveBeenCalledWith(workspace, "2026-08-01");
  });

  it("warns when a renewal pushes the projected balance below zero", async () => {
    mockSubscriptions([subscription({ amountMinor: 50_000 })]);

    // ₱200 today against a ₱500 renewal in two days.
    renderCards(20_000);

    const forecastLink = await screen.findByRole("link", { name: /deficit risk/i });
    expect(within(forecastLink).getByText("Deficit risk")).toBeInTheDocument();
    expect(
      within(forecastLink).getByText("Lowest on Aug 21 · 1 renewal in the next 30 days"),
    ).toBeInTheDocument();
  });

  it("stays quiet when the projection covers every renewal", async () => {
    mockSubscriptions([subscription({ amountMinor: 50_000 })]);

    renderCards(100_000);

    const forecastLink = await screen.findByRole("link", { name: /cash flow forecast/i });
    expect(await within(forecastLink).findByText("₱500")).toBeInTheDocument();
    expect(forecastLink).not.toHaveAccessibleName(/deficit risk/i);
  });

  it("shows the mid-market USD benchmark on the remittance card", () => {
    mockSubscriptions([]);

    renderCards(100_000);

    const remittanceLink = screen.getByRole("link", { name: /remittance calculator/i });
    expect(within(remittanceLink).getByText("1 USD = ₱56.50")).toBeInTheDocument();
    expect(
      within(remittanceLink).getByText(
        "Compare provider fees and what your recipient actually receives.",
      ),
    ).toBeInTheDocument();
  });

  it("says renewals are unavailable instead of reporting an empty schedule", async () => {
    vi.mocked(getSubscriptions).mockRejectedValue(new Error("offline"));

    renderCards(100_000);

    const forecastLink = await screen.findByRole("link", { name: /cash flow forecast/i });
    expect(await within(forecastLink).findByText("Renewals unavailable")).toBeInTheDocument();
    expect(within(forecastLink).queryByText(/no renewals scheduled/i)).not.toBeInTheDocument();
    expect(forecastLink).not.toHaveAccessibleName(/deficit risk/i);
  });

  it("stays neutral and unblocked while the renewal lookup is pending", () => {
    vi.mocked(getSubscriptions).mockReturnValue(new Promise<never>(() => {}));

    // A negative balance with no renewal data is not a deficit the card can claim yet.
    renderCards(-5_000);

    const forecastLink = screen.getByRole("link", { name: /cash flow forecast/i });
    expect(forecastLink).not.toHaveAccessibleName(/deficit risk/i);
    expect(within(forecastLink).getByText(/no renewals scheduled/i)).toBeInTheDocument();
  });
});
