import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";

import { saveOnboardingCash } from "@/api/onboarding";
import { useOnboardingStore } from "@/stores/onboarding-store";

import { OnboardingScreen } from "./OnboardingScreen";

const mockRetry = jest.fn();
jest.mock("expo-router", () => ({ router: { back: jest.fn(), push: jest.fn() } }));
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
    useOnboardingStore.getState().setState({ step: "cash", currency: "PHP" });
  });

  it("rejects an empty or malformed amount before calling the Worker", async () => {
    await render(<OnboardingScreen />);
    await fireEvent.press(screen.getByRole("button", { name: "Finish setup" }));
    expect(await screen.findByText("Enter the cash you have on hand, or 0.")).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText("Cash on hand"), "1.234");
    await fireEvent.press(screen.getByRole("button", { name: "Finish setup" }));
    expect(
      await screen.findByText("Enter a number with no more than two decimal places."),
    ).toBeTruthy();
    expect(saveOnboardingCash).not.toHaveBeenCalled();
  });

  it("saves cash in minor units, completes the step, and pulls the opening entry", async () => {
    jest
      .mocked(saveOnboardingCash)
      .mockResolvedValue({ step: "complete", currency: "PHP", openingBalanceBooked: true });
    await render(<OnboardingScreen />);
    await fireEvent.changeText(screen.getByLabelText("Cash on hand"), "1500.50");
    await fireEvent.press(screen.getByRole("button", { name: "Finish setup" }));

    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect(saveOnboardingCash).toHaveBeenCalledWith(
      { accessToken: "token" },
      { amountMinor: 150050, date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) },
    );
    expect(useOnboardingStore.getState().state?.step).toBe("complete");
    expect(mockRetry).toHaveBeenCalled();
  });

  it("keeps the screen open and shows the failure when the save fails", async () => {
    jest.mocked(saveOnboardingCash).mockRejectedValue(new Error("Offline."));
    await render(<OnboardingScreen />);
    await fireEvent.changeText(screen.getByLabelText("Cash on hand"), "0");
    await fireEvent.press(screen.getByRole("button", { name: "Finish setup" }));
    expect(await screen.findByText("Offline.")).toBeTruthy();
    expect(router.back).not.toHaveBeenCalled();
  });
});
