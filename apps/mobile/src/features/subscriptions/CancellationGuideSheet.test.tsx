import { fireEvent, render, screen } from "@testing-library/react-native";
import { router } from "expo-router";
import { Linking } from "react-native";

import {
  useDashboardData,
  useLocalReferenceData,
  useLocalWorkspace,
  useSubscriptions,
} from "@/db/local-workspace-state";
import type { LocalSubscriptionItem } from "@/db/repository";
import type { LocalWorkspace } from "@/db/workspace";
import { CancellationGuideSheet, getCancellationDifficulty } from "./CancellationGuideSheet";
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

describe("getCancellationDifficulty", () => {
  it("labels short guides easy, mid-length guides moderate, and long guides involved", () => {
    expect(getCancellationDifficulty(0)).toBe("Easy");
    expect(getCancellationDifficulty(3)).toBe("Easy");
    expect(getCancellationDifficulty(4)).toBe("Moderate");
    expect(getCancellationDifficulty(5)).toBe("Moderate");
    expect(getCancellationDifficulty(6)).toBe("Involved");
  });
});

describe("CancellationGuideSheet", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("shows the guide title, difficulty, cutoff warning, and steps for a known provider", async () => {
    await render(
      <CancellationGuideSheet subscriptionName="Netflix" visible onDismiss={jest.fn()} />,
    );

    expect(screen.getByText("How to cancel")).toBeTruthy();
    expect(screen.getByText("Netflix")).toBeTruthy();
    expect(screen.getByLabelText(/Difficulty:/)).toBeTruthy();
    expect(screen.getByText("Billing cutoff notice")).toBeTruthy();
    expect(
      screen.getByText("You can watch until your billing period ends. No partial refund is issued."),
    ).toBeTruthy();
    expect(screen.getByLabelText("Cancellation steps")).toBeTruthy();
    expect(screen.getByText("Sign in to your account on Netflix.com.")).toBeTruthy();
  });

  it("opens the official portal with one tap via Linking.openURL", async () => {
    await render(
      <CancellationGuideSheet subscriptionName="Netflix" visible onDismiss={jest.fn()} />,
    );

    await fireEvent.press(screen.getByRole("button", { name: "Open official cancellation portal" }));

    expect(Linking.openURL).toHaveBeenCalledTimes(1);
    expect(Linking.openURL).toHaveBeenCalledWith("https://www.netflix.com/youraccount");
  });

  it("falls back to general steps with app-store portals for unknown providers", async () => {
    await render(
      <CancellationGuideSheet
        subscriptionName="Unknown Super Rare Gym 9999"
        visible
        onDismiss={jest.fn()}
      />,
    );

    expect(screen.getByText("General cancellation steps")).toBeTruthy();
    expect(screen.getByText("Billing cycle notice")).toBeTruthy();
    expect(screen.getByText("Billed through an app store?")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Open official cancellation portal" })).toBeNull();

    await fireEvent.press(
      screen.getByRole("button", { name: "Open Apple App Store (iOS & iCloud) subscriptions portal" }),
    );
    expect(Linking.openURL).toHaveBeenCalledWith(
      "https://finance-app.itunes.apple.com/account/subscriptions",
    );
  });

  it("dismisses the sheet from the Done button", async () => {
    const onDismiss = jest.fn();
    await render(
      <CancellationGuideSheet subscriptionName="Spotify Premium" visible onDismiss={onDismiss} />,
    );

    expect(screen.getByText("Spotify Premium")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Close" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

describe("SubscriptionsScreen cancellation wiring", () => {
  const subscriptions: LocalSubscriptionItem[] = [
    {
      id: "sub-1",
      name: "Netflix",
      amountMinor: 54_900,
      currency: "PHP",
      billingCycle: "monthly",
      nextBillingDate: "2026-09-01",
      status: "active",
      categoryId: "cat-1",
      accountId: "acc-1",
      syncState: "synced",
    },
  ];

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
      data: { categories: [], accounts: [] },
      error: null,
      retry: jest.fn(),
    });
    jest.mocked(useDashboardData).mockReturnValue({
      data: { transactions: [], accounts: [], budgets: [] },
      error: null,
      retry: jest.fn(),
    });
    jest.mocked(useSubscriptions).mockReturnValue({
      subscriptions,
      loading: false,
      error: null,
      retry: jest.fn(),
    });
  });

  it("opens the cancellation guide sheet from a subscription card without navigating", async () => {
    await render(<SubscriptionsScreen />);

    const howToCancel = screen.getAllByRole("button", { name: "How to cancel" });
    expect(howToCancel).toHaveLength(1);
    await fireEvent.press(howToCancel[0]!);

    expect(router.push).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Open official cancellation portal" }),
    ).toBeOnTheScreen();
  });
});
