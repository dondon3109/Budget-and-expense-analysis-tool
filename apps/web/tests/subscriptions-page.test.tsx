// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import type { CategoryRecord, SubscriptionMonthSummary, SubscriptionRecord } from "@zoption/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
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
  renewalBlockedReason: null,
  categoryId: category.id,
  categoryName: category.name,
  categoryColor: category.color,
  accountId: "account-bank",
  accountName: "Bank",
};

/** Publishes the current URL so tests can assert what the view toggles navigated to. */
function LocationProbe() {
  const location = useLocation();
  return <span data-location={`${location.pathname}${location.search}`} />;
}

/** Offers a back button so a test can prove the toggles do not fill the history stack. */
function BackProbe() {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => void navigate(-1)}>
      History back
    </button>
  );
}

function currentLocation(): string | null {
  return document.querySelector("[data-location]")?.getAttribute("data-location") ?? null;
}

function renderPage(initialEntries: string[] = ["/app/subscriptions"]) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={initialEntries}>
        <QueryClientProvider client={queryClient}>
          <LocationProbe />
          <BackProbe />
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

  it("names the overdue cycle when a subscription is not being renewed", async () => {
    vi.mocked(getSubscriptions).mockResolvedValue({
      month: "2026-07-01",
      currency: "PHP",
      totalMonthlyCostMinor: 199_00,
      items: [
        {
          ...record,
          renewalBlockedReason: "insufficient_balance",
          // The blocked cycle is June even though the July billing date is on screen.
          nextBillingDate: "2026-06-25",
          billingDate: "2026-07-25",
          monthlyCostMinor: 199_00,
        },
      ],
    });
    renderPage();

    expect(
      await screen.findByText("Jun 25, 2026 not renewed: not enough balance"),
    ).toBeInTheDocument();
  });

  it("says when a due subscription is paid from a removed account", async () => {
    vi.mocked(getSubscriptions).mockResolvedValue({
      month: "2026-07-01",
      currency: "PHP",
      totalMonthlyCostMinor: 199_00,
      items: [
        {
          ...record,
          renewalBlockedReason: "account_archived",
          nextBillingDate: "2026-07-25",
          billingDate: "2026-07-25",
          monthlyCostMinor: 199_00,
        },
      ],
    });
    renderPage();

    expect(
      await screen.findByText("Jul 25, 2026 not renewed: account removed"),
    ).toBeInTheDocument();
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
    // The status action must come back once the mutation settles, not stay on "Updating…".
    // The refetch still returns the active record, so the row settles back on "Cancel".
    await waitFor(() => expect(screen.queryByText("Updating…")).not.toBeInTheDocument());
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Cancel Music streaming" })).toBeEnabled(),
    );
  });

  it("scopes every subscription header and names the renewals table", async () => {
    vi.mocked(getSubscriptions).mockResolvedValue({
      month: "2026-07-01",
      currency: "PHP",
      totalMonthlyCostMinor: 199_00,
      items: [{ ...record, billingDate: "2026-07-25", monthlyCostMinor: 199_00 }],
    });
    renderPage();

    const table = await screen.findByRole("table", { name: "Subscription renewals" });
    const headers = within(table).getAllByRole("columnheader");
    expect(headers.map((header) => header.textContent)).toEqual([
      "Name",
      "Category",
      "Amount",
      "Billing date",
      "Status",
      "Actions",
    ]);
    for (const header of headers) {
      expect(header).toHaveAttribute("scope", "col");
    }
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

  it("renders the cashflow forecast even when there are no subscriptions", async () => {
    vi.mocked(getSubscriptions).mockResolvedValue({
      month: "2026-07-01",
      currency: "PHP",
      totalMonthlyCostMinor: 0,
      items: [],
    });
    const user = userEvent.setup();
    renderPage();

    await screen.findByText("Start with your recurring charges");
    await user.click(screen.getByRole("button", { name: "Cashflow Forecast" }));

    expect(
      screen.getByRole("heading", { name: "Upcoming Balance & Obligation Forecast" }),
    ).toBeInTheDocument();
    expect(screen.getByText("No upcoming bills in this period")).toBeInTheDocument();
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

  it("deletes a subscription through the shared confirm dialog and never calls window.confirm", async () => {
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

    const dialog = await screen.findByRole("alertdialog", {
      name: "Delete “Music streaming”?",
    });
    expect(within(dialog).getByText(/cannot be undone/i)).toBeInTheDocument();
    expect(deleteSubscription).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: "Delete subscription" }));

    await waitFor(() =>
      expect(deleteSubscription).toHaveBeenCalledWith(
        { key: "user:test-user", userId: "test-user" },
        "subscription-1",
      ),
    );
    expect(confirmSpy).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("skips deletion when the shared confirm dialog is cancelled", async () => {
    const summary: SubscriptionMonthSummary = {
      month: "2026-07-01",
      currency: "PHP",
      totalMonthlyCostMinor: 199_00,
      items: [{ ...record, billingDate: "2026-07-25", monthlyCostMinor: 199_00 }],
    };
    vi.mocked(getSubscriptions).mockResolvedValue(summary);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Delete Music streaming" }));
    const dialog = await screen.findByRole("alertdialog", {
      name: "Delete “Music streaming”?",
    });
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(deleteSubscription).not.toHaveBeenCalled();
    expect(screen.getByText("Music streaming")).toBeInTheDocument();
  });

  it("switches to the visual renewal calendar interface and displays month grid, cash-flow impact, and payment schedule", async () => {
    const today = new Date();
    const testMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
    const billingDate = `${testMonth}-25`;
    const summary: SubscriptionMonthSummary = {
      month: `${testMonth}-01`,
      currency: "PHP",
      totalMonthlyCostMinor: 199_00,
      items: [{ ...record, billingDate, monthlyCostMinor: 199_00 }],
    };
    vi.mocked(getSubscriptions).mockResolvedValue(summary);
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByRole("button", { name: "Renewal calendar" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Renewal calendar" }));

    // Verify Cash-flow impact summary
    expect(screen.getByText("Total outflow this month")).toBeInTheDocument();
    expect(screen.getByText("Paid to date")).toBeInTheDocument();
    expect(screen.getByText("Remaining to be paid")).toBeInTheDocument();

    // Verify Calendar Grid
    expect(
      screen.getByRole("heading", { level: 3, name: "Renewal Calendar Grid" }),
    ).toBeInTheDocument();
    const renewalGrid = screen.getByRole("grid", { name: /^Renewals in/ });
    // The defect this pins: the weekday headers and day cells sat directly under the grid with no
    // role="row" between them, the same invalid structure the main calendar had.
    expect(
      Array.from(renewalGrid.children).some((child) => child.getAttribute("role") === "gridcell"),
    ).toBe(false);
    const renewalRows = within(renewalGrid).getAllByRole("row");
    expect(within(renewalRows[0]!).getAllByRole("columnheader")).toHaveLength(7);
    for (const row of renewalRows.slice(1)) {
      expect(within(row).getAllByRole("gridcell")).toHaveLength(7);
    }

    // Verify Payment Schedule & Upcoming Billing Cycles timeline
    expect(
      screen.getByRole("heading", {
        level: 3,
        name: "Payment Schedule & Upcoming Billing Cycles",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Debited from:")).toBeInTheDocument();
    expect(screen.getByText("Monthly billing")).toBeInTheDocument();

    // Select date cell to filter
    const renewalCell = screen.getByRole("button", { name: /25, 2026/ });
    await user.click(renewalCell);
    expect(screen.getByText(/Filtered to/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear filter" })).toBeInTheDocument();

    // Clear filter
    await user.click(screen.getByRole("button", { name: "Clear filter" }));
    expect(screen.queryByRole("button", { name: "Clear filter" })).not.toBeInTheDocument();

    // Click edit in timeline
    await user.click(screen.getByRole("button", { name: "Edit Music streaming" }));
    expect(screen.getByRole("dialog", { name: "Edit subscription" })).toBeInTheDocument();
  });

  it("switches to the cashflow forecast view and displays projection controls", async () => {
    const summary: SubscriptionMonthSummary = {
      month: "2026-07-01",
      currency: "PHP",
      totalMonthlyCostMinor: 199_00,
      items: [{ ...record, billingDate: "2026-07-25", monthlyCostMinor: 199_00 }],
    };
    vi.mocked(getSubscriptions).mockResolvedValue(summary);
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByRole("button", { name: "Cashflow Forecast" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cashflow Forecast" }));

    expect(
      screen.getByRole("heading", { level: 2, name: "Upcoming Balance & Obligation Forecast" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Forecast horizon" })).toBeInTheDocument();
  });

  it("opens the view named by the ?view search param", async () => {
    vi.mocked(getSubscriptions).mockResolvedValue({
      month: "2026-07-01",
      currency: "PHP",
      totalMonthlyCostMinor: 199_00,
      items: [{ ...record, billingDate: "2026-07-25", monthlyCostMinor: 199_00 }],
    });
    renderPage(["/app/subscriptions?view=forecast"]);

    expect(
      await screen.findByRole("heading", { name: "Upcoming Balance & Obligation Forecast" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cashflow Forecast" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(currentLocation()).toBe("/app/subscriptions?view=forecast");
  });

  it("falls back to the table view for a missing or unknown view param", async () => {
    vi.mocked(getSubscriptions).mockResolvedValue({
      month: "2026-07-01",
      currency: "PHP",
      totalMonthlyCostMinor: 199_00,
      items: [{ ...record, billingDate: "2026-07-25", monthlyCostMinor: 199_00 }],
    });
    renderPage(["/app/subscriptions?view=timeline"]);

    expect(await screen.findByRole("table", { name: "Subscription renewals" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Table" })).toHaveAttribute("aria-pressed", "true");
  });

  it("writes the selected view to the URL and replaces history instead of growing it", async () => {
    vi.mocked(getSubscriptions).mockResolvedValue({
      month: "2026-07-01",
      currency: "PHP",
      totalMonthlyCostMinor: 199_00,
      items: [{ ...record, billingDate: "2026-07-25", monthlyCostMinor: 199_00 }],
    });
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Renewal calendar" }));
    expect(currentLocation()).toBe("/app/subscriptions?view=calendar");

    await user.click(screen.getByRole("button", { name: "Cashflow Forecast" }));
    expect(currentLocation()).toBe("/app/subscriptions?view=forecast");

    await user.click(screen.getByRole("button", { name: "Table" }));
    expect(currentLocation()).toBe("/app/subscriptions");

    // Every toggle replaced its entry, so there is nothing to go back to.
    await user.click(screen.getByRole("button", { name: "History back" }));
    expect(currentLocation()).toBe("/app/subscriptions");
  });

  it("keeps the empty state for the calendar view when the month has no subscriptions", async () => {
    vi.mocked(getSubscriptions).mockResolvedValue({
      month: "2026-07-01",
      currency: "PHP",
      totalMonthlyCostMinor: 0,
      items: [],
    });
    renderPage(["/app/subscriptions?view=calendar"]);

    expect(await screen.findByText("Start with your recurring charges")).toBeInTheDocument();
    expect(screen.queryByRole("grid", { name: /^Renewals in/ })).not.toBeInTheDocument();
  });

  it("renders the forecast from a deep link even when the month has no subscriptions", async () => {
    vi.mocked(getSubscriptions).mockResolvedValue({
      month: "2026-07-01",
      currency: "PHP",
      totalMonthlyCostMinor: 0,
      items: [],
    });
    renderPage(["/app/subscriptions?view=forecast"]);

    expect(
      await screen.findByRole("heading", { name: "Upcoming Balance & Obligation Forecast" }),
    ).toBeInTheDocument();
    expect(screen.getByText("No upcoming bills in this period")).toBeInTheDocument();
    expect(screen.queryByText("Start with your recurring charges")).not.toBeInTheDocument();
  });
});
