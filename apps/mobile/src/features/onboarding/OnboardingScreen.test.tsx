import { fireEvent, render, screen } from "@testing-library/react-native";
import { router } from "expo-router";

import { saveMoneyPreferences, skipGoal } from "@/api/goal-profile";
import { saveOnboardingCash } from "@/api/onboarding";
import { choosePetEgg, setPetEnabled } from "@/api/pet";
import { babyPet, noPet } from "@/features/pet/pet-test-fixtures";
import { useGoalProfileStore } from "@/stores/goal-profile-store";
import { useOnboardingStore } from "@/stores/onboarding-store";
import { usePetStore } from "@/stores/pet-store";
import { telemetry } from "@/telemetry/telemetry";

import { OnboardingScreen } from "./OnboardingScreen";

const mockRetry = jest.fn();
jest.mock("expo-router", () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
}));
jest.mock("@/api/pet", () => ({
  getPet: jest.fn(),
  setPetEnabled: jest.fn(),
  choosePetEgg: jest.fn(),
}));
jest.mock("@/api/goal-profile", () => ({
  saveGoals: jest.fn(),
  skipGoal: jest.fn(),
  saveMoneyPreferences: jest.fn(),
}));
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
jest.mock("@/telemetry/telemetry", () => ({
  telemetry: { capture: jest.fn(async () => undefined) },
}));

const continueButton = () => screen.getByRole("button", { name: "Continue" });

async function saveCash(amount: string, nextHeading = "Make it yours") {
  jest
    .mocked(saveOnboardingCash)
    .mockResolvedValue({ step: "complete", currency: "PHP", openingBalanceBooked: true });
  await render(<OnboardingScreen />);
  if (amount) {
    await fireEvent.changeText(screen.getByLabelText("Cash on hand"), amount);
  }
  await fireEvent.press(continueButton());
  await screen.findByText(nextHeading);
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

  it("treats a blank cash field as zero and rejects malformed amounts before calling the Worker", async () => {
    await render(<OnboardingScreen />);
    await fireEvent.changeText(screen.getByLabelText("Cash on hand"), "1.234");
    await fireEvent.press(continueButton());
    expect(
      await screen.findByText("Enter a number with no more than two decimal places."),
    ).toBeTruthy();
    expect(saveOnboardingCash).not.toHaveBeenCalled();

    jest
      .mocked(saveOnboardingCash)
      .mockResolvedValue({ step: "complete", currency: "PHP", openingBalanceBooked: false });
    await fireEvent.changeText(screen.getByLabelText("Cash on hand"), "");
    await fireEvent.press(continueButton());
    await screen.findByText("Make it yours");
    expect(saveOnboardingCash).toHaveBeenCalledWith(
      { accessToken: "token" },
      { amountMinor: 0, date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) },
    );
  });

  it("goes from cash through Make it yours and egg, then closes", async () => {
    jest.mocked(choosePetEgg).mockResolvedValue({ ...babyPet, stage: "egg", name: "Spike" });
    await saveCash("1500.50");
    expect(saveOnboardingCash).toHaveBeenCalledWith(
      { accessToken: "token" },
      { amountMinor: 150050, date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) },
    );
    expect(mockRetry).toHaveBeenCalled();
    // Held back so Home's goal and pet prompts do not open over setup.
    expect(useOnboardingStore.getState().state?.step).toBe("cash");

    await fireEvent.press(screen.getByRole("radio", { name: /Yes, give me a pet/ }));
    await fireEvent.press(screen.getByRole("button", { name: "Pick my egg" }));

    await fireEvent.press(await screen.findByRole("radio", { name: "Hedgehog egg" }));
    await fireEvent.changeText(screen.getByLabelText("Name your pet"), "Spike");
    await fireEvent.press(screen.getByRole("button", { name: "Choose the Hedgehog egg" }));
    expect(choosePetEgg).toHaveBeenCalledWith(
      { accessToken: "token" },
      "hedgehog",
      "Spike",
      "original",
    );
    expect(setPetEnabled).not.toHaveBeenCalled();
    expect(usePetStore.getState().introduced).toBe(true);
    expect(router.back).toHaveBeenCalled();
    expect(useOnboardingStore.getState().state?.step).toBe("complete");
    expect(telemetry.capture).toHaveBeenCalledWith("onboarding_completed");
  });

  it("asks goals right after cash when none were chosen, then turns pet off on a no and closes", async () => {
    useGoalProfileStore
      .getState()
      .setProfile({ goals: [], otherText: null, selectedAt: null, skipped: false });
    jest.mocked(setPetEnabled).mockResolvedValue({ ...noPet, enabled: false });
    jest
      .mocked(skipGoal)
      .mockResolvedValue({ goal: null, otherText: null, selectedAt: null, skipped: true });
    await saveCash("0", "What brings you to Zoption?");

    await fireEvent.press(screen.getByRole("button", { name: "Skip for now" }));
    expect(skipGoal).toHaveBeenCalled();
    expect(await screen.findByText("Make it yours")).toBeTruthy();

    await fireEvent.press(screen.getByRole("radio", { name: /No pet for now/ }));
    await fireEvent.press(screen.getByRole("button", { name: "Start tracking" }));
    expect(setPetEnabled).toHaveBeenCalledWith({ accessToken: "token" }, false);
    expect(router.back).toHaveBeenCalled();
    expect(useOnboardingStore.getState().state?.step).toBe("complete");
  });

  it("returns to a done step from the track, showing what the Worker already saved", async () => {
    await saveCash("1500.50");

    await fireEvent.press(screen.getByRole("button", { name: "Back to step 2" }));
    expect(screen.getByText("Your cash on hand")).toBeTruthy();
    expect(screen.getByText(/1,500\.50/)).toBeTruthy();
    await fireEvent.press(continueButton());
    expect(screen.getByText("Make it yours")).toBeTruthy();
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

  it("asks the money habits after cash when none are saved, and saves the answers", async () => {
    useGoalProfileStore
      .getState()
      .setPreferences({ incomeCadence: null, budgetingStyle: null, spendingFocus: [] });
    jest.mocked(setPetEnabled).mockResolvedValue({ ...noPet, enabled: false });
    jest.mocked(saveMoneyPreferences).mockImplementation(async (_api, input) => input);
    await saveCash("0", "How do you manage money?");

    await fireEvent.press(screen.getByRole("radio", { name: "Twice a month (kinsenas)" }));
    await fireEvent.press(screen.getByRole("checkbox", { name: "Bills and subscriptions" }));
    await fireEvent.press(continueButton());
    expect(await screen.findByText("Make it yours")).toBeTruthy();
    expect(saveMoneyPreferences).toHaveBeenCalledWith(
      { accessToken: "token" },
      { incomeCadence: "semi_monthly", budgetingStyle: null, spendingFocus: ["bills"] },
    );
    expect(useGoalProfileStore.getState().preferences?.incomeCadence).toBe("semi_monthly");
  });

  it("leaves the money habits out when they are saved or unknown", async () => {
    useGoalProfileStore
      .getState()
      .setPreferences({ incomeCadence: "monthly", budgetingStyle: null, spendingFocus: [] });
    await saveCash("0", "Make it yours");
    expect(screen.queryByText("How do you manage money?")).toBeNull();
  });

  it("does not fire onboarding_started on the complete fallback or a repeat open after Not now", async () => {
    useOnboardingStore.getState().setState({ step: "complete", currency: "PHP" });
    const completeView = await render(<OnboardingScreen />);
    expect(telemetry.capture).not.toHaveBeenCalledWith("onboarding_started");
    await completeView.unmount();

    useOnboardingStore.getState().reset();
    useOnboardingStore.getState().setState({ step: "cash", currency: "PHP" });
    const first = await render(<OnboardingScreen />);
    expect(telemetry.capture).toHaveBeenCalledWith("onboarding_started");
    await fireEvent.press(screen.getByRole("button", { name: "Not now" }));
    await first.unmount();

    jest.mocked(telemetry.capture).mockClear();
    await render(<OnboardingScreen />);
    expect(telemetry.capture).not.toHaveBeenCalledWith("onboarding_started");
  });
});
