// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { personalBillingPlans, type BillingPlanKey } from "@zoption/shared";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({
  changeBillingPlan: vi.fn(),
  getBillingProviderConfig: vi.fn(),
  startBillingCheckout: vi.fn(),
}));
const openBillingCheckout = vi.hoisted(() => vi.fn());
const paypalMocks = vi.hoisted(() => ({
  providerProps: vi.fn(),
  usePayPal: vi.fn(),
  useSubscriptionSession: vi.fn(),
}));

vi.mock("../src/lib/api", () => apiMocks);
vi.mock("../src/lib/billingCheckout", () => ({ openBillingCheckout }));
vi.mock("@paypal/react-paypal-js/sdk-v6", () => ({
  INSTANCE_LOADING_STATE: {
    PENDING: "pending",
    RESOLVED: "resolved",
    REJECTED: "rejected",
  },
  PayPalProvider: ({ children, ...props }: { children: ReactNode }) => {
    paypalMocks.providerProps(props);
    return children;
  },
  usePayPal: paypalMocks.usePayPal,
  usePayPalSubscriptionPaymentSession: paypalMocks.useSubscriptionSession,
}));

import { PlanCheckoutDialog } from "../src/components/billing/PlanCheckoutDialog";

const workspace = { key: "user:user-1" as const, userId: "user-1" };

function renderDialog(
  options: {
    unavailable?: string | null;
    current?: { plan: BillingPlanKey; interval: "month" | "year" };
    onChanged?: () => void;
  } = {},
) {
  const onClose = vi.fn();
  render(
    <MemoryRouter>
      <PlanCheckoutDialog
        open
        workspace={workspace}
        plans={personalBillingPlans}
        suggestedPlan="budget"
        unavailable={options.unavailable ?? null}
        current={options.current}
        onClose={onClose}
        onChanged={options.onChanged}
      />
    </MemoryRouter>,
  );
  return onClose;
}

describe("PlanCheckoutDialog", () => {
  beforeEach(() => {
    paypalMocks.usePayPal.mockReturnValue({
      sdkInstance: {},
      loadingStatus: "resolved",
      error: null,
    });
    paypalMocks.useSubscriptionSession.mockImplementation(
      (options: { createSubscription: () => Promise<{ subscriptionId: string }> }) => ({
        error: null,
        isPending: false,
        handleClick: options.createSubscription,
        handleCancel: vi.fn(),
        handleDestroy: vi.fn(),
      }),
    );
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
  });

  it("starts Dodo Payments checkout for the suggested plan and chosen interval", async () => {
    renderDialog();

    expect(screen.getByRole("radio", { name: /^Zoption Budget/ })).toBeChecked();
    fireEvent.click(screen.getByRole("radio", { name: /^Yearly/ }));
    expect(screen.getByText("₱1,490")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Continue with Zoption Budget" }));

    await vi.waitFor(() =>
      expect(openBillingCheckout).toHaveBeenCalledWith(
        workspace,
        { plan: "budget", interval: "year" },
        "dodo",
      ),
    );
    expect(apiMocks.startBillingCheckout).not.toHaveBeenCalled();
  });

  it("starts the PayPal subscription for the plan picked", async () => {
    renderDialog();

    fireEvent.click(screen.getByRole("radio", { name: /^Zoption Pro/ }));
    expect(screen.getByText("₱249")).toBeInTheDocument();
    const continueWithPayPal = await screen.findByRole("button", { name: "Continue with PayPal" });
    expect(paypalMocks.providerProps).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: "public-client-id", environment: "sandbox" }),
    );
    fireEvent.click(continueWithPayPal);

    expect(apiMocks.startBillingCheckout).toHaveBeenCalledWith(workspace, {
      plan: "pro",
      interval: "month",
    });
    expect(openBillingCheckout).not.toHaveBeenCalled();
  });

  it("starts at Not now, confines Tab to the dialog, and closes without checkout", () => {
    const onClose = renderDialog();
    const notNow = screen.getByRole("button", { name: "Not now" });

    expect(notNow).toHaveFocus();
    fireEvent.keyDown(notNow, { key: "Tab" });
    expect(screen.getByRole("button", { name: "Close plan options" })).toHaveFocus();

    fireEvent.click(notNow);
    expect(onClose).toHaveBeenCalledOnce();
    expect(openBillingCheckout).not.toHaveBeenCalled();
  });

  it("keeps the hosted PayPal checkout available when the provider config fails", async () => {
    apiMocks.getBillingProviderConfig.mockRejectedValue(
      new Error("Secure checkout is unavailable."),
    );
    openBillingCheckout.mockResolvedValue(undefined);
    renderDialog();

    fireEvent.click(await screen.findByRole("button", { name: "Continue on PayPal" }));

    expect(openBillingCheckout).toHaveBeenCalledWith(
      workspace,
      { plan: "budget", interval: "month" },
      "paypal",
    );
  });

  it("keeps SDK initialization pending without creating a subscription session early", async () => {
    paypalMocks.usePayPal.mockReturnValue({
      sdkInstance: null,
      loadingStatus: "pending",
      error: null,
    });
    renderDialog();

    expect(await screen.findByRole("button", { name: "Preparing PayPal…" })).toBeDisabled();
    expect(paypalMocks.useSubscriptionSession).not.toHaveBeenCalled();
  });

  it("offers hosted checkout when the PayPal SDK provider fails", async () => {
    paypalMocks.usePayPal.mockReturnValue({
      sdkInstance: null,
      loadingStatus: "rejected",
      error: new Error("no sdk instance available"),
    });
    openBillingCheckout.mockResolvedValue(undefined);
    renderDialog();

    expect(
      await screen.findByText(/PayPal's secure payment window could not be prepared/i),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Continue on PayPal" }));

    expect(openBillingCheckout).toHaveBeenCalledWith(workspace, {
      plan: "budget",
      interval: "month",
    });
  });

  it("explains why checkout is unavailable and closes on Escape", () => {
    const onClose = renderDialog({ unavailable: "Payment confirmation is already in progress." });

    expect(screen.getByText("Checkout unavailable")).toBeInTheDocument();
    expect(screen.getByText("Payment confirmation is already in progress.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Continue with/ })).not.toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("switches a paid plan instead of selling a new one", async () => {
    apiMocks.changeBillingPlan.mockResolvedValue({ outcome: "applied", approvalUrl: null });
    const onChanged = vi.fn();
    const onClose = renderDialog({ current: { plan: "budget", interval: "month" }, onChanged });

    expect(screen.getByRole("radio", { name: /^Zoption Budget.*Current plan/ })).toBeChecked();
    expect(screen.getByRole("button", { name: "Switch to Zoption Budget" })).toBeDisabled();
    expect(apiMocks.getBillingProviderConfig).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("radio", { name: /^Zoption Pro/ }));
    expect(screen.getByText(/The new plan starts now/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Switch to Zoption Pro" }));

    const choice = { plan: "pro", interval: "month" };
    await vi.waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(apiMocks.changeBillingPlan).toHaveBeenCalledWith(workspace, choice);
    expect(onChanged).toHaveBeenCalledWith({ outcome: "applied", approvalUrl: null }, choice);
  });
});
