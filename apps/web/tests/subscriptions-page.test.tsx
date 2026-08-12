// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import type { CategoryRecord, SubscriptionMonthSummary, SubscriptionRecord } from "@zoption/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createSubscription,
  deleteSubscription,
  getAccounts,
  getCategories,
  getSubscriptions,
  setSubscriptionStatus,
  updateSubscription,
} from "../src/lib/api";
import { SubscriptionsPage } from "../src/pages/SubscriptionsPage";
import { ThemeProvider } from "../src/theme/ThemeProvider";

vi.mock("../src/auth/AuthProvider", () => ({
  useAuth: () => ({
    user: { id: "test-user", email: "test@example.com" },
    signOut: vi.fn(),
  }),
}));

vi.mock("../src/lib/api", () => ({
  createSubscription: vi.fn(),
  deleteSubscription: vi.fn(),
  getAccounts: vi.fn(),
  getCategories: vi.fn(),
  getCustomerReviewState: vi.fn().mockResolvedValue({ review: {}, promptEligible: false }),
  getSubscriptions: vi.fn(),
  setSubscriptionStatus: vi.fn(),
  updateSubscription: vi.fn(),
  saveCustomerReview: vi.fn(),
}));

const category: CategoryRecord = {
  id: "entertainment",
  name: "Entertainment",
  kind: "expense",
  color: "#7363a6",
  archived: false,
  system: false,
  origin: "custom",
  requiredPlan: "free",
  locked: false,
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
  accountId: "account-bank",
  accountName: "Bank",
};

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <ThemeProvider>
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <SubscriptionsPage />
        </QueryClientProvider>
      </MemoryRouter>
    </ThemeProvider>,
  );
}

afterEach(cleanup);

describe("SubscriptionsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCategories).mockResolvedValue([category]);
    vi.mocked(getAccounts).mockResolvedValue([
      {
        id: "account-bank",
        name: "Bank",
        type: "checking",
        currency: "PHP",
        balanceMinor: null,
        balanceAsOf: null,
        archived: false,
      },
    ]);
    vi.mocked(createSubscription).mockResolvedValue(record);
    vi.mocked(setSubscriptionStatus).mockResolvedValue({ ...record, status: "canceled" });
    vi.mocked(updateSubscription).mockResolvedValue({ ...record, name: "Music streaming Plus" });
    vi.mocked(deleteSubscription).mockResolvedValue(undefined);
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
      "Actions",
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

  it("opens the edit form prefilled and saves the updated subscription", async () => {
    const summary: SubscriptionMonthSummary = {
      month: "2026-07-01",
      currency: "PHP",
      totalMonthlyCostMinor: 199_00,
      items: [{ ...record, billingDate: "2026-07-25", monthlyCostMinor: 199_00 }],
    };
    vi.mocked(getSubscriptions).mockResolvedValue(summary);
    const updateInput = {
      name: "Music streaming Plus",
      amountMinor: 249_00,
      billingCycle: "monthly",
      nextBillingDate: "2026-07-25",
      categoryId: "entertainment",
      accountId: "account-bank",
    };
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Edit Music streaming" }));
    const dialog = screen.getByRole("dialog", { name: "Edit subscription" });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toHaveValue("Music streaming");
    expect(screen.getByLabelText("Amount")).toHaveValue("199");

    await user.clear(screen.getByLabelText("Name"));
    await user.type(screen.getByLabelText("Name"), "Music streaming Plus");
    await user.clear(screen.getByLabelText("Amount"));
    await user.type(screen.getByLabelText("Amount"), "249");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(updateSubscription).toHaveBeenCalledWith(
        { key: "user:test-user", userId: "test-user" },
        { id: "subscription-1", input: updateInput },
      ),
    );
  });

  it("deletes a subscription after confirming", async () => {
    const summary: SubscriptionMonthSummary = {
      month: "2026-07-01",
      currency: "PHP",
      totalMonthlyCostMinor: 199_00,
      items: [{ ...record, billingDate: "2026-07-25", monthlyCostMinor: 199_00 }],
    };
    vi.mocked(getSubscriptions).mockResolvedValue(summary);
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Delete Music streaming" }));

    await waitFor(() =>
      expect(deleteSubscription).toHaveBeenCalledWith(
        { key: "user:test-user", userId: "test-user" },
        "subscription-1",
      ),
    );
    expect(confirmSpy).toHaveBeenCalledWith("Delete “Music streaming”? This cannot be undone.");
    confirmSpy.mockRestore();
  });

  it("skips deletion when the user declines the confirmation", async () => {
    const summary: SubscriptionMonthSummary = {
      month: "2026-07-01",
      currency: "PHP",
      totalMonthlyCostMinor: 199_00,
      items: [{ ...record, billingDate: "2026-07-25", monthlyCostMinor: 199_00 }],
    };
    vi.mocked(getSubscriptions).mockResolvedValue(summary);
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Delete Music streaming" }));

    expect(deleteSubscription).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });
});
