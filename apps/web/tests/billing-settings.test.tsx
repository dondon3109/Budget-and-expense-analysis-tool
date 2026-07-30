// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import type { User } from "@supabase/supabase-js";
import type { BillingSubscriptionStatus, BillingSummary } from "@zoption/shared";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({
  createBillingPortalSession: vi.fn(),
  getBillingSummary: vi.fn(),
  startBillingCheckout: vi.fn(),
}));

vi.mock("../src/lib/api", () => apiMocks);
vi.mock("../src/lib/paddle", () => ({ getPaddle: vi.fn() }));

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
  return {
    plan: paid ? "zoption_pro" : "free",
    status,
    interval: status ? "month" : null,
    currentPeriodEndsAt: status ? "2026-08-30T00:00:00.000Z" : null,
    scheduledChangeAt: null,
    canCheckout: status === null || status === "canceled",
    canManageBilling: status !== null,
    nonTerminalSubscriptionCount: status && status !== "canceled" ? 1 : 0,
    usages: [
      {
        feature: "assistant_question",
        used: 2,
        limit: paid ? 100 : 10,
        resetsAt: "2026-08-01T00:00:00.000Z",
      },
      {
        feature: "file_import",
        used: 1,
        limit: paid ? 20 : 2,
        resetsAt: "2026-08-01T00:00:00.000Z",
      },
    ],
    ...overrides,
  };
}

function renderSettings(value: BillingSummary) {
  apiMocks.getBillingSummary.mockResolvedValue(value);
  return render(
    <MemoryRouter>
      <BillingSettings user={user} />
    </MemoryRouter>,
  );
}

describe("BillingSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.createBillingPortalSession.mockResolvedValue({ url: "https://example.test/portal" });
    apiMocks.startBillingCheckout.mockResolvedValue({ reference: "ref", priceId: "pri" });
  });

  afterEach(cleanup);

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

  it("shows the Free plan with checkout when there is no subscription", async () => {
    renderSettings(summary(null));

    expect(await screen.findByText("You’re using the Free plan")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Upgrade monthly/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Manage billing" })).not.toBeInTheDocument();
  });

  it("uses capability flags for billing actions", async () => {
    renderSettings(
      summary("past_due", {
        canCheckout: false,
        canManageBilling: true,
      }),
    );

    expect(await screen.findByRole("button", { name: "Manage billing" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Upgrade monthly/ })).not.toBeInTheDocument();
    expect(screen.getByText(/new checkout is unavailable/i)).toBeInTheDocument();
  });

  it("warns when Paddle reports duplicate ongoing subscriptions", async () => {
    renderSettings(summary("active", { nonTerminalSubscriptionCount: 2 }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "more than one ongoing subscription",
    );
  });
});
