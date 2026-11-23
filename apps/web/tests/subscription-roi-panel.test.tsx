// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import type { SubscriptionMonthItem } from "@zoption/shared";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SubscriptionRoiPanel } from "../src/components/subscriptions/SubscriptionRoiPanel";

const base: SubscriptionMonthItem = {
  id: "gym",
  name: "Gym",
  amountMinor: 1_500_00,
  currency: "PHP",
  billingCycle: "monthly",
  nextBillingDate: "2026-12-05",
  status: "active",
  renewalBlockedReason: null,
  categoryId: "fitness",
  categoryName: "Fitness",
  categoryColor: "#336699",
  accountId: null,
  accountName: null,
  billingDate: "2026-11-05",
  monthlyCostMinor: 1_500_00,
};
const video: SubscriptionMonthItem = { ...base, id: "video", name: "Video" };
const electric: SubscriptionMonthItem = { ...base, id: "electric", name: "Electric bill" };

afterEach(cleanup);

function renderPanel(props: Partial<Parameters<typeof SubscriptionRoiPanel>[0]> = {}) {
  const handlers = { onCheckIn: vi.fn(), onUndo: vi.fn(), onCancel: vi.fn(), onTrack: vi.fn() };
  render(
    <MemoryRouter>
      <SubscriptionRoiPanel
        isPro
        items={[base, video, electric]}
        usage={{
          usage: [
            { subscriptionId: "gym", usedOn: ["2026-11-06", "2026-11-10", "2026-11-16"] },
            { subscriptionId: "video", usedOn: ["2026-10-01"] },
          ],
          tracking: [{ subscriptionId: "video", tracked: true }],
        }}
        today="2026-11-16"
        {...handlers}
        {...props}
      />
    </MemoryRouter>,
  );
  return handlers;
}

describe("SubscriptionRoiPanel", () => {
  it("shows cost per use this cycle and lets a used-today check-in be undone", async () => {
    const handlers = renderPanel();
    const gym = screen.getByText("Gym").closest("li")!;
    expect(within(gym).getByText("Used today")).toBeInTheDocument();
    expect(within(gym).getByText("3")).toBeInTheDocument();
    expect(within(gym).getByText(/₱500/)).toBeInTheDocument();

    await userEvent.click(
      within(gym).getByRole("button", { name: "Undo today's check-in for Gym" }),
    );
    expect(handlers.onUndo).toHaveBeenCalledWith("gym");
  });

  it("flags a subscription unused for 30 days and offers to cancel it", async () => {
    const handlers = renderPanel();
    const row = screen.getByText("Video").closest("li")!;
    expect(within(row).getByText("Unused for 46 days")).toBeInTheDocument();

    await userEvent.click(within(row).getByRole("button", { name: "Cancel it" }));
    expect(handlers.onCancel).toHaveBeenCalledWith("video");
    await userEvent.click(within(row).getByRole("button", { name: "I used Video today" }));
    expect(handlers.onCheckIn).toHaveBeenCalledWith("video");
  });

  it("leaves rent and utilities out until the person tracks them", async () => {
    const handlers = renderPanel();
    expect(screen.queryByRole("button", { name: "I used Electric bill today" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Track Electric bill" }));
    expect(handlers.onTrack).toHaveBeenCalledWith("electric", true);
    await userEvent.click(screen.getByRole("button", { name: "Stop tracking Gym" }));
    expect(handlers.onTrack).toHaveBeenCalledWith("gym", false);
  });

  it("omits the tracked list and adjusts copy when no bills are tracked yet", async () => {
    const handlers = renderPanel({
      items: [electric],
      usage: { usage: [], tracking: [] },
    });
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(screen.getByText(/Pick a bill below to track cost per use/)).toBeInTheDocument();
    expect(screen.getByText("Track usage")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Track Electric bill" }));
    expect(handlers.onTrack).toHaveBeenCalledWith("electric", true);
  });

  it("shows a Pro teaser instead of check-ins on other plans", () => {
    renderPanel({ isPro: false });
    expect(screen.getByText("Are your subscriptions worth it?")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /used/i })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See Pro" })).toHaveAttribute("href", "/app/settings");
  });

  it("stays hidden with no active subscriptions", () => {
    renderPanel({ items: [{ ...base, status: "canceled" }] });
    expect(screen.queryByLabelText("Usage and value")).not.toBeInTheDocument();
  });
});
