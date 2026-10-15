import { describe, expect, it } from "vitest";

import { SAMPLE_RATE, encodeWav, petClips } from "./generate-pet-sounds.mjs";

const SPECIES = ["hedgehog", "pig", "hamster", "penguin", "panda", "hippo"];

describe("generate-pet-sounds", () => {
  const clips = petClips();

  it("gives every species its own happy and sad clip, plus the sparkle", () => {
    const expected = SPECIES.flatMap((species) => [`${species}-happy`, `${species}-sad`]);
    expect(Object.keys(clips).sort()).toEqual([...expected, "sparkle"].sort());
  });

  it("keeps every clip short, audible, and below clipping", () => {
    for (const samples of Object.values(clips)) {
      const top = Math.max(...samples.map(Math.abs));
      expect(samples.length / SAMPLE_RATE).toBeLessThan(1);
      expect(top).toBeGreaterThan(0.1);
      expect(top).toBeLessThanOrEqual(0.9);
    }
  });

  it("writes a 16-bit mono PCM WAV header", () => {
    const wav = encodeWav(new Float64Array([0, 0.5, -0.5]));
    expect(wav.toString("ascii", 0, 4)).toBe("RIFF");
    expect(wav.toString("ascii", 8, 12)).toBe("WAVE");
    expect(wav.readUInt16LE(22)).toBe(1);
    expect(wav.readUInt32LE(24)).toBe(SAMPLE_RATE);
    expect(wav.readUInt16LE(34)).toBe(16);
    expect(wav.readUInt32LE(40)).toBe(6);
  });
});
