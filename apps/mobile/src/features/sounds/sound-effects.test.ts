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
    withTapSound(handler)?.();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(withTapSound(undefined)).toBeUndefined();
  });
});
