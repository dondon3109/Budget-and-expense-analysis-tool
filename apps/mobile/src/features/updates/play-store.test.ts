import { requireOptionalNativeModule } from "expo";
import * as SecureStore from "expo-secure-store";
import { Linking, Platform } from "react-native";

import {
  DISMISSED_PLAY_UPDATE_KEY,
  PLAY_PACKAGE,
  PLAY_UPDATE_CHECK_COOLDOWN_MS,
  checkForPlayUpdate,
  openPlayListing,
  readDismissedPlayUpdateVersion,
  saveDismissedPlayUpdateVersion,
  shouldPromptForPlayUpdate,
  shouldRunPlayUpdateCheck,
} from "./play-store";

jest.mock("expo", () => ({
  requireOptionalNativeModule: jest.fn(),
}));

const mockStorage = new Map<string, string>();
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async (key: string) => mockStorage.get(key) ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => void mockStorage.set(key, value)),
}));

describe("play-store update checks", () => {
  const originalOS = Platform.OS;

  beforeEach(() => {
    mockStorage.clear();
    jest.clearAllMocks();
    Object.defineProperty(Platform, "OS", { configurable: true, get: () => "android" });
  });

  afterEach(() => {
    Object.defineProperty(Platform, "OS", { configurable: true, get: () => originalOS });
  });

  it("returns availableVersionCode when Google Play reports an available update", async () => {
    jest.mocked(requireOptionalNativeModule).mockReturnValue({
      checkForUpdateAsync: jest.fn(async () => ({ available: true, availableVersionCode: 20370 })),
    });

    await expect(checkForPlayUpdate()).resolves.toEqual({ availableVersionCode: 20370 });
    expect(requireOptionalNativeModule).toHaveBeenCalledWith("ZoptionPlayUpdates");
  });

  it("returns null on iOS, missing native module, unavailable status, malformed payloads, or errors", async () => {
    Object.defineProperty(Platform, "OS", { configurable: true, get: () => "ios" });
    await expect(checkForPlayUpdate()).resolves.toBeNull();
    expect(requireOptionalNativeModule).not.toHaveBeenCalled();

    Object.defineProperty(Platform, "OS", { configurable: true, get: () => "android" });
    jest.mocked(requireOptionalNativeModule).mockReturnValue(null);
    await expect(checkForPlayUpdate()).resolves.toBeNull();

    jest.mocked(requireOptionalNativeModule).mockReturnValue({
      checkForUpdateAsync: jest.fn(async () => ({ available: false })),
    });
    await expect(checkForPlayUpdate()).resolves.toBeNull();

    jest.mocked(requireOptionalNativeModule).mockReturnValue({
      checkForUpdateAsync: jest.fn(async () => ({ available: true, availableVersionCode: -1 })),
    });
    await expect(checkForPlayUpdate()).resolves.toBeNull();

    jest.mocked(requireOptionalNativeModule).mockReturnValue({
      checkForUpdateAsync: jest.fn(async () => {
        throw new Error("IPC error");
      }),
    });
    await expect(checkForPlayUpdate()).resolves.toBeNull();
  });

  it("opens market:// and falls back to the HTTPS Play listing when unavailable", async () => {
    const openURL = jest.spyOn(Linking, "openURL").mockResolvedValueOnce(true);
    await openPlayListing();
    expect(openURL).toHaveBeenCalledWith(`market://details?id=${PLAY_PACKAGE}`);

    openURL.mockRejectedValueOnce(new Error("no play app")).mockResolvedValueOnce(true);
    await openPlayListing();
    expect(openURL).toHaveBeenLastCalledWith(
      `https://play.google.com/store/apps/details?id=${PLAY_PACKAGE}`,
    );
  });

  it("persists and parses the dismissed Play versionCode safely", async () => {
    await expect(readDismissedPlayUpdateVersion()).resolves.toBeNull();

    await saveDismissedPlayUpdateVersion(20370);
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(DISMISSED_PLAY_UPDATE_KEY, "20370");
    await expect(readDismissedPlayUpdateVersion()).resolves.toBe(20370);

    mockStorage.set(DISMISSED_PLAY_UPDATE_KEY, "not-a-number");
    await expect(readDismissedPlayUpdateVersion()).resolves.toBeNull();
  });

  it("prompts only for versions newer than both persistent and session dismissals", () => {
    expect(
      shouldPromptForPlayUpdate({
        availableVersionCode: 20370,
        dismissedVersionCode: null,
        sessionDismissedVersion: null,
      }),
    ).toBe(true);

    expect(
      shouldPromptForPlayUpdate({
        availableVersionCode: 20370,
        dismissedVersionCode: 20370,
        sessionDismissedVersion: null,
      }),
    ).toBe(false);

    expect(
      shouldPromptForPlayUpdate({
        availableVersionCode: 20370,
        dismissedVersionCode: null,
        sessionDismissedVersion: 20370,
      }),
    ).toBe(false);

    expect(
      shouldPromptForPlayUpdate({
        availableVersionCode: 20371,
        dismissedVersionCode: 20370,
        sessionDismissedVersion: 20370,
      }),
    ).toBe(true);
  });

  it("throttles repeated foreground checks inside the cooldown window", () => {
    expect(shouldRunPlayUpdateCheck({ lastCheckedAt: 0, now: 1_000 })).toBe(true);
    expect(
      shouldRunPlayUpdateCheck({
        lastCheckedAt: 1_000,
        now: 1_000 + PLAY_UPDATE_CHECK_COOLDOWN_MS - 1,
      }),
    ).toBe(false);
    expect(
      shouldRunPlayUpdateCheck({
        lastCheckedAt: 1_000,
        now: 1_000 + PLAY_UPDATE_CHECK_COOLDOWN_MS,
      }),
    ).toBe(true);
  });
});
