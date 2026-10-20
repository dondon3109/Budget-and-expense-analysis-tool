import { playClip, playHaptic } from "@/features/sounds/sound-effects";
import { playPetReaction } from "./pet-sounds";

jest.mock("@/features/sounds/sound-effects", () => ({
  playClip: jest.fn(),
  playHaptic: jest.fn(),
  warmUpClips: jest.fn(),
}));
// Each clip resolves to its file name, so the test can see which one played.
jest.mock("../../../assets/sounds/pet/panda-happy.wav", () => "panda-happy");
jest.mock("../../../assets/sounds/pet/panda-sad.wav", () => "panda-sad");
jest.mock("../../../assets/sounds/pet/pig-happy.wav", () => "pig-happy");
jest.mock("../../../assets/sounds/pet/sparkle.wav", () => "sparkle");

const played = () => jest.mocked(playClip).mock.calls.map(([source]) => source as unknown);

describe("playPetReaction", () => {
  beforeEach(() => jest.clearAllMocks());

  it("plays the pet's own species voice", () => {
    playPetReaction("panda", "baby", "happy");
    playPetReaction("pig", "baby", "happy");
    expect(played()).toEqual(["panda-happy", "pig-happy"]);
    expect(jest.mocked(playHaptic).mock.calls).toEqual([["tap"], ["tap"]]);
  });

  it("uses the sad voice for an unwell pet", () => {
    playPetReaction("panda", "adult", "fading");
    expect(played()).toEqual(["panda-sad"]);
  });

  it("adds the sparkle and a success buzz to a dance", () => {
    playPetReaction("panda", "adult", "combo");
    expect(played()).toEqual(["panda-happy", "sparkle"]);
    expect(jest.mocked(playHaptic).mock.calls).toEqual([["success"]]);
  });
});
