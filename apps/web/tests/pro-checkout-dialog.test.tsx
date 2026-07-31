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
  return {
    plan: "free",
    status: null,
    interval: null,
    currentPeriodEndsAt: null,
    scheduledChangeAt: null,
    canCheckout: true,
    canManageBilling: false,
    nonTerminalSubscriptionCount: 0,
    usages: [],
    allowances: [],
    ...overrides,
  };
}

function renderDialog(value = summary(), onClose = vi.fn()) {
  render(
    <MemoryRouter>
      <ProCheckoutDialog
        open
        summary={value}
        workspace={workspace}
        email="user@example.com"
        onClose={onClose}
      />
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

    fireEvent.click(screen.getByRole("button", { name: "Subscribe Annual · $24.99/year" }));
    expect(openBillingCheckout).toHaveBeenCalledWith(workspace, "year", "user@example.com");
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
