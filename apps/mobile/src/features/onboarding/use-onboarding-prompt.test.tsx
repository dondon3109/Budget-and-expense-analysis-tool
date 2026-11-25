import NetInfo, { type NetInfoState } from "@react-native-community/netinfo";
import { act, render, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { AppState, type AppStateStatus } from "react-native";

import { ApiTransportError } from "@/api/authenticated";
import { getGoalsProfile, getMoneyPreferences } from "@/api/goal-profile";
import { dismissQuickStart, getOnboardingState, getQuickStartState } from "@/api/onboarding";
import { useGoalProfileSync } from "@/auth/goal-profile-sync";
import { quickStartDismissStorageKey } from "@/features/dashboard/QuickStartGuideCard";
import { useGoalProfileStore } from "@/stores/goal-profile-store";
import { useOnboardingStore } from "@/stores/onboarding-store";
import { useWorkspaceCurrencyStore } from "@/stores/workspace-currency-store";

import { useOnboardingPrompt } from "./use-onboarding-prompt";

const mockGetAccessToken = jest.fn(async (_refresh: boolean) => "token");
const mockRetrySync = jest.fn();
jest.mock("@react-native-community/netinfo", () => ({
  addEventListener: jest.fn(() => () => undefined),
}));
jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
}));
jest.mock("@/sync/sync-state", () => ({
  useSyncState: () => ({ retry: mockRetrySync }),
}));
jest.mock("@/auth/session-state", () => ({
  useSessionSnapshot: () => ({
    status: "signed-in",
    subject: "user-1",
    getAccessToken: mockGetAccessToken,
  }),
}));
jest.mock("@/api/onboarding", () => ({
  getOnboardingState: jest.fn(),
  getQuickStartState: jest.fn(),
  dismissQuickStart: jest.fn(),
}));
jest.mock("@/api/goal-profile", () => ({
  getGoalsProfile: jest.fn(),
  getMoneyPreferences: jest.fn(),
}));

function Probe() {
  useOnboardingPrompt();
  return null;
}

function CombinedProbe() {
  useGoalProfileSync();
  useOnboardingPrompt();
  return null;
}

describe("useOnboardingPrompt", () => {
  let onNetInfo: ((state: NetInfoState) => void) | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAccessToken.mockReset().mockResolvedValue("token");
    onNetInfo = undefined;
    jest
      .mocked(NetInfo.addEventListener)
      .mockReset()
      .mockImplementation((listener) => {
        onNetInfo = listener;
        return () => undefined;
      });
    jest.spyOn(AppState, "addEventListener").mockImplementation(() => ({ remove: jest.fn() }));
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
    jest.mocked(getQuickStartState).mockResolvedValue({ dismissed: false });
    jest.mocked(dismissQuickStart).mockResolvedValue({ dismissed: true });
    jest.mocked(SecureStore.getItemAsync).mockResolvedValue(null);
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

  it("deduplicates goal profile and money preference fetches with useGoalProfileSync", async () => {
    jest.mocked(getOnboardingState).mockResolvedValue({ step: "currency", currency: "PHP" });
    await render(<CombinedProbe />);
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/(app)/onboarding"));
    expect(getGoalsProfile).toHaveBeenCalledTimes(1);
    expect(getMoneyPreferences).toHaveBeenCalledTimes(1);
  });

  it("retries 401 with a refreshed token and recovers on NetInfo reconnect after offline failure", async () => {
    mockGetAccessToken
      .mockResolvedValueOnce("stale")
      .mockResolvedValueOnce("fresh")
      .mockResolvedValue("fresh");
    jest
      .mocked(getOnboardingState)
      .mockRejectedValueOnce(new ApiTransportError("expired", "session_expired", 401))
      .mockRejectedValueOnce(new ApiTransportError("offline", "network", 0))
      .mockResolvedValueOnce({ step: "currency", currency: "PHP" });

    await render(<Probe />);
    await waitFor(() => expect(getOnboardingState).toHaveBeenCalledTimes(2));
    expect(mockGetAccessToken).toHaveBeenNthCalledWith(1, false);
    expect(mockGetAccessToken).toHaveBeenNthCalledWith(2, true);
    expect(router.push).not.toHaveBeenCalled();

    await act(async () => {
      onNetInfo?.({ isConnected: true, isInternetReachable: true } as NetInfoState);
    });
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/(app)/onboarding"));
    expect(getOnboardingState).toHaveBeenCalledTimes(3);
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
      spy.mockImplementation(() => ({ remove: jest.fn() }));
    }
  });

  it("reads quick start dismissal and syncs an earlier local dismissal to the server", async () => {
    jest.mocked(getOnboardingState).mockResolvedValue({ step: "complete", currency: "PHP" });
    jest.mocked(getQuickStartState).mockResolvedValue({ dismissed: false });
    jest
      .mocked(SecureStore.getItemAsync)
      .mockImplementation(async (key) =>
        key === quickStartDismissStorageKey("user-1") ? "true" : null,
      );

    await render(<Probe />);

    await waitFor(() => expect(dismissQuickStart).toHaveBeenCalledTimes(1));
    expect(useOnboardingStore.getState().quickStartDismissed).toBe(true);
  });
});
