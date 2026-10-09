import { playSound, warmUpSounds, withTapSound } from "./sound-effects";
import { useSoundEffectsStore } from "@/stores/sound-effects-store";

const mockPlay = jest.fn();
const mockSeekTo = jest.fn();
const mockCreateAudioPlayer = jest.fn((_source: unknown) => ({
  play: mockPlay,
  seekTo: mockSeekTo,
}));

const mockSetAudioMode = jest.fn(async (_mode: unknown) => undefined);

jest.mock("expo-audio", () => ({
  createAudioPlayer: (source: unknown) => mockCreateAudioPlayer(source),
  setAudioModeAsync: (mode: unknown) => mockSetAudioMode(mode),
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

  it("rewinds and plays a reused player", () => {
    playSound("tap");
    playSound("tap");
    expect(mockCreateAudioPlayer).toHaveBeenCalledTimes(1);
    expect(mockSeekTo).toHaveBeenCalledWith(0);
    expect(mockPlay).toHaveBeenCalledTimes(2);
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

  it("stays silent when sounds are off", () => {
    useSoundEffectsStore.setState({ enabled: false });
    playSound("success");
    expect(mockPlay).not.toHaveBeenCalled();
  });

  it("never throws when playback fails", () => {
    mockPlay.mockImplementationOnce(() => {
      throw new Error("no audio");
    });
    expect(() => playSound("error")).not.toThrow();
  });

  it("builds every player at warm-up so the first tap only plays", () => {
    warmUpSounds();
    expect(mockCreateAudioPlayer).toHaveBeenCalledTimes(3);
    mockPlay.mockClear();
    playSound("success");
    expect(mockCreateAudioPlayer).toHaveBeenCalledTimes(3);
    expect(mockPlay).toHaveBeenCalledTimes(1);
  });

  it("plays the tap before the wrapped handler, and wraps nothing for a missing one", () => {
    const order: string[] = [];
    mockPlay.mockImplementationOnce(() => order.push("sound"));
    withTapSound(() => order.push("handler"))?.();
    expect(order).toEqual(["sound", "handler"]);
    expect(withTapSound(undefined)).toBeUndefined();
  });
});
