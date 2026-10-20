import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

import { playSound, warmUpSounds, withTapSound } from "./sound-effects";
import { useSoundEffectsStore } from "@/stores/sound-effects-store";

const mockPlay = jest.fn();
const mockSeekTo = jest.fn();
const mockCreateAudioPlayer = jest.fn((_source: unknown) => ({
  play: mockPlay,
  seekTo: mockSeekTo,
}));

const flush = () => new Promise((resolve) => setImmediate(resolve));

const mockSetAudioMode = jest.fn(async (_mode: unknown) => undefined);

jest.mock("expo-audio", () => ({
  createAudioPlayer: (source: unknown) => mockCreateAudioPlayer(source),
  setAudioModeAsync: (mode: unknown) => mockSetAudioMode(mode),
}));
// Jest gives every asset the same stub; the app gets one id per file.
jest.mock("../../../assets/sounds/tap.wav", () => "tap");
jest.mock("../../../assets/sounds/success.wav", () => "success");
jest.mock("../../../assets/sounds/error.wav", () => "error");
jest.mock("expo-haptics", () => ({
  AndroidHaptics: {
    Clock_Tick: "clock-tick",
    Context_Click: "context-click",
    Confirm: "confirm",
    Reject: "reject",
  },
  ImpactFeedbackStyle: { Light: "light" },
  NotificationFeedbackType: { Success: "success", Warning: "warning" },
  performAndroidHapticsAsync: jest.fn(async () => undefined),
  selectionAsync: jest.fn(async () => undefined),
  impactAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
}));
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

describe("playSound", () => {
  beforeEach(() => {
    mockPlay.mockClear();
    mockSeekTo.mockClear();
    useSoundEffectsStore.setState({ enabled: true });
  });

  it("rewinds before it plays a reused player, so every tap sounds", async () => {
    const order: string[] = [];
    mockSeekTo.mockImplementation(async () => {
      await Promise.resolve();
      order.push("seek");
    });
    mockPlay.mockImplementation(() => order.push("play"));
    playSound("tap");
    await flush();
    playSound("tap");
    await flush();
    expect(mockCreateAudioPlayer).toHaveBeenCalledTimes(1);
    expect(order).toEqual(["seek", "play", "seek", "play"]);
    mockSeekTo.mockReset();
    mockPlay.mockReset();
  });

  it("plays in silent mode, set once", () => {
    playSound("tap");
    playSound("success");
    expect(mockSetAudioMode).toHaveBeenCalledTimes(1);
    expect(mockSetAudioMode).toHaveBeenCalledWith({
      playsInSilentMode: true,
      interruptionMode: "mixWithOthers",
    });
  });

  it("stays silent when sounds are off", async () => {
    useSoundEffectsStore.setState({ enabled: false });
    playSound("success");
    await flush();
    expect(mockPlay).not.toHaveBeenCalled();
  });

  it("still buzzes with the native key click when sounds are off", () => {
    jest.replaceProperty(Platform, "OS", "android");
    useSoundEffectsStore.setState({ enabled: false });
    playSound("success");
    expect(Haptics.performAndroidHapticsAsync).toHaveBeenCalledWith("confirm");
  });

  it("grades the Android buzz by action, lightest for a selection", () => {
    jest.replaceProperty(Platform, "OS", "android");
    playSound("select");
    playSound("tap");
    playSound("error");
    expect(jest.mocked(Haptics.performAndroidHapticsAsync).mock.calls.slice(-3)).toEqual([
      ["clock-tick"],
      ["context-click"],
      ["reject"],
    ]);
  });

  it("keeps iOS buzzes subtle: selection tick, light tap, warning for an error", () => {
    jest.replaceProperty(Platform, "OS", "ios");
    playSound("select");
    playSound("tap");
    playSound("error");
    expect(Haptics.selectionAsync).toHaveBeenCalled();
    expect(Haptics.impactAsync).toHaveBeenCalledWith("light");
    expect(Haptics.notificationAsync).toHaveBeenCalledWith("warning");
  });

  it("never throws when playback fails", async () => {
    mockPlay.mockImplementationOnce(() => {
      throw new Error("no audio");
    });
    expect(() => playSound("error")).not.toThrow();
    await flush();
  });

  it("builds every player at warm-up so the first tap only plays", async () => {
    warmUpSounds();
    expect(mockCreateAudioPlayer).toHaveBeenCalledTimes(3);
    mockPlay.mockClear();
    playSound("success");
    await flush();
    expect(mockCreateAudioPlayer).toHaveBeenCalledTimes(3);
    expect(mockPlay).toHaveBeenCalledTimes(1);
  });

  it("runs the wrapped handler at once, and wraps nothing for a missing one", () => {
    const handler = jest.fn();
    jest.replaceProperty(Platform, "OS", "android");
    withTapSound(handler, "select")?.();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(Haptics.performAndroidHapticsAsync).toHaveBeenLastCalledWith("clock-tick");
    expect(withTapSound(undefined)).toBeUndefined();
  });
});
