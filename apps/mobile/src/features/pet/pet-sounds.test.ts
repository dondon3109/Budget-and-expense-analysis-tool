import { playClip, playHaptic, warmUpClips } from "@/features/sounds/sound-effects";
import { playPetHatch, playPetReaction, warmUpPetVoices } from "./pet-sounds";

jest.mock("@/features/sounds/sound-effects", () => ({
  playClip: jest.fn(),
  playHaptic: jest.fn(),
  warmUpClips: jest.fn(),
}));

jest.mock("./pet-sound-assets", () => ({
  petVoiceAssets: new Proxy(
    {},
    {
      get: (_target, prop) => String(prop),
    },
  ),
  sparkleAsset: "sparkle",
}));

const played = () => jest.mocked(playClip).mock.calls.map(([source]) => source as unknown);

describe("pet-sounds", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("warms up only the current stage's happy, sad, and sparkle clips", () => {
    warmUpPetVoices("hippo", "adult");
    expect(warmUpClips).toHaveBeenCalledWith(["hippo-adult-happy", "hippo-adult-sad", "sparkle"]);
  });

  it("plays each species and stage's own voice", () => {
    playPetReaction("hippo", "baby", "happy");
    playPetReaction("hippo", "adult", "happy");
    playPetReaction("pig", "legend", "happy");
    expect(played()).toEqual(["hippo-baby-happy", "hippo-adult-happy", "pig-legend-happy"]);
    expect(jest.mocked(playHaptic).mock.calls).toEqual([["tap"], ["tap"], ["tap"]]);
  });

  it("uses the stage's sad voice for an unwell pet", () => {
    playPetReaction("hippo", "adult", "fading");
    expect(played()).toEqual(["hippo-adult-sad"]);
  });

  it("staggers the sparkle and plays a success buzz on a dance", () => {
    playPetReaction("hippo", "adult", "combo");
    expect(played()).toEqual(["hippo-adult-happy"]);
    expect(jest.mocked(playHaptic).mock.calls).toEqual([["success"]]);

    jest.advanceTimersByTime(90);
    expect(played()).toEqual(["hippo-adult-happy", "sparkle"]);
  });

  it("celebrates an egg hatch with sparkle, delayed baby voice, and success buzz", () => {
    playPetHatch("hippo");
    expect(played()).toEqual(["sparkle"]);
    expect(jest.mocked(playHaptic).mock.calls).toEqual([["success"]]);

    jest.advanceTimersByTime(160);
    expect(played()).toEqual(["sparkle", "hippo-baby-happy"]);
  });
});
