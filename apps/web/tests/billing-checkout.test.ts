// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({
  startBillingCheckout: vi.fn(),
}));
const paddleMocks = vi.hoisted(() => ({
  getPaddle: vi.fn(),
}));

vi.mock("../src/lib/api", () => apiMocks);
vi.mock("../src/lib/paddle", () => paddleMocks);

import { openBillingCheckout } from "../src/lib/billingCheckout";

describe("openBillingCheckout", () => {
  const checkoutOpen = vi.fn();
  const workspace = { key: "user:user-1" as const, userId: "user-1" };

  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.startBillingCheckout.mockResolvedValue({ reference: "checkout-ref", priceId: "pri_month" });
    paddleMocks.getPaddle.mockResolvedValue({ Checkout: { open: checkoutOpen } });
  });

  it("returns purchasers to the confirmed billing section", async () => {
    await openBillingCheckout(workspace, "month", "user@example.com");

    const checkoutInput = checkoutOpen.mock.calls[0]?.[0] as
      | { settings: { successUrl: string } }
      | undefined;
    expect(checkoutInput).toBeDefined();
    const successUrl = new URL(checkoutInput!.settings.successUrl);

    expect(successUrl.pathname).toBe("/app/settings");
    expect(successUrl.searchParams.get("checkout")).toBe("completed");
    expect(successUrl.hash).toBe("#plan-and-billing");
    expect(checkoutOpen).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: { email: "user@example.com" },
        customData: { zoption_checkout_reference: "checkout-ref" },
        items: [{ priceId: "pri_month", quantity: 1 }],
      }),
    );
  });
});
