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
    });
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { assign },
    });
  });

  it("redirects only to the API-provided PayPal approval URL", async () => {
    await openBillingCheckout(workspace, "month");

    expect(apiMocks.startBillingCheckout).toHaveBeenCalledWith(workspace, "month");
    expect(assign).toHaveBeenCalledWith("https://www.sandbox.paypal.com/checkoutnow?token=example");
  });
});
