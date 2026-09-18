// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({
  startBillingCheckout: vi.fn(),
}));

vi.mock("../src/lib/api", () => apiMocks);

import {
  CHECKOUT_OPEN_ERROR,
  openBillingCheckout,
  redirectToPaypalCheckout,
} from "../src/lib/billingCheckout";

const LIVE_APPROVAL_URL = "https://www.paypal.com/checkoutnow?token=I-live";
const SANDBOX_APPROVAL_URL = "https://www.sandbox.paypal.com/checkoutnow?token=I-sandbox";

describe("PayPal checkout redirects", () => {
  const workspace = { key: "user:user-1" as const, userId: "user-1" };
  const assign = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { assign },
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("assigns a live PayPal approval URL unchanged", () => {
    redirectToPaypalCheckout(LIVE_APPROVAL_URL);

    expect(assign).toHaveBeenCalledWith(LIVE_APPROVAL_URL);
  });

  it("accepts the sandbox host outside production and refuses it in production", () => {
    redirectToPaypalCheckout(SANDBOX_APPROVAL_URL);
    expect(assign).toHaveBeenCalledWith(SANDBOX_APPROVAL_URL);

    assign.mockClear();
    vi.stubEnv("PROD", true);

    expect(() => redirectToPaypalCheckout(SANDBOX_APPROVAL_URL)).toThrow(CHECKOUT_OPEN_ERROR);
    expect(assign).not.toHaveBeenCalled();
  });

  it.each([
    "http://www.paypal.com/checkoutnow?token=I-live",
    "https://paypal.com.evil.example/checkoutnow",
    "https://www.paypal.com.evil.example/checkoutnow",
    "https://evil.example/checkoutnow",
    "https://user:pass@www.paypal.com/checkoutnow",
    "javascript:alert(document.cookie)",
    "not a url",
  ])("refuses %s with the checkout error copy", (url) => {
    expect(() => redirectToPaypalCheckout(url)).toThrow(CHECKOUT_OPEN_ERROR);
    expect(assign).not.toHaveBeenCalled();
  });

  it("validates the approval URL the API returns before leaving the app", async () => {
    apiMocks.startBillingCheckout.mockResolvedValue({
      approvalUrl: "https://evil.example/checkout",
      subscriptionId: "I-test",
    });

    await expect(openBillingCheckout(workspace, "month")).rejects.toThrow(CHECKOUT_OPEN_ERROR);
    expect(assign).not.toHaveBeenCalled();

    apiMocks.startBillingCheckout.mockResolvedValue({
      approvalUrl: LIVE_APPROVAL_URL,
      subscriptionId: "I-test",
    });

    await openBillingCheckout(workspace, "month");
    expect(assign).toHaveBeenCalledWith(LIVE_APPROVAL_URL);
  });
});
