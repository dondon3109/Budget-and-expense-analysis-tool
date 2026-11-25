import { describe, expect, it } from "vitest";

import {
  PET_COMBO_COOLDOWN_MS,
  PET_TAP_HISTORY_START,
  petHatchSoundCue,
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
  it("picks each stage's own clip instead of relying on large speed shifts", () => {
    const baby = petSoundCue("hippo", "baby", "happy");
    const adult = petSoundCue("hippo", "adult", "happy");
    const legend = petSoundCue("hippo", "legend", "happy");
    expect(baby.clip).toBe("hippo-baby-happy");
    expect(adult.clip).toBe("hippo-adult-happy");
    expect(legend.clip).toBe("hippo-legend-happy");
    expect(baby.rate).toBe(1);
    expect(adult.rate).toBe(1);
    expect(legend.rate).toBe(1);
  });

  it("uses the stage's sad clip, quieter and slightly slower when fading", () => {
    const sick = petSoundCue("panda", "adult", "sick");
    const fading = petSoundCue("panda", "adult", "fading");
    expect(sick).toMatchObject({ clip: "panda-adult-sad", voice: "sad", sparkle: null });
    expect(fading.clip).toBe("panda-adult-sad");
    expect(fading.volume).toBeLessThan(sick.volume);
    expect(fading.rate).toBeLessThan(sick.rate);
  });

  it("staggers a slightly quieter sparkle onto a combo dance", () => {
    const combo = petSoundCue("pig", "juvenile", "combo");
    expect(combo.clip).toBe("pig-juvenile-happy");
    expect(combo.rate).toBeGreaterThan(1);
    expect(combo.sparkle).not.toBeNull();
    expect(combo.sparkle?.delayMs).toBeGreaterThan(0);
    expect(combo.sparkle?.volume).toBeLessThan(1);
    expect(petSoundCue("pig", "juvenile", "happy").sparkle).toBeNull();
  });

  it("leads a hatch with sparkle before the baby's happy voice", () => {
    const hatch = petHatchSoundCue("hedgehog");
    expect(hatch.voiceClip).toBe("hedgehog-baby-happy");
    expect(hatch.voiceDelayMs).toBeGreaterThan(0);
    expect(hatch.sparkleVolume).toBeLessThan(1);
  });
});
