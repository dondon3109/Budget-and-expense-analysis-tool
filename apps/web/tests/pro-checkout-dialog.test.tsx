// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { BillingSummary } from "@zoption/shared";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

const openBillingCheckout = vi.hoisted(() => vi.fn());

vi.mock("../src/lib/billingCheckout", () => ({ openBillingCheckout }));

import { ProCheckoutDialog } from "../src/components/billing/ProCheckoutDialog";

const workspace = { key: "user:user-1" as const, userId: "user-1" };

function summary(overrides: Partial<BillingSummary> = {}): BillingSummary {
  const base = {
    plan: "free",
    entitlementSource: null,
    provider: null,
    status: null,
    interval: null,
    currentPeriodEndsAt: null,
    scheduledChangeAt: null,
    cancelAtPeriodEnd: false,
    pendingCheckout: null,
    canCheckout: true,
    canManageBilling: false,
    canManageSponsoredSeats: false,
    nonTerminalSubscriptionCount: 0,
    usages: [],
    allowances: [],
  } satisfies BillingSummary;
  return {
    ...base,
    ...overrides,
    entitlementSource: overrides.entitlementSource ?? base.entitlementSource,
    canManageSponsoredSeats: overrides.canManageSponsoredSeats ?? base.canManageSponsoredSeats,
  };
}

function renderDialog(value = summary(), onClose = vi.fn()) {
  render(
    <MemoryRouter>
      <ProCheckoutDialog open summary={value} workspace={workspace} onClose={onClose} />
    </MemoryRouter>,
  );
  return onClose;
}

describe("ProCheckoutDialog", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows current plan facts and opens the selected checkout interval", async () => {
    renderDialog();

    expect(
      screen.getByRole("dialog", { name: "Choose how you want to use Zoption Pro" }),
    ).toBeVisible();
    expect(screen.getByText("Weekly cashflow view")).toBeInTheDocument();
    expect(screen.getByText("Adds monthly and six-month cashflow views")).toBeInTheDocument();
    expect(
      screen.getByText(/does not add or move transactions into the week/i),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Subscribe Annual · ₱1,299/year" }));
    expect(openBillingCheckout).toHaveBeenCalledWith(workspace, "year");
  });

  it("starts at the free-plan action and lets the user continue without checkout", () => {
    const onClose = renderDialog();
    const continueButton = screen.getByRole("button", {
      name: "Continue using free plan",
    });

    expect(continueButton).toHaveFocus();
    fireEvent.click(continueButton);

    expect(onClose).toHaveBeenCalledOnce();
    expect(openBillingCheckout).not.toHaveBeenCalled();
  });

  it("explains when payment confirmation is already pending", () => {
    renderDialog(
      summary({
        canCheckout: false,
        pendingCheckout: {
          provider: "paypal",
          interval: "month",
          createdAt: "2026-08-01T00:00:00.000Z",
          expiresAt: "2099-08-01T00:15:00.000Z",
        },
      }),
    );

    expect(screen.getByText(/Payment confirmation is already in progress/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Subscribe Monthly/ })).not.toBeInTheDocument();
  });

  it("closes on Escape and explains unavailable checkout", () => {
    const onClose = renderDialog(summary({ canCheckout: false, canManageBilling: true }));

    expect(screen.getByText("Checkout unavailable")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Review Plan and billing" })).toHaveAttribute(
      "href",
      "/app/settings#plan-and-billing",
    );
    expect(screen.queryByRole("button", { name: /Subscribe Monthly/ })).not.toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
