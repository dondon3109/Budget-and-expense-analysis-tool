import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";

import { ApiTransportError } from "@/api/authenticated";
import { saveMoneyPreferences, skipGoal } from "@/api/goal-profile";
import { getOnboardingState, saveOnboardingCash } from "@/api/onboarding";
import { choosePetEgg, setPetEnabled } from "@/api/pet";
import { babyPet, noPet } from "@/features/pet/pet-test-fixtures";
import { useGoalProfileStore } from "@/stores/goal-profile-store";
import { useOnboardingStore } from "@/stores/onboarding-store";
import { usePetStore } from "@/stores/pet-store";
import { useWorkspaceCurrencyStore } from "@/stores/workspace-currency-store";
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
  getOnboardingState: jest.fn(),
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
    jest.mocked(choosePetEgg).mockResolvedValue({ ...babyPet, stage: "egg", name: "Bubbles" });
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

    await fireEvent.press(await screen.findByRole("radio", { name: "Hippo egg" }));
    await fireEvent.changeText(screen.getByLabelText("Name your pet"), "Bubbles");
    await fireEvent.press(screen.getByRole("button", { name: "Choose the Hippo egg" }));
    expect(choosePetEgg).toHaveBeenCalledWith(
      { accessToken: "token" },
      "hippo",
      "Bubbles",
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
    jest.mocked(getOnboardingState).mockResolvedValue({ step: "cash", currency: "PHP" });
    await render(<OnboardingScreen />);
    expect(telemetry.capture).not.toHaveBeenCalledWith("onboarding_started");
  });

  it("commits completion on unmount after cash is saved so Android Back never strands Resume setup", async () => {
    jest
      .mocked(saveOnboardingCash)
      .mockResolvedValue({ step: "complete", currency: "USD", openingBalanceBooked: true });
    const view = await render(<OnboardingScreen />);
    await fireEvent.changeText(screen.getByLabelText("Cash on hand"), "500");
    await fireEvent.press(continueButton());
    await screen.findByText("Make it yours");

    // Still held back while the post-cash step is open.
    expect(useOnboardingStore.getState().state?.step).toBe("cash");

    // Simulate Android Back dismissing the route without pressing Start tracking.
    await view.unmount();
    expect(useOnboardingStore.getState().state).toEqual({ step: "complete", currency: "USD" });
    expect(useWorkspaceCurrencyStore.getState().currency).toBe("USD");
    expect(useGoalProfileStore.getState().prompted).toBe(true);
    expect(usePetStore.getState().introduced).toBe(true);
  });

  it("reconciles 409 onboarding_complete by updating state, retrying sync, and closing", async () => {
    jest
      .mocked(saveOnboardingCash)
      .mockRejectedValue(
        new ApiTransportError(
          "Onboarding is already complete.",
          "conflict",
          409,
          "onboarding_complete",
        ),
      );
    jest.mocked(getOnboardingState).mockResolvedValue({ step: "complete", currency: "EUR" });

    await render(<OnboardingScreen />);
    await fireEvent.press(continueButton());

    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect(useOnboardingStore.getState().state).toEqual({ step: "complete", currency: "EUR" });
    expect(useWorkspaceCurrencyStore.getState().currency).toBe("EUR");
    expect(mockRetry).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Onboarding is already complete.")).toBeNull();
  });

  it("falls back to complete when reconciling 409 onboarding_complete and refresh fails without clobbering currency", async () => {
    useWorkspaceCurrencyStore.getState().setCurrency("USD");
    jest
      .mocked(saveOnboardingCash)
      .mockRejectedValue(
        new ApiTransportError(
          "Onboarding is already complete.",
          "conflict",
          409,
          "onboarding_complete",
        ),
      );
    jest.mocked(getOnboardingState).mockRejectedValue(new Error("offline"));

    await render(<OnboardingScreen />);
    await fireEvent.press(continueButton());

    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect(useOnboardingStore.getState().state).toEqual({ step: "complete", currency: "PHP" });
    expect(useWorkspaceCurrencyStore.getState().currency).toBe("USD");
    expect(mockRetry).toHaveBeenCalledTimes(1);
  });

  it("returns to currency with a notice on 409 onboarding_step_out_of_order", async () => {
    jest
      .mocked(saveOnboardingCash)
      .mockRejectedValue(
        new ApiTransportError(
          "Choose your currency first.",
          "conflict",
          409,
          "onboarding_step_out_of_order",
        ),
      );
    jest.mocked(getOnboardingState).mockResolvedValue({ step: "currency", currency: "PHP" });

    await render(<OnboardingScreen />);
    await fireEvent.press(continueButton());

    expect(await screen.findByText("Choose your currency")).toBeTruthy();
    expect(screen.getByText("Choose your currency first.")).toBeTruthy();
    expect(router.back).not.toHaveBeenCalled();
  });

  it("commits completion when Android Back unmounts while cash save is still in flight", async () => {
    let resolveSave!: (value: {
      step: "complete";
      currency: "USD";
      openingBalanceBooked: boolean;
    }) => void;
    jest.mocked(saveOnboardingCash).mockReturnValue(
      new Promise((resolve) => {
        resolveSave = resolve;
      }),
    );
    const view = await render(<OnboardingScreen />);
    await fireEvent.changeText(screen.getByLabelText("Cash on hand"), "250");
    await fireEvent.press(continueButton());

    // Unmount before the Worker answers.
    await view.unmount();
    expect(useOnboardingStore.getState().state?.step).toBe("cash");

    resolveSave({ step: "complete", currency: "USD", openingBalanceBooked: true });
    await waitFor(() =>
      expect(useOnboardingStore.getState().state).toEqual({ step: "complete", currency: "USD" }),
    );
    expect(useWorkspaceCurrencyStore.getState().currency).toBe("USD");
    expect(useGoalProfileStore.getState().prompted).toBe(true);
    expect(usePetStore.getState().introduced).toBe(true);
  });

  it("does not leak finished state or prompt flags into the next session when reset before unmount", async () => {
    jest
      .mocked(saveOnboardingCash)
      .mockResolvedValue({ step: "complete", currency: "USD", openingBalanceBooked: true });
    const view = await render(<OnboardingScreen />);
    await fireEvent.changeText(screen.getByLabelText("Cash on hand"), "500");
    await fireEvent.press(continueButton());
    await screen.findByText("Make it yours");

    // Simulate sign-out clearing user-scoped runtime stores before the screen unmounts.
    useOnboardingStore.getState().reset();
    useGoalProfileStore.getState().reset();
    usePetStore.getState().reset();

    await view.unmount();
    expect(useOnboardingStore.getState().state).toBeNull();
    expect(useGoalProfileStore.getState().prompted).toBe(false);
    expect(usePetStore.getState().introduced).toBe(false);
  });

  it("closes immediately on Resume setup when the Worker already marked onboarding complete", async () => {
    useOnboardingStore.getState().setOpen(true);
    useOnboardingStore.getState().setOpen(false);
    expect(useOnboardingStore.getState().dismissed).toBe(true);
    jest.mocked(getOnboardingState).mockResolvedValue({ step: "complete", currency: "JPY" });

    await render(<OnboardingScreen />);

    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect(useOnboardingStore.getState().state).toEqual({ step: "complete", currency: "JPY" });
    expect(useWorkspaceCurrencyStore.getState().currency).toBe("JPY");
    expect(mockRetry).toHaveBeenCalledTimes(1);
  });
});
