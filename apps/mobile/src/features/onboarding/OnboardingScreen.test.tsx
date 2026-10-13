import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";

import { saveOnboardingCash } from "@/api/onboarding";
import { setPetEnabled } from "@/api/pet";
import { useOnboardingStore } from "@/stores/onboarding-store";
import { usePetStore } from "@/stores/pet-store";

import { OnboardingScreen } from "./OnboardingScreen";

const mockRetry = jest.fn();
jest.mock("expo-router", () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
}));
jest.mock("@/api/pet", () => ({ setPetEnabled: jest.fn() }));
jest.mock("@/auth/session-state", () => ({
  useSessionSnapshot: () => ({ subject: "user-1", getAccessToken: async () => "token" }),
}));
jest.mock("@/sync/sync-state", () => ({ useSyncState: () => ({ retry: mockRetry }) }));
jest.mock("@/api/onboarding", () => ({
  saveOnboardingCurrency: jest.fn(),
  saveOnboardingCash: jest.fn(),
}));

describe("OnboardingScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useOnboardingStore.getState().reset();
    usePetStore.getState().reset();
    useOnboardingStore.getState().setState({ step: "cash", currency: "PHP" });
  });

  it("rejects an empty or malformed amount before calling the Worker", async () => {
    await render(<OnboardingScreen />);
    await fireEvent.press(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText("Enter the cash you have on hand, or 0.")).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText("Cash on hand"), "1.234");
    await fireEvent.press(screen.getByRole("button", { name: "Continue" }));
    expect(
      await screen.findByText("Enter a number with no more than two decimal places."),
    ).toBeTruthy();
    expect(saveOnboardingCash).not.toHaveBeenCalled();
  });

  it("saves cash in minor units, pulls the opening entry, then asks for theme and pet", async () => {
    jest
      .mocked(saveOnboardingCash)
      .mockResolvedValue({ step: "complete", currency: "PHP", openingBalanceBooked: true });
    await render(<OnboardingScreen />);
    await fireEvent.changeText(screen.getByLabelText("Cash on hand"), "1500.50");
    await fireEvent.press(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByText("Make it yours")).toBeTruthy();
    expect(saveOnboardingCash).toHaveBeenCalledWith(
      { accessToken: "token" },
      { amountMinor: 150050, date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) },
    );
    expect(mockRetry).toHaveBeenCalled();
    // Held back so Home's pet intro does not open over the personalize step.
    expect(useOnboardingStore.getState().state?.step).toBe("cash");

    await fireEvent.press(screen.getByRole("button", { name: "Pick my egg" }));
    expect(router.replace).toHaveBeenCalledWith("/(app)/pet");
    expect(setPetEnabled).not.toHaveBeenCalled();
    expect(usePetStore.getState().introduced).toBe(true);
    expect(useOnboardingStore.getState().state?.step).toBe("complete");
  });

  it("turns the pet off when the new user declines it", async () => {
    jest
      .mocked(saveOnboardingCash)
      .mockResolvedValue({ step: "complete", currency: "PHP", openingBalanceBooked: true });
    jest.mocked(setPetEnabled).mockResolvedValue({
      enabled: false,
      species: null,
      name: null,
      stage: "egg",
      points: 0,
      nextStagePoints: null,
      pointsToday: 0,
      eggStreakDays: 0,
      eggHatchDays: 7,
      health: null,
      healthState: null,
      lastActivityAt: null,
      diedAt: null,
    });
    await render(<OnboardingScreen />);
    await fireEvent.changeText(screen.getByLabelText("Cash on hand"), "0");
    await fireEvent.press(screen.getByRole("button", { name: "Continue" }));
    await fireEvent.press(await screen.findByRole("radio", { name: /No pet for now/ }));
    await fireEvent.press(screen.getByRole("button", { name: "Start tracking" }));

    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect(setPetEnabled).toHaveBeenCalledWith({ accessToken: "token" }, false);
    expect(usePetStore.getState().pet?.enabled).toBe(false);
    expect(useOnboardingStore.getState().state?.step).toBe("complete");
  });

  it("keeps the screen open and shows the failure when the save fails", async () => {
    jest.mocked(saveOnboardingCash).mockRejectedValue(new Error("Offline."));
    await render(<OnboardingScreen />);
    await fireEvent.changeText(screen.getByLabelText("Cash on hand"), "0");
    await fireEvent.press(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText("Offline.")).toBeTruthy();
    expect(router.back).not.toHaveBeenCalled();
  });
});
