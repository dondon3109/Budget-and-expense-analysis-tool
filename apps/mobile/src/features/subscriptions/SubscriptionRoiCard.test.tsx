import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";

import { checkInSubscription, getSubscriptionUsage } from "@/api/subscription-usage";
import { usePlan } from "@/auth/plan-state";
import type { LocalSubscriptionItem } from "@/db/view-models";
import { SubscriptionRoiCard } from "./SubscriptionRoiCard";

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
// Stable like the real `useCallback`, so the card loads once.
const mockGetAccessToken = async () => "token";
jest.mock("@/auth/session-state", () => ({
  useSessionSnapshot: () => ({ status: "signed-in", getAccessToken: mockGetAccessToken }),
}));
jest.mock("@/auth/plan-state", () => ({ usePlan: jest.fn() }));
jest.mock("@/features/account-prompt/use-account-gate", () => ({
  useAccountGate: () => ({ openFeature: mockOpenFeature }),
}));
jest.mock("@/features/dashboard/dashboard-view", () => ({ localIsoDate: () => "2026-11-16" }));
jest.mock("@/api/subscription-usage", () => ({
  getSubscriptionUsage: jest.fn(),
  checkInSubscription: jest.fn(),
  undoSubscriptionCheckIn: jest.fn(),
}));

const mockOpenFeature = jest.fn();

const gym: LocalSubscriptionItem = {
  id: "gym",
  name: "Gym",
  amountMinor: 1_500_00,
  currency: "PHP",
  billingCycle: "monthly",
  nextBillingDate: "2026-12-05",
  status: "active",
  categoryId: null,
  accountId: null,
  syncState: "synced",
};
const video: LocalSubscriptionItem = { ...gym, id: "video", name: "Video" };

function proPlan() {
  jest.mocked(usePlan).mockReturnValue({ plan: "zoption_pro", status: "ready", retry: jest.fn() });
}

describe("SubscriptionRoiCard", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("checks a bill in for today and shows what each use costs", async () => {
    proPlan();
    jest.mocked(getSubscriptionUsage).mockResolvedValue({
      usage: [{ subscriptionId: "gym", usedOn: ["2026-11-06", "2026-11-10"] }],
    });
    jest.mocked(checkInSubscription).mockResolvedValue({
      subscriptionId: "gym",
      usedOn: ["2026-11-06", "2026-11-10", "2026-11-16"],
    });
    await render(<SubscriptionRoiCard subscriptions={[gym]} />);

    expect(await screen.findByText("2 uses this cycle")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "I used Gym today" }));

    expect(checkInSubscription).toHaveBeenCalledWith({ accessToken: "token" }, "gym", "2026-11-16");
    expect(await screen.findByText("3 uses this cycle")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Undo today's check-in for Gym" })).toBeTruthy();
  });

  it("flags a bill unused for 30 days and opens it to cancel", async () => {
    proPlan();
    jest.mocked(getSubscriptionUsage).mockResolvedValue({
      usage: [{ subscriptionId: "video", usedOn: ["2026-10-01"] }],
    });
    await render(<SubscriptionRoiCard subscriptions={[video]} />);

    expect(await screen.findByText("Unused for 46 days")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Cancel it" }));
    expect(router.push).toHaveBeenCalledWith({
      pathname: "/(app)/subscription",
      params: { id: "video" },
    });
  });

  it("offers Pro instead of check-ins on other plans, without asking the Worker", async () => {
    jest.mocked(usePlan).mockReturnValue({ plan: "free", status: "ready", retry: jest.fn() });
    await render(<SubscriptionRoiCard subscriptions={[gym]} />);

    await fireEvent.press(screen.getByRole("button", { name: "See Pro" }));
    expect(mockOpenFeature).toHaveBeenCalledWith("billing", "/(app)/plan-billing");
    await waitFor(() => expect(getSubscriptionUsage).not.toHaveBeenCalled());
  });
});
