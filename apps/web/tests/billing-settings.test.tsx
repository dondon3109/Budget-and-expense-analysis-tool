// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import type { User } from "@supabase/supabase-js";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type {
  BillingCheckoutReconciliation,
  BillingSubscriptionStatus,
  BillingSummary,
} from "@zoption/shared";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({
  addSponsoredProSeat: vi.fn(),
  cancelBillingSubscription: vi.fn(),
  getBillingSummary: vi.fn(),
  getSponsoredProSeats: vi.fn(),
  inviteSponsoredProRecipient: vi.fn(),
  isApiRequestError: vi.fn(),
  replaceSponsoredProSeat: vi.fn(),
  reconcileBillingCheckout: vi.fn(),
  resendSponsoredProInvitation: vi.fn(),
  revokeSponsoredProSeat: vi.fn(),
  startBillingCheckout: vi.fn(),
}));

vi.mock("../src/lib/api", () => apiMocks);
import { BillingSettings } from "../src/components/account/BillingSettings";

const user = {
  id: "user-1",
  email: "user@example.com",
  user_metadata: {},
} as User;

function summary(
  status: BillingSubscriptionStatus | null,
  overrides: Partial<BillingSummary> = {},
): BillingSummary {
  const paid = status === "active" || status === "trialing";
  const base = {
    plan: paid ? "zoption_pro" : "free",
    entitlementSource: paid ? "paypal" : null,
    provider: status ? "paypal" : null,
    status,
    interval: status ? "month" : null,
    currentPeriodEndsAt: status ? "2026-08-30T00:00:00.000Z" : null,
    scheduledChangeAt: null,
    cancelAtPeriodEnd: false,
    pendingCheckout: null,
    canCheckout: status === null || status === "canceled",
    canManageBilling: status !== null,
    canManageSponsoredSeats: false,
    nonTerminalSubscriptionCount: status && status !== "canceled" ? 1 : 0,
    usages: [
      {
        feature: "assistant_question",
        used: 2,
        limit: paid ? 100 : 4,
        periodKind: "anchored_14_day",
        periodStartedAt: "2026-07-18T00:00:00.000Z",
        resetsAt: "2026-08-01T00:00:00.000Z",
      },
      {
        feature: "file_import",
        used: 1,
        limit: paid ? 10 : 1,
        periodKind: "calendar_month",
        periodStartedAt: "2026-07-01T00:00:00.000Z",
        resetsAt: "2026-08-01T00:00:00.000Z",
      },
    ],
    allowances: [{ resource: "custom_category", used: 1, limit: paid ? null : 1 }],
  } satisfies BillingSummary;
  return {
    ...base,
    ...overrides,
    entitlementSource: overrides.entitlementSource ?? base.entitlementSource,
    canManageSponsoredSeats: overrides.canManageSponsoredSeats ?? base.canManageSponsoredSeats,
  };
}

function CurrentLocation() {
  const location = useLocation();
  return (
    <output data-testid="current-location">{`${location.pathname}${location.search}${location.hash}`}</output>
  );
}

function renderSettings(
  value: BillingSummary,
  initialEntry = "/app/settings",
  reconciliations?: BillingCheckoutReconciliation[],
) {
  apiMocks.getBillingSummary.mockResolvedValue(value);
  const defaultReconciliation = {
    outcome: "pending",
    summary: {
      ...value,
      pendingCheckout: {
        provider: "paypal",
        interval: "month",
        createdAt: "2026-08-01T00:00:00.000Z",
        expiresAt: "2099-08-01T00:15:00.000Z",
      },
      canCheckout: false,
    },
  } satisfies BillingCheckoutReconciliation;
  const responses = reconciliations?.length ? reconciliations : [defaultReconciliation];
  apiMocks.reconcileBillingCheckout.mockReset();
  for (const response of responses) {
    apiMocks.reconcileBillingCheckout.mockResolvedValueOnce(response);
  }
  apiMocks.reconcileBillingCheckout.mockResolvedValue(responses[responses.length - 1]!);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <BillingSettings user={user} />
        <CurrentLocation />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("BillingSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.addSponsoredProSeat.mockResolvedValue({});
    apiMocks.cancelBillingSubscription.mockResolvedValue({ cancellationRequested: true });
    apiMocks.getSponsoredProSeats.mockResolvedValue({
      activeCount: 0,
      availableCount: 5,
      pendingCount: 0,
      seats: [],
    });
    apiMocks.startBillingCheckout.mockResolvedValue({
      approvalUrl: "https://www.sandbox.paypal.com/checkoutnow?token=test",
    });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it.each([
    ["active", "Zoption Pro is active"],
    ["trialing", "Your Zoption Pro trial is active"],
    ["past_due", "Your payment needs attention"],
    ["paused", "Your subscription is paused"],
    ["canceled", "Your previous subscription has ended"],
  ] as const)("describes the %s subscription state", async (status, heading) => {
    renderSettings(summary(status));

    expect(await screen.findByText(heading)).toBeInTheDocument();
  });

  it("describes permanent complementary Pro without a renewal date", async () => {
    renderSettings(
      summary(null, {
        plan: "zoption_pro",
        entitlementSource: "platform_admin",
        canCheckout: true,
      }),
    );

    expect(
      await screen.findByText("Your permanent complimentary Pro access is active"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Renews|Period ends/)).not.toBeInTheDocument();
  });

  it("restores payment confirmation from a durable pending checkout", async () => {
    const pending = summary(null, {
      pendingCheckout: {
        provider: "paypal",
        interval: "month",
        createdAt: "2026-08-01T00:00:00.000Z",
        expiresAt: "2099-08-01T00:15:00.000Z",
      },
      canCheckout: false,
    });
    renderSettings(pending);

    expect(await screen.findByText("Confirming your payment")).toBeInTheDocument();
    expect(screen.queryByText("You’re using the Free plan")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Choose a Pro plan" })).not.toBeInTheDocument();
    expect(apiMocks.reconcileBillingCheckout).toHaveBeenCalledTimes(1);
  });

  it("shows durable review copy after the PayPal confirmation window expires", async () => {
    const pending = summary(null, {
      pendingCheckout: {
        provider: "paypal",
        interval: "month",
        createdAt: "2026-08-01T00:00:00.000Z",
        expiresAt: "2026-08-01T00:15:00.000Z",
      },
      canCheckout: false,
    });
    renderSettings(pending, "/app/settings#plan-and-billing", [
      { outcome: "review_required", summary: pending },
    ]);

    expect(await screen.findByText("PayPal confirmation needs more time")).toBeInTheDocument();
    expect(screen.getByText(/No paid access has been granted yet/i)).toBeInTheDocument();
    expect(screen.getByText(/do not start another subscription/i)).toBeInTheDocument();
  });

  it("lets a user in the review state start a new checkout once the abandoned checkout is closed", async () => {
    const pending = summary(null, {
      pendingCheckout: {
        provider: "paypal",
        interval: "month",
        createdAt: "2026-08-01T00:00:00.000Z",
        expiresAt: "2026-08-01T00:15:00.000Z",
      },
      canCheckout: false,
    });
    const closed = summary(null, { pendingCheckout: null, canCheckout: true });
    renderSettings(pending, "/app/settings#plan-and-billing", [
      { outcome: "review_required", summary: pending },
      { outcome: "closed", summary: closed },
    ]);

    const startButton = await screen.findByRole("button", { name: "Start a new checkout" });
    fireEvent.click(startButton);

    expect(
      await screen.findByRole("dialog", { name: "Choose how you want to use Zoption Pro" }),
    ).toBeInTheDocument();
  });

  it("automatically reflects an activated checkout in Plan and billing", async () => {
    vi.useFakeTimers();
    const freeSummary = summary(null);
    renderSettings(freeSummary, "/app/settings?checkout=completed#plan-and-billing");

    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByText("Confirming your payment")).toBeInTheDocument();

    apiMocks.getBillingSummary.mockResolvedValue(summary("active"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });

    expect(screen.getByText("Zoption Pro is active")).toBeInTheDocument();
    expect(screen.getByTestId("current-location")).toHaveTextContent(
      "/app/settings#plan-and-billing",
    );
    expect(screen.queryByText("Confirming your payment")).not.toBeInTheDocument();
  });

  it("keeps checking after the fast window and preserves unrelated URL state", async () => {
    vi.useFakeTimers();
    const freeSummary = summary(null);
    renderSettings(freeSummary, "/app/settings?checkout=completed&source=account#plan-and-billing");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(18_000);
    });

    expect(screen.getByText("Confirming your payment")).toBeInTheDocument();
    expect(screen.queryByText("You’re using the Free plan")).not.toBeInTheDocument();
    expect(screen.getByText(/Zoption is still checking/i)).toBeInTheDocument();
    expect(screen.queryByText("Current plan")).not.toBeInTheDocument();
    expect(screen.getByTestId("current-location")).toHaveTextContent(
      "/app/settings?checkout=completed&source=account#plan-and-billing",
    );

    apiMocks.getBillingSummary.mockResolvedValue(summary("active"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    expect(screen.getByText("Zoption Pro is active")).toBeInTheDocument();
    expect(screen.getByTestId("current-location")).toHaveTextContent(
      "/app/settings?source=account#plan-and-billing",
    );
  });

  it("retries canonical reconciliation until PayPal confirms the subscription", async () => {
    vi.useFakeTimers();
    const pending = summary(null, {
      pendingCheckout: {
        provider: "paypal",
        interval: "month",
        createdAt: "2026-08-01T00:00:00.000Z",
        expiresAt: "2099-08-01T00:15:00.000Z",
      },
      canCheckout: false,
    });
    const active = summary("active");
    renderSettings(pending, "/app/settings?checkout=completed&source=account#plan-and-billing", [
      { outcome: "pending", summary: pending },
      { outcome: "confirmed", summary: active },
    ]);
    apiMocks.getBillingSummary.mockImplementation(async () =>
      apiMocks.reconcileBillingCheckout.mock.calls.length >= 2 ? active : pending,
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(apiMocks.reconcileBillingCheckout).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Confirming your payment")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(8_000);
    });
    expect(apiMocks.reconcileBillingCheckout).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(apiMocks.reconcileBillingCheckout).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Zoption Pro is active")).toBeInTheDocument();
    expect(screen.getByTestId("current-location")).toHaveTextContent(
      "/app/settings?source=account#plan-and-billing",
    );

    const summaryCallsAfterConfirmation = apiMocks.getBillingSummary.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(apiMocks.reconcileBillingCheckout).toHaveBeenCalledTimes(2);
    expect(apiMocks.getBillingSummary).toHaveBeenCalledTimes(summaryCallsAfterConfirmation);
  });

  it("accepts an active PayPal summary when a webhook wins the reconciliation race", async () => {
    const pending = summary(null, {
      pendingCheckout: {
        provider: "paypal",
        interval: "month",
        createdAt: "2026-08-01T00:00:00.000Z",
        expiresAt: "2099-08-01T00:15:00.000Z",
      },
      canCheckout: false,
    });
    const active = summary("active");
    renderSettings(pending, "/app/settings?checkout=completed#plan-and-billing", [
      { outcome: "none", summary: active },
    ]);

    expect(await screen.findByText("Zoption Pro is active")).toBeInTheDocument();
    expect(
      screen.queryByText(/could not find a payment awaiting confirmation/i),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("current-location")).toHaveTextContent(
      "/app/settings#plan-and-billing",
    );
  });

  it("stops bounded polling and confirms Pro through a manual status check", async () => {
    vi.useFakeTimers();
    const freeSummary = summary(null);
    renderSettings(freeSummary, "/app/settings?checkout=completed#plan-and-billing");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(128_000);
    });

    expect(screen.getByText("Confirming your payment")).toBeInTheDocument();
    expect(screen.getByText(/Payment confirmation is still pending/i)).toBeInTheDocument();
    const refresh = screen.getByRole("button", { name: "Check payment status" });
    expect(refresh).toBeEnabled();

    const callsAfterPolling = apiMocks.getBillingSummary.mock.calls.length;
    const reconciliationsAfterPolling = apiMocks.reconcileBillingCheckout.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(apiMocks.getBillingSummary).toHaveBeenCalledTimes(callsAfterPolling);
    expect(apiMocks.reconcileBillingCheckout).toHaveBeenCalledTimes(reconciliationsAfterPolling);

    const active = summary("active");
    apiMocks.reconcileBillingCheckout.mockResolvedValue({ outcome: "confirmed", summary: active });
    apiMocks.getBillingSummary.mockResolvedValue(active);
    fireEvent.click(refresh);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText("Zoption Pro is active")).toBeInTheDocument();
    expect(screen.getByTestId("current-location")).toHaveTextContent(
      "/app/settings#plan-and-billing",
    );
    expect(screen.queryByRole("button", { name: "Check payment status" })).not.toBeInTheDocument();
  });

  it("keeps manual payment confirmation retryable after a refresh error", async () => {
    vi.useFakeTimers();
    const freeSummary = summary(null);
    renderSettings(freeSummary, "/app/settings?checkout=completed#plan-and-billing");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(128_000);
    });

    apiMocks.getBillingSummary.mockRejectedValueOnce(new Error("Billing status is unavailable."));
    const refresh = screen.getByRole("button", { name: "Check payment status" });
    fireEvent.click(refresh);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByRole("alert")).toHaveTextContent("Billing status is unavailable.");
    expect(screen.getByText("Confirming your payment")).toBeInTheDocument();
    expect(screen.getByTestId("current-location")).toHaveTextContent("checkout=completed");
    expect(screen.getByRole("button", { name: "Check payment status" })).toBeEnabled();
  });

  it("shows the Free plan with checkout when there is no subscription", async () => {
    renderSettings(summary(null));

    expect(await screen.findByText("You’re using the Free plan")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choose a Pro plan" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Upgrade monthly|Upgrade annually/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Manage billing" })).not.toBeInTheDocument();
  });

  it("opens the Pro plan chooser and returns focus to its Settings trigger", async () => {
    renderSettings(summary(null));

    const trigger = await screen.findByRole("button", { name: "Choose a Pro plan" });
    trigger.focus();
    fireEvent.click(trigger);

    const dialog = await screen.findByRole("dialog", {
      name: "Choose how you want to use Zoption Pro",
    });
    expect(screen.getByRole("button", { name: "Continue using free plan" })).toHaveFocus();
    expect(screen.getByRole("button", { name: "Subscribe Monthly · ₱149/month" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Subscribe Annual · ₱1,299/year" })).toBeVisible();

    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(
      screen.queryByRole("dialog", { name: "Choose how you want to use Zoption Pro" }),
    ).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("places the comparison before billing and sponsored-seat management", async () => {
    renderSettings(
      summary(null, {
        plan: "zoption_pro",
        entitlementSource: "platform_admin",
        canCheckout: false,
        canManageSponsoredSeats: true,
      }),
    );

    const email = await screen.findByLabelText("Recipient email");
    const addSeat = screen.getByRole("button", { name: "Add seat" });
    const comparisonSection = screen
      .getByRole("heading", { name: "Free and Pro, side by side" })
      .closest("section");
    const billingSection = screen
      .getByRole("heading", { name: "Plan and billing" })
      .closest("section");
    const sponsoredSection = screen
      .getByRole("heading", { name: "Sponsored Pro seats" })
      .closest("section");

    expect(email).toBeVisible();
    expect(email).toBeEnabled();
    expect(email).toHaveAccessibleDescription(
      /must sign in and confirm their email before a seat can be active/i,
    );
    expect(addSeat).toBeDisabled();
    expect(comparisonSection?.nextElementSibling).toBe(billingSection);
    expect(billingSection?.nextElementSibling).toBe(sponsoredSection);

    fireEvent.change(email, { target: { value: "recipient@example.com" } });
    expect(addSeat).toBeEnabled();
    fireEvent.click(addSeat);

    expect(await screen.findByText("Sponsored Pro seat added.")).toBeInTheDocument();
    expect(apiMocks.addSponsoredProSeat).toHaveBeenCalledWith(
      { key: "user:user-1", userId: "user-1" },
      "recipient@example.com",
    );
  });

  it("does not mount sponsored seat management for a non-administrator", async () => {
    renderSettings(summary(null));

    await screen.findByText("Free and Pro, side by side");

    expect(screen.queryByRole("heading", { name: "Sponsored Pro seats" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Recipient email")).not.toBeInTheDocument();
    expect(apiMocks.getSponsoredProSeats).not.toHaveBeenCalled();
  });

  it("shows exact Free and Pro limits, including the category allowance", async () => {
    renderSettings(summary(null));

    expect(await screen.findByText("Free and Pro, side by side")).toBeInTheDocument();
    expect(screen.getByText("4 questions per 14-day cycle")).toBeInTheDocument();
    expect(screen.getByText("10 committed imports per month")).toBeInTheDocument();
    expect(
      screen.getByText("1 active custom category, plus included starters"),
    ).toBeInTheDocument();
    expect(screen.getByText("Unlimited active custom categories")).toBeInTheDocument();
    expect(screen.getByText("Weekly cashflow view")).toBeInTheDocument();
    expect(screen.getByText("Adds monthly and six-month cashflow views")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Active custom categories" })).toHaveAttribute(
      "aria-valuenow",
      "1",
    );
  });

  it("labels the comparison and clearly identifies the Free plan as current", async () => {
    renderSettings(summary(null));

    const regions = await screen.findAllByRole("region", { name: "Free and Pro, side by side" });
    const comparison = regions.find((el) => el.getAttribute("tabindex") === "0")!;
    const table = within(comparison).getByRole("table", {
      name: "Free and Zoption Pro plan feature comparison",
    });
    const freeHeader = within(table).getByRole("columnheader", { name: /Free\s*Current plan/ });
    const proHeader = within(table).getByRole("columnheader", { name: "Zoption Pro" });

    expect(comparison).toHaveAttribute("tabindex", "0");
    expect(comparison).toHaveAttribute(
      "aria-describedby",
      "billing-plan-comparison-description billing-plan-scroll-hint",
    );
    expect(freeHeader).toHaveAttribute("aria-current", "true");
    expect(proHeader).not.toHaveAttribute("aria-current");
    expect(within(table).getAllByText("Current plan")).toHaveLength(1);
    expect(screen.queryByText(/Effective plan:/)).not.toBeInTheDocument();
  });

  it("identifies Zoption Pro as current for active subscriptions", async () => {
    renderSettings(summary("active"));

    const table = await screen.findByRole("table", {
      name: "Free and Zoption Pro plan feature comparison",
    });
    const freeHeader = within(table).getByRole("columnheader", { name: "Free" });
    const proHeader = within(table).getByRole("columnheader", {
      name: /Zoption Pro\s*Current plan/,
    });

    expect(freeHeader).not.toHaveAttribute("aria-current");
    expect(proHeader).toHaveAttribute("aria-current", "true");
    expect(within(table).getAllByText("Current plan")).toHaveLength(1);
  });

  it("uses capability flags for billing actions", async () => {
    renderSettings(
      summary("past_due", {
        canCheckout: false,
        canManageBilling: true,
      }),
    );

    expect(await screen.findByText(/new checkout is unavailable/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Choose a Pro plan" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel renewal" })).not.toBeInTheDocument();
  });

  it("warns when PayPal reports duplicate ongoing subscriptions", async () => {
    renderSettings(summary("active", { nonTerminalSubscriptionCount: 2 }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "More than one ongoing subscription",
    );
  });

  it("shows a brief neutral message when PayPal checkout is canceled", async () => {
    renderSettings(summary(null), "/app/settings?checkout=cancelled#plan-and-billing");

    expect(
      await screen.findByText(/PayPal checkout was closed.*verified subscription status/i),
    ).toBeInTheDocument();
    expect(screen.getByTestId("current-location")).toHaveTextContent(
      "/app/settings#plan-and-billing",
    );
  });

  it("waits for a verified cancellation before updating the billing state", async () => {
    vi.useFakeTimers();
    const active = summary("active");
    const canceled = summary("canceled", {
      plan: "zoption_pro",
      entitlementSource: "paypal",
      cancelAtPeriodEnd: true,
      pendingCheckout: null,
      canCheckout: false,
      nonTerminalSubscriptionCount: 0,
    });
    apiMocks.getBillingSummary
      .mockResolvedValueOnce(active)
      .mockResolvedValueOnce(active)
      .mockResolvedValueOnce(canceled);
    renderSettings(active);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    const trigger = screen.getByRole("button", { name: "Cancel renewal" });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Cancel renewal?" });
    expect(dialog).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel renewal" }));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(apiMocks.cancelBillingSubscription).toHaveBeenCalledWith({
      key: "user:user-1",
      userId: "user-1",
    });
    expect(screen.getByText("Confirming your cancellation")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });

    expect(
      screen.getByText("Your Pro access remains available until the paid period ends"),
    ).toBeInTheDocument();
    expect(screen.getByText("Period ends Aug 30, 2026")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel renewal" })).not.toBeInTheDocument();
  });
});
