// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import type { CategoryRecord, SubscriptionMonthSummary, SubscriptionRecord } from "@budget/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createSubscription,
  getCategories,
  getSubscriptions,
  setSubscriptionStatus,
} from "../src/lib/api";
import { SubscriptionsPage } from "../src/pages/SubscriptionsPage";

vi.mock("../src/auth/AuthProvider", () => ({
  useAuth: () => ({
    user: { id: "test-user", email: "test@example.com" },
    signOut: vi.fn(),
  }),
}));

vi.mock("../src/lib/api", () => ({
  createSubscription: vi.fn(),
  getCategories: vi.fn(),
  getSubscriptions: vi.fn(),
  setSubscriptionStatus: vi.fn(),
}));

const category: CategoryRecord = {
  id: "entertainment",
  name: "Entertainment",
  kind: "expense",
  color: "#7363a6",
  archived: false,
  system: false,
};

const record: SubscriptionRecord = {
  id: "subscription-1",
  name: "Music streaming",
  amountMinor: 199_00,
  currency: "PHP",
  billingCycle: "monthly",
  nextBillingDate: "2026-07-25",
  status: "active",
  categoryId: category.id,
  categoryName: category.name,
  categoryColor: category.color,
};

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <SubscriptionsPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

afterEach(cleanup);

describe("SubscriptionsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCategories).mockResolvedValue([category]);
    vi.mocked(createSubscription).mockResolvedValue(record);
    vi.mocked(setSubscriptionStatus).mockResolvedValue({ ...record, status: "canceled" });
  });

  it("renders the summary and exact five-column subscription table", async () => {
    const summary: SubscriptionMonthSummary = {
      month: "2026-07-01",
      currency: "PHP",
      totalMonthlyCostMinor: 199_00,
      items: [{ ...record, billingDate: "2026-07-25", monthlyCostMinor: 199_00 }],
    };
    vi.mocked(getSubscriptions).mockResolvedValue(summary);
    const user = userEvent.setup();
    renderPage();

    expect(
      await screen.findByRole("heading", { name: "Monthly subscriptions" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Track recurring charges and see what they add up to."),
    ).toBeInTheDocument();
    expect(await screen.findByText("Total monthly cost")).toBeInTheDocument();
    expect(screen.getAllByText("₱199")).toHaveLength(2);
    expect(screen.getAllByRole("columnheader").map((header) => header.textContent)).toEqual([
      "Name",
      "Category",
      "Amount",
      "Billing date",
      "Status",
    ]);

    await user.click(screen.getByRole("button", { name: "Cancel Music streaming" }));
    await waitFor(() =>
      expect(setSubscriptionStatus).toHaveBeenCalledWith(
        { key: "user:test-user", userId: "test-user" },
        { id: "subscription-1", input: { status: "canceled" } },
      ),
    );
    expect(getSubscriptions).toHaveBeenCalledWith(
      { key: "user:test-user", userId: "test-user" },
      expect.stringMatching(/^\d{4}-\d{2}-01$/),
    );
  });

  it("shows the clean starting point and opens the add form from its CTA", async () => {
    vi.mocked(getSubscriptions).mockResolvedValue({
      month: "2026-07-01",
      currency: "PHP",
      totalMonthlyCostMinor: 0,
      items: [],
    });
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText("A clean starting point")).toBeInTheDocument();
    expect(screen.getByText("Start with your recurring charges")).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "Add a subscription" })[1]!);
    expect(screen.getByRole("dialog", { name: "Add subscription" })).toBeInTheDocument();
  });
});
