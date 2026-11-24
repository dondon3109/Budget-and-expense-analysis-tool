import { act, render, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";
import { AppState, type AppStateStatus } from "react-native";

import { getGoalsProfile, getMoneyPreferences } from "@/api/goal-profile";
import { getOnboardingState } from "@/api/onboarding";
import { useGoalProfileStore } from "@/stores/goal-profile-store";
import { useOnboardingStore } from "@/stores/onboarding-store";
import { useWorkspaceCurrencyStore } from "@/stores/workspace-currency-store";

import { useOnboardingPrompt } from "./use-onboarding-prompt";

const mockRetrySync = jest.fn();
jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
jest.mock("@/sync/sync-state", () => ({
  useSyncState: () => ({ retry: mockRetrySync }),
}));
jest.mock("@/auth/session-state", () => ({
  useSessionSnapshot: () => ({
    status: "signed-in",
    subject: "user-1",
    getAccessToken: async () => "token",
  }),
}));
jest.mock("@/api/onboarding", () => ({ getOnboardingState: jest.fn() }));
jest.mock("@/api/goal-profile", () => ({
  getGoalsProfile: jest.fn(),
  getMoneyPreferences: jest.fn(),
}));

function Probe() {
  useOnboardingPrompt();
  return null;
}

describe("useOnboardingPrompt", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useOnboardingStore.getState().reset();
    useGoalProfileStore.getState().reset();
    jest.mocked(getGoalsProfile).mockResolvedValue({
      goals: [],
      otherText: null,
      selectedAt: null,
      skipped: false,
    });
    jest.mocked(getMoneyPreferences).mockResolvedValue({
      incomeCadence: null,
      budgetingStyle: null,
      spendingFocus: [],
    });
  });

  it("loads goals and preferences before opening setup so neither races", async () => {
    jest.mocked(getOnboardingState).mockResolvedValue({ step: "currency", currency: "PHP" });
    const view = await render(<Probe />);
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/(app)/onboarding"));
    expect(useGoalProfileStore.getState().profile).not.toBeNull();
    expect(useGoalProfileStore.getState().preferences).not.toBeNull();
    await view.rerender(<Probe />);
    expect(router.push).toHaveBeenCalledTimes(1);
  });

  it("stays closed for a finished workspace and when the Worker is unreachable", async () => {
    jest.mocked(getOnboardingState).mockResolvedValue({ step: "complete", currency: "PHP" });
    await render(<Probe />);
    await waitFor(() => expect(useOnboardingStore.getState().state?.step).toBe("complete"));
    expect(router.push).not.toHaveBeenCalled();

    useOnboardingStore.getState().reset();
    jest.mocked(getOnboardingState).mockRejectedValue(new Error("offline"));
    await render(<Probe />);
    await waitFor(() => expect(getOnboardingState).toHaveBeenCalledTimes(2));
    expect(router.push).not.toHaveBeenCalled();
  });

  it("refreshes incomplete onboarding state when returning from the background", async () => {
    let appStateChange: ((state: AppStateStatus) => void) | undefined;
    const spy = jest.spyOn(AppState, "addEventListener").mockImplementation((_type, listener) => {
      appStateChange = listener;
      return { remove: jest.fn() };
    });
    try {
      jest
        .mocked(getOnboardingState)
        .mockResolvedValueOnce({ step: "cash", currency: "PHP" })
        .mockResolvedValueOnce({ step: "complete", currency: "USD" });

      await render(<Probe />);
      await waitFor(() => expect(router.push).toHaveBeenCalledTimes(1));

      await act(async () => {
        appStateChange?.("background");
        appStateChange?.("active");
      });

      await waitFor(() => expect(useOnboardingStore.getState().state?.step).toBe("complete"));
      expect(useWorkspaceCurrencyStore.getState().currency).toBe("USD");
      expect(mockRetrySync).toHaveBeenCalledTimes(1);
      expect(router.push).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
    }
  });
});
