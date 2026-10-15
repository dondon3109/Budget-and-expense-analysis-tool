import { describe, expect, it } from "vitest";

import {
  PET_COMBO_COOLDOWN_MS,
  PET_TAP_HISTORY_START,
  petSoundCue,
  petTapReaction,
  type PetReaction,
  type PetTapHistory,
} from "../src/petReaction";

/** Taps a healthy pet at each time and returns every reaction. */
function tapAt(times: number[], start: PetTapHistory = PET_TAP_HISTORY_START): PetReaction[] {
  let history = start;
  return times.map((now) => {
    const result = petTapReaction("cute", history, now);
    history = result.history;
    return result.reaction;
  });
}

describe("petTapReaction", () => {
  it("dances on the fifth quick tap", () => {
    expect(tapAt([0, 300, 600, 900, 1200])).toEqual(["happy", "happy", "happy", "happy", "combo"]);
  });

  it("does not dance when the taps are spread out", () => {
    expect(tapAt([0, 600, 1200, 1800, 2400, 3000])).not.toContain("combo");
  });

  it("waits out the cooldown before dancing again", () => {
    const times = Array.from({ length: 21 }, (_, index) => index * 200);
    const reactions = tapAt(times);
    const danceTimes = times.filter((_, index) => reactions[index] === "combo");
    expect(danceTimes).toEqual([800, 800 + PET_COMBO_COOLDOWN_MS]);
  });

  it("never lets a sick or fading pet dance", () => {
    let history = PET_TAP_HISTORY_START;
    for (const now of [0, 100, 200, 300, 400]) {
      const result = petTapReaction("sick", history, now);
      expect(result.reaction).toBe("sick");
      history = result.history;
    }
    expect(petTapReaction("fading", history, 500).reaction).toBe("fading");
  });
});

describe("petSoundCue", () => {
  it("pitches a baby above a legend", () => {
    expect(petSoundCue("baby", "happy").rate).toBeGreaterThan(petSoundCue("legend", "happy").rate);
  });

  it("uses the sad voice, quieter, for an unwell pet", () => {
    expect(petSoundCue("adult", "sick")).toMatchObject({ voice: "sad", sparkle: false });
    expect(petSoundCue("adult", "fading").volume).toBeLessThan(petSoundCue("adult", "sick").volume);
  });

  it("adds the sparkle only to a dance", () => {
    expect(petSoundCue("adult", "combo").sparkle).toBe(true);
    expect(petSoundCue("adult", "happy").sparkle).toBe(false);
  });
});
