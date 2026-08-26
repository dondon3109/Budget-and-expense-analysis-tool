// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { BillingSummary } from "@zoption/shared";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({
  getBillingProviderConfig: vi.fn(),
  startBillingCheckout: vi.fn(),
}));
const openBillingCheckout = vi.hoisted(() => vi.fn());

vi.mock("../src/lib/api", () => apiMocks);
vi.mock("../src/lib/billingCheckout", () => ({ openBillingCheckout }));
vi.mock("@paypal/react-paypal-js/sdk-v6", () => ({
  PayPalProvider: ({ children }: { children: ReactNode }) => children,
  usePayPalSubscriptionPaymentSession: (options: {
    createSubscription: () => Promise<{ subscriptionId: string }>;
  }) => ({
    error: null,
    isPending: false,
    handleClick: options.createSubscription,
    handleCancel: vi.fn(),
    handleDestroy: vi.fn(),
  }),
}));

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
  beforeEach(() => {
    apiMocks.getBillingProviderConfig.mockResolvedValue({
      provider: "paypal",
      clientId: "public-client-id",
      environment: "sandbox",
    });
    apiMocks.startBillingCheckout.mockResolvedValue({
      approvalUrl: "https://www.sandbox.paypal.com/checkoutnow?token=test",
      subscriptionId: "I-test",
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("shows current plan and payment facts, then starts the selected secure subscription", async () => {
    renderDialog();

    expect(
      screen.getByRole("dialog", { name: "Choose how you want to use Zoption Pro" }),
    ).toBeVisible();
    expect(screen.getByText("Weekly cashflow view")).toBeInTheDocument();
    expect(screen.getByText("Adds monthly and six-month cashflow views")).toBeInTheDocument();
    expect(
      screen.getByText(/does not add or move transactions into the week/i),
    ).toBeInTheDocument();
    expect(screen.getByText("Debit or credit card when available")).toBeInTheDocument();
    expect(screen.getByText(/PayPal will show the methods available to you/i)).toBeInTheDocument();
    expect(screen.getByText("PayPal")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: "Annual, ₱1,299/year" }));
    fireEvent.click(await screen.findByRole("button", { name: "Continue securely" }));

    expect(apiMocks.startBillingCheckout).toHaveBeenCalledWith(workspace, "year");
    expect(openBillingCheckout).not.toHaveBeenCalled();
  });

  it("starts at the free-plan action and lets the user continue without checkout", () => {
    const onClose = renderDialog();
    const continueButton = screen.getByRole("button", {
      name: "Continue using free plan",
    });
    const freePlan = screen.getByRole("region", { name: "Free plan" });

    expect(freePlan.querySelector("ul")?.nextElementSibling).toBe(continueButton);
    expect(continueButton).toHaveFocus();
    fireEvent.click(continueButton);

    expect(onClose).toHaveBeenCalledOnce();
    expect(openBillingCheckout).not.toHaveBeenCalled();
    expect(apiMocks.startBillingCheckout).not.toHaveBeenCalled();
  });

  it("puts Pro first and focuses its selected interval on narrow screens", () => {
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true }));
    renderDialog();

    const plans = screen.getByRole("region", { name: "Zoption Pro plan" }).parentElement;
    expect(plans?.firstElementChild).toHaveAccessibleName("Zoption Pro plan");
    expect(screen.getByRole("radio", { name: "Monthly, ₱149/month" })).toHaveFocus();
  });

  it("keeps the hosted PayPal checkout available when the embedded SDK cannot initialize", async () => {
    apiMocks.getBillingProviderConfig.mockRejectedValue(
      new Error("Secure checkout is unavailable."),
    );
    openBillingCheckout.mockResolvedValue(undefined);
    renderDialog();

    fireEvent.click(await screen.findByRole("button", { name: "Continue securely on PayPal" }));

    expect(openBillingCheckout).toHaveBeenCalledWith(workspace, "month");
    expect(apiMocks.startBillingCheckout).not.toHaveBeenCalled();
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
    expect(screen.queryByRole("button", { name: "Continue securely" })).not.toBeInTheDocument();
  });

  it("closes on Escape and explains unavailable checkout", () => {
    const onClose = renderDialog(summary({ canCheckout: false, canManageBilling: true }));

    expect(screen.getByText("Checkout unavailable")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Review Plan and billing" })).toHaveAttribute(
      "href",
      "/app/settings#plan-and-billing",
    );
    expect(screen.queryByRole("button", { name: "Continue securely" })).not.toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
