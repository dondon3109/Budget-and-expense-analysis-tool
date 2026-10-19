import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";

import { skipGoal } from "@/api/goal-profile";
import { saveOnboardingCash } from "@/api/onboarding";
import { choosePetEgg, setPetEnabled } from "@/api/pet";
import { babyPet, noPet } from "@/features/pet/pet-test-fixtures";
import { useGoalProfileStore } from "@/stores/goal-profile-store";
import { useOnboardingStore } from "@/stores/onboarding-store";
import { usePetStore } from "@/stores/pet-store";

import { OnboardingScreen } from "./OnboardingScreen";

const mockRetry = jest.fn();
jest.mock("expo-router", () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
}));
jest.mock("@/api/pet", () => ({ setPetEnabled: jest.fn(), choosePetEgg: jest.fn() }));
jest.mock("@/api/goal-profile", () => ({ saveGoals: jest.fn(), skipGoal: jest.fn() }));
jest.mock("@/auth/session-state", () => ({
  useSessionSnapshot: () => ({ subject: "user-1", getAccessToken: async () => "token" }),
}));
jest.mock("react-native-safe-area-context", () => ({
  ...jest.requireActual("react-native-safe-area-context"),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@/sync/sync-state", () => ({ useSyncState: () => ({ retry: mockRetry }) }));
jest.mock("@/api/onboarding", () => ({
  saveOnboardingCurrency: jest.fn(),
  saveOnboardingCash: jest.fn(),
}));

const continueButton = () => screen.getByRole("button", { name: "Continue" });

async function saveCash(amount: string) {
  jest
    .mocked(saveOnboardingCash)
    .mockResolvedValue({ step: "complete", currency: "PHP", openingBalanceBooked: true });
  await render(<OnboardingScreen />);
  await fireEvent.changeText(screen.getByLabelText("Cash on hand"), amount);
  await fireEvent.press(continueButton());
  await screen.findByText("Pick a look");
}

describe("OnboardingScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useOnboardingStore.getState().reset();
    usePetStore.getState().reset();
    usePetStore.getState().setPet(noPet);
    useGoalProfileStore.getState().reset();
    useOnboardingStore.getState().setState({ step: "cash", currency: "PHP" });
  });

  it("rejects an empty or malformed amount before calling the Worker", async () => {
    await render(<OnboardingScreen />);
    await fireEvent.press(continueButton());
    expect(await screen.findByText("Enter the cash you have on hand, or 0.")).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText("Cash on hand"), "1.234");
    await fireEvent.press(continueButton());
    expect(
      await screen.findByText("Enter a number with no more than two decimal places."),
    ).toBeTruthy();
    expect(saveOnboardingCash).not.toHaveBeenCalled();
  });

  it("goes from cash through theme, pet, and egg to the thank-you, then closes", async () => {
    jest.mocked(choosePetEgg).mockResolvedValue({ ...babyPet, stage: "egg", name: "Spike" });
    await saveCash("1500.50");
    expect(saveOnboardingCash).toHaveBeenCalledWith(
      { accessToken: "token" },
      { amountMinor: 150050, date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) },
    );
    expect(mockRetry).toHaveBeenCalled();
    // Held back so Home's goal and pet prompts do not open over setup.
    expect(useOnboardingStore.getState().state?.step).toBe("cash");

    await fireEvent.press(continueButton());
    await fireEvent.press(await screen.findByRole("radio", { name: /Yes, give me a pet/ }));
    await fireEvent.press(continueButton());

    await fireEvent.press(await screen.findByRole("radio", { name: "Hedgehog egg" }));
    await fireEvent.changeText(screen.getByLabelText("Name your pet"), "Spike");
    await fireEvent.press(screen.getByRole("button", { name: "Choose the Hedgehog egg" }));
    expect(await screen.findByText("Thank you for setting up Zoption")).toBeTruthy();
    expect(choosePetEgg).toHaveBeenCalledWith(
      { accessToken: "token" },
      "hedgehog",
      "Spike",
      "original",
    );
    expect(setPetEnabled).not.toHaveBeenCalled();
    expect(usePetStore.getState().introduced).toBe(true);

    await fireEvent.press(screen.getByRole("button", { name: "Start tracking" }));
    expect(router.back).toHaveBeenCalled();
    expect(useOnboardingStore.getState().state?.step).toBe("complete");
  });

  it("turns the pet off on a no and asks the goals when none were chosen", async () => {
    useGoalProfileStore
      .getState()
      .setProfile({ goals: [], otherText: null, selectedAt: null, skipped: false });
    jest.mocked(setPetEnabled).mockResolvedValue({ ...noPet, enabled: false });
    jest
      .mocked(skipGoal)
      .mockResolvedValue({ goal: null, otherText: null, selectedAt: null, skipped: true });
    await saveCash("0");

    await fireEvent.press(continueButton());
    await fireEvent.press(await screen.findByRole("radio", { name: /No pet for now/ }));
    await fireEvent.press(continueButton());
    expect(await screen.findByText("What brings you to Zoption?")).toBeTruthy();
    expect(setPetEnabled).toHaveBeenCalledWith({ accessToken: "token" }, false);

    await fireEvent.press(screen.getByRole("button", { name: "Skip for now" }));
    expect(await screen.findByText("Thank you for setting up Zoption")).toBeTruthy();
    expect(skipGoal).toHaveBeenCalled();
  });

  it("returns to a done step from the track, showing what the Worker already saved", async () => {
    await saveCash("1500.50");
    await fireEvent.press(continueButton());
    await screen.findByText("Want a streak pet?");

    await fireEvent.press(screen.getByRole("button", { name: "Back to step 3" }));
    expect(screen.getByText("Pick a look")).toBeTruthy();

    await fireEvent.press(screen.getByRole("button", { name: "Back to step 2" }));
    expect(screen.getByText("Your cash on hand")).toBeTruthy();
    expect(screen.getByText(/1,500\.50/)).toBeTruthy();
    await fireEvent.press(continueButton());
    expect(screen.getByText("Pick a look")).toBeTruthy();
  });

  it("returns from cash to the currency picker before the cash is saved", async () => {
    await render(<OnboardingScreen />);
    await fireEvent.press(screen.getByRole("button", { name: "Back to step 1" }));
    expect(screen.getByText("Choose your currency")).toBeTruthy();
  });

  it("keeps the screen open and shows the failure when the save fails", async () => {
    jest.mocked(saveOnboardingCash).mockRejectedValue(new Error("Offline."));
    await render(<OnboardingScreen />);
    await fireEvent.changeText(screen.getByLabelText("Cash on hand"), "0");
    await fireEvent.press(continueButton());
    expect(await screen.findByText("Offline.")).toBeTruthy();
    expect(router.back).not.toHaveBeenCalled();
  });
});
