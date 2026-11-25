import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { AppState, Linking, Platform, type AppStateStatus } from "react-native";

import { useAccountPromptStore } from "@/features/account-prompt/account-prompt-store";
import { reportPlanLimit } from "@/features/billing/PlanLimitDialog";
import { showThankYou } from "@/features/thank-you/ThankYouHost";
import { useOnboardingStore } from "@/stores/onboarding-store";
import {
  chooseAccountLink,
  resetAccountLinkForTests,
  setSignedInAccount,
} from "@/telemetry/account-link";

import {
  PlayUpdatePromptHost,
  resetPlayUpdatePromptStateForTests,
  usePlayUpdatePromptPending,
} from "./PlayUpdatePromptHost";
import {
  PLAY_UPDATE_CHECK_COOLDOWN_MS,
  checkForPlayUpdate,
  openPlayListing,
  readDismissedPlayUpdateVersion,
  saveDismissedPlayUpdateVersion,
} from "./play-store";
import type * as PlayStoreModule from "./play-store";

jest.mock("./play-store", () => {
  const actual = jest.requireActual<typeof PlayStoreModule>("./play-store");
  return {
    ...actual,
    checkForPlayUpdate: jest.fn(),
    openPlayListing: jest.fn(async () => undefined),
    readDismissedPlayUpdateVersion: jest.fn(async () => null),
    saveDismissedPlayUpdateVersion: jest.fn(async () => undefined),
  };
});

jest.mock("@/telemetry/telemetry", () => ({
  telemetry: { identify: jest.fn(), reset: jest.fn(async () => undefined) },
}));

describe("PlayUpdatePromptHost", () => {
  const originalOS = Platform.OS;
  let appStateListener: ((state: AppStateStatus) => void) | null = null;

  beforeEach(() => {
    jest.clearAllMocks();
    appStateListener = null;
    Object.defineProperty(Platform, "OS", { configurable: true, get: () => "android" });
    jest.spyOn(AppState, "addEventListener").mockImplementation((_type, listener) => {
      appStateListener = listener;
      return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>;
    });
    jest.spyOn(Linking, "openURL").mockResolvedValue(true);
    useOnboardingStore.getState().reset();
    useAccountPromptStore.getState().close();
    resetAccountLinkForTests();
    resetPlayUpdatePromptStateForTests();
    jest.mocked(readDismissedPlayUpdateVersion).mockResolvedValue(null);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    Object.defineProperty(Platform, "OS", { configurable: true, get: () => originalOS });
  });

  it("shows the Play Store update modal and opens Google Play when Update is pressed", async () => {
    jest.mocked(checkForPlayUpdate).mockResolvedValue({ availableVersionCode: 20370 });

    await render(<PlayUpdatePromptHost />);
    expect(await screen.findByText("Update available")).toBeTruthy();
    expect(
      screen.getByText(
        "A newer version of Zoption is available on Google Play. Update now for the latest improvements and fixes.",
      ),
    ).toBeTruthy();

    await fireEvent.press(screen.getByRole("button", { name: "Update" }));
    expect(openPlayListing).toHaveBeenCalledTimes(1);
    expect(saveDismissedPlayUpdateVersion).not.toHaveBeenCalled();
    expect(screen.queryByText("Update available")).toBeNull();
  });

  it("persists the versionCode when Not now is pressed and only prompts again on a newer build", async () => {
    jest.mocked(checkForPlayUpdate).mockResolvedValue({ availableVersionCode: 20370 });

    const { unmount } = await render(<PlayUpdatePromptHost />);
    expect(await screen.findByText("Update available")).toBeTruthy();

    await fireEvent.press(screen.getByRole("button", { name: "Not now" }));
    expect(saveDismissedPlayUpdateVersion).toHaveBeenCalledWith(20370);
    expect(screen.queryByText("Update available")).toBeNull();
    await unmount();

    // Next launch with the same Play version stays quiet.
    jest.mocked(readDismissedPlayUpdateVersion).mockResolvedValue(20370);
    jest.mocked(checkForPlayUpdate).mockResolvedValue({ availableVersionCode: 20370 });
    const second = await render(<PlayUpdatePromptHost />);
    await waitFor(() => expect(checkForPlayUpdate).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("Update available")).toBeNull();
    await second.unmount();

    // A newer Play version prompts again.
    jest.mocked(checkForPlayUpdate).mockResolvedValue({ availableVersionCode: 20371 });
    await render(<PlayUpdatePromptHost />);
    expect(await screen.findByText("Update available")).toBeTruthy();
  });

  it("waits behind higher-priority modals and onboarding without overlapping", async () => {
    jest.mocked(checkForPlayUpdate).mockResolvedValue({ availableVersionCode: 20370 });
    await act(async () => setSignedInAccount({ id: "user-1", email: "person@example.com" }));
    useOnboardingStore.getState().setOpen(true);

    await render(<PlayUpdatePromptHost />);
    await waitFor(() => expect(checkForPlayUpdate).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("Update available")).toBeNull();

    await act(async () => useOnboardingStore.getState().setOpen(false));
    expect(screen.queryByText("Update available")).toBeNull();

    await act(async () => chooseAccountLink("declined"));
    expect(await screen.findByText("Update available")).toBeTruthy();

    // Yield if a higher-priority dialog opens, then return when it closes.
    await act(async () => showThankYou("pro"));
    expect(screen.queryByText("Update available")).toBeNull();
    await act(async () => showThankYou(null as never));
    expect(await screen.findByText("Update available")).toBeTruthy();

    await act(async () => reportPlanLimit("Limit hit"));
    expect(screen.queryByText("Update available")).toBeNull();
    await act(async () => reportPlanLimit(null as never));
    expect(await screen.findByText("Update available")).toBeTruthy();

    await act(async () => useAccountPromptStore.getState().open("assistant"));
    expect(screen.queryByText("Update available")).toBeNull();
    await act(async () => useAccountPromptStore.getState().close());
    expect(await screen.findByText("Update available")).toBeTruthy();
  });

  it("does nothing on iOS", async () => {
    Object.defineProperty(Platform, "OS", { configurable: true, get: () => "ios" });
    jest.mocked(checkForPlayUpdate).mockResolvedValue({ availableVersionCode: 20370 });

    await render(<PlayUpdatePromptHost />);
    expect(checkForPlayUpdate).not.toHaveBeenCalled();
    expect(screen.queryByText("Update available")).toBeNull();
  });

  it("exposes pending state while checking or open and rechecks after foreground cooldown", async () => {
    let resolveCheck!: (value: { availableVersionCode: number } | null) => void;
    jest.mocked(checkForPlayUpdate).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCheck = resolve;
        }),
    );

    const nowSpy = jest.spyOn(Date, "now").mockReturnValue(10_000);
    let pendingSnapshot = false;
    function Probe() {
      pendingSnapshot = usePlayUpdatePromptPending();
      return <PlayUpdatePromptHost />;
    }

    await render(<Probe />);
    expect(pendingSnapshot).toBe(true);

    await act(async () => resolveCheck(null));
    expect(pendingSnapshot).toBe(false);

    // Foreground inside cooldown does not recheck.
    nowSpy.mockReturnValue(10_000 + PLAY_UPDATE_CHECK_COOLDOWN_MS - 1);
    await act(async () => appStateListener?.("active"));
    expect(checkForPlayUpdate).toHaveBeenCalledTimes(1);

    // Foreground after cooldown rechecks and shows if an update appeared.
    jest.mocked(checkForPlayUpdate).mockResolvedValue({ availableVersionCode: 20370 });
    nowSpy.mockReturnValue(10_000 + PLAY_UPDATE_CHECK_COOLDOWN_MS);
    await act(async () => appStateListener?.("active"));
    expect(await screen.findByText("Update available")).toBeTruthy();
    expect(pendingSnapshot).toBe(true);
  });
});
