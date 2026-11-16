import { fireEvent, render, screen } from "@testing-library/react-native";
import type { SubscriptionUsageList } from "@zoption/shared";
import { router } from "expo-router";

import { usePlan } from "@/auth/plan-state";
import { useSubscriptionUsage } from "@/db/local-workspace-state";
import type { LocalSubscriptionItem } from "@/db/view-models";
import { SubscriptionRoiCard } from "./SubscriptionRoiCard";

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
jest.mock("@/auth/session-state", () => ({
  useSessionSnapshot: () => ({ status: "signed-in" }),
}));
jest.mock("@/auth/plan-state", () => ({ usePlan: jest.fn() }));
jest.mock("@/db/local-workspace-state", () => ({
  useLocalWorkspace: () => ({
    workspace: { transactionMutations: { queueSubscriptionUsage: mockQueue } },
  }),
  useSubscriptionUsage: jest.fn(),
}));
jest.mock("@/features/account-prompt/use-account-gate", () => ({
  useAccountGate: () => ({ openFeature: mockOpenFeature }),
}));
jest.mock("@/features/dashboard/dashboard-view", () => ({ localIsoDate: () => "2026-11-16" }));

const mockOpenFeature = jest.fn();
const mockQueue = jest.fn(() => Promise.resolve());

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
const netflix: LocalSubscriptionItem = { ...gym, id: "netflix", name: "Netflix" };
const electric: LocalSubscriptionItem = { ...gym, id: "electric", name: "Electric bill" };

function withPlan(plan: "zoption_pro" | "free" | null) {
  jest.mocked(usePlan).mockReturnValue({ plan, status: "ready", retry: jest.fn() });
}

function withUsage(usage: SubscriptionUsageList) {
  jest.mocked(useSubscriptionUsage).mockReturnValue({ usage, error: null });
}

describe("SubscriptionRoiCard", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("saves a check-in to the phone and shows what each use costs", async () => {
    withPlan("zoption_pro");
    withUsage({
      usage: [{ subscriptionId: "gym", usedOn: ["2026-11-06", "2026-11-10"] }],
      tracking: [],
    });
    await render(<SubscriptionRoiCard subscriptions={[gym]} />);

    expect(screen.getByText("2 uses this cycle")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "I used Gym today" }));
    expect(mockQueue).toHaveBeenCalledWith("gym", "check_in", "2026-11-16");
  });

  it("flags a bill unused for 30 days and opens it to cancel", async () => {
    withPlan("zoption_pro");
    withUsage({ usage: [{ subscriptionId: "netflix", usedOn: ["2026-10-01"] }], tracking: [] });
    await render(<SubscriptionRoiCard subscriptions={[netflix]} />);

    expect(screen.getByText("Unused for 46 days")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Cancel it" }));
    expect(router.push).toHaveBeenCalledWith({
      pathname: "/(app)/subscription",
      params: { id: "netflix" },
    });
  });

  it("leaves rent and utilities out until the person tracks them", async () => {
    withPlan("zoption_pro");
    withUsage({ usage: [], tracking: [] });
    await render(<SubscriptionRoiCard subscriptions={[netflix, electric]} />);

    expect(screen.queryByRole("button", { name: "I used Electric bill today" })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Track Electric bill" }));
    expect(mockQueue).toHaveBeenCalledWith("electric", "track", null);
    await fireEvent.press(screen.getByRole("button", { name: "Stop tracking Netflix" }));
    expect(mockQueue).toHaveBeenCalledWith("netflix", "untrack", null);
  });

  it("keeps working offline before the plan loads when the phone has history", async () => {
    withPlan(null);
    withUsage({ usage: [{ subscriptionId: "gym", usedOn: ["2026-11-10"] }], tracking: [] });
    await render(<SubscriptionRoiCard subscriptions={[gym]} />);
    expect(screen.getByRole("button", { name: "I used Gym today" })).toBeTruthy();
  });

  it("offers Pro instead of check-ins on other plans", async () => {
    withPlan("free");
    withUsage({ usage: [], tracking: [] });
    await render(<SubscriptionRoiCard subscriptions={[gym]} />);

    await fireEvent.press(screen.getByRole("button", { name: "See Pro" }));
    expect(mockOpenFeature).toHaveBeenCalledWith("billing", "/(app)/plan-billing");
  });
});
