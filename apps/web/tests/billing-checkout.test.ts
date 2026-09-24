// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({
  startBillingCheckout: vi.fn(),
}));

vi.mock("../src/lib/api", () => apiMocks);

import { openBillingCheckout } from "../src/lib/billingCheckout";

describe("openBillingCheckout", () => {
  const workspace = { key: "user:user-1" as const, userId: "user-1" };
  const assign = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.startBillingCheckout.mockResolvedValue({
      approvalUrl: "https://www.sandbox.paypal.com/checkoutnow?token=example",
      subscriptionId: "I-example",
    });
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { assign },
    });
  });

  it("redirects only to the API-provided PayPal approval URL", async () => {
    await openBillingCheckout(workspace, "month");

    expect(apiMocks.startBillingCheckout).toHaveBeenCalledWith(workspace, "month", "paypal");
    expect(assign).toHaveBeenCalledWith("https://www.sandbox.paypal.com/checkoutnow?token=example");
  });

  it("sends a Dodo checkout only to a Dodo-hosted checkout page", async () => {
    apiMocks.startBillingCheckout.mockResolvedValue({
      approvalUrl: "https://test.checkout.dodopayments.com/session/cks_example",
    });
    await openBillingCheckout(workspace, "year", "dodo");

    expect(apiMocks.startBillingCheckout).toHaveBeenCalledWith(workspace, "year", "dodo");
    expect(assign).toHaveBeenCalledWith(
      "https://test.checkout.dodopayments.com/session/cks_example",
    );

    assign.mockClear();
    apiMocks.startBillingCheckout.mockResolvedValue({
      approvalUrl: "https://checkout.dodopayments.com.attacker.example/session",
    });
    await expect(openBillingCheckout(workspace, "year", "dodo")).rejects.toThrow(
      "Secure payment could not be opened",
    );
    expect(assign).not.toHaveBeenCalled();
  });
});
