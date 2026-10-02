import { playSound } from "./sound-effects";
import { useSoundEffectsStore } from "@/stores/sound-effects-store";

const mockPlay = jest.fn();
const mockSeekTo = jest.fn();
const mockCreateAudioPlayer = jest.fn((_source: unknown) => ({
  play: mockPlay,
  seekTo: mockSeekTo,
}));

jest.mock("expo-audio", () => ({
  createAudioPlayer: (source: unknown) => mockCreateAudioPlayer(source),
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
});
