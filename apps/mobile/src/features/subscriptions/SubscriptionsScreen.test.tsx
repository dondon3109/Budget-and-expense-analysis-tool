import { fireEvent, render, screen } from "@testing-library/react-native";
import { router } from "expo-router";

import {
  useDashboardData,
  useLocalReferenceData,
  useLocalWorkspace,
  useSubscriptions,
} from "@/db/local-workspace-state";
import type { LocalSubscriptionItem } from "@/db/repository";
import type { LocalWorkspace } from "@/db/workspace";
import { SubscriptionsScreen } from "./SubscriptionsScreen";

jest.mock("expo-router", () => ({
  router: {
    push: jest.fn(),
  },
  Stack: {
    Screen: () => null,
  },
}));

jest.mock("@/db/local-workspace-state", () => ({
  useDashboardData: jest.fn(),
  useLocalWorkspace: jest.fn(),
  useSubscriptions: jest.fn(),
  useLocalReferenceData: jest.fn(),
}));

const mockSubscriptions: LocalSubscriptionItem[] = [
  {
    id: "sub-1",
    name: "Netflix",
    amountMinor: 54_900,
    currency: "PHP",
    billingCycle: "monthly",
    nextBillingDate: "2026-09-01",
    status: "active",
    categoryId: "cat-entertainment",
    accountId: "acc-bank",
    syncState: "synced",
  },
  {
    id: "sub-2",
    name: "Gym Membership",
    amountMinor: 24_000,
    currency: "PHP",
    billingCycle: "yearly",
    nextBillingDate: "2027-01-15",
    status: "canceled",
    categoryId: "cat-fitness",
    accountId: "acc-bank",
    syncState: "synced",
  },
];

const mockReferenceData = {
  categories: [
    {
      id: "cat-entertainment",
      name: "Entertainment",
      kind: "expense" as const,
      color: "#E11D48",
      iconEmoji: "🎬",
      system: false,
      requiredPlan: "free" as const,
      locked: false,
      serverRevision: 1,
      syncState: "synced" as const,
    },
    {
      id: "cat-fitness",
      name: "Fitness",
      kind: "expense" as const,
      color: "#10B981",
      iconEmoji: "💪",
      system: false,
      requiredPlan: "free" as const,
      locked: false,
      serverRevision: 1,
      syncState: "synced" as const,
    },
  ],
  accounts: [
    {
      id: "acc-bank",
      name: "BDO Checking",
      type: "checking" as const,
      currency: "PHP" as const,
      system: false,
      serverRevision: 1,
      syncState: "synced" as const,
    },
  ],
};

describe("SubscriptionsScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(useLocalWorkspace).mockReturnValue({
      workspace: {} as unknown as LocalWorkspace,
      status: "ready",
      message: null,
      retry: jest.fn(),
      reopen: jest.fn(),
    });
    jest.mocked(useLocalReferenceData).mockReturnValue({
      data: mockReferenceData,
      error: null,
      retry: jest.fn(),
    });
    jest.mocked(useDashboardData).mockReturnValue({
      data: { transactions: [], accounts: [], budgets: [] },
      error: null,
      retry: jest.fn(),
    });
  });

  it("renders empty state with add button when no subscriptions exist", async () => {
    jest.mocked(useSubscriptions).mockReturnValue({
      subscriptions: [],
      loading: false,
      error: null,
      retry: jest.fn(),
    });

    await render(<SubscriptionsScreen />);

    expect(screen.getByText("No subscriptions yet")).toBeTruthy();
    const addButton = screen.getByRole("button", { name: "+ Add a subscription" });
    await fireEvent.press(addButton);
    expect(router.push).toHaveBeenCalledWith("/(app)/subscription");
  });

  it("renders subscriptions list, cost summary card, and filter chips", async () => {
    jest.mocked(useSubscriptions).mockReturnValue({
      subscriptions: mockSubscriptions,
      loading: false,
      error: null,
      retry: jest.fn(),
    });

    await render(<SubscriptionsScreen />);

    expect(screen.getByText("Total monthly cost")).toBeTruthy();
    expect(screen.getAllByText("Netflix")[0]).toBeTruthy();
    expect(screen.getByText("Gym Membership")).toBeTruthy();
    expect(screen.getByText("🎬")).toBeTruthy();
    expect(screen.getByText("Entertainment")).toBeTruthy();
    expect(screen.getAllByText("BDO Checking").length).toBeGreaterThan(0);

    // Top + Add button navigates to editor
    const headerAdd = screen.getByRole("button", { name: "+ Add" });
    await fireEvent.press(headerAdd);
    expect(router.push).toHaveBeenCalledWith("/(app)/subscription");

    // Pressing a row opens the subscription for editing
    const netflixRow = screen.getByLabelText("Netflix, 54900 minor, active");
    await fireEvent.press(netflixRow);
    expect(router.push).toHaveBeenCalledWith({
      pathname: "/(app)/subscription",
      params: { id: "sub-1" },
    });
  });

  it("filters subscriptions by status when filter chip is tapped", async () => {
    jest.mocked(useSubscriptions).mockReturnValue({
      subscriptions: mockSubscriptions,
      loading: false,
      error: null,
      retry: jest.fn(),
    });

    await render(<SubscriptionsScreen />);

    // Filter to Active
    const activeChip = screen.getByRole("tab", { name: /Active/ });
    await fireEvent.press(activeChip);
    expect(screen.getAllByText("Netflix")[0]).toBeTruthy();
    expect(screen.queryByText("Gym Membership")).toBeNull();

    // Filter to Canceled
    const canceledChip = screen.getByRole("tab", { name: /Canceled/ });
    await fireEvent.press(canceledChip);
    expect(screen.getByText("Gym Membership")).toBeTruthy();
    expect(screen.queryByLabelText("Netflix, 54900 minor, active")).toBeNull();
  });
});
