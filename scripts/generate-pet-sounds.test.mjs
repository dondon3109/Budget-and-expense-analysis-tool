import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { petSpecies, petStages } from "../packages/shared/src/pet.ts";
import { describe, expect, it } from "vitest";

import {
  SAMPLE_RATE,
  buildMobileAssetMap,
  encodeWav,
  measureLoudness,
  petClips,
} from "./generate-pet-sounds.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const HATCHED_STAGES = petStages.filter((stage) => stage !== "egg");

describe("generate-pet-sounds", () => {
  const clips = petClips();

  it("gives every species and hatched stage its own happy and sad clip, plus the sparkle", () => {
    const expected = petSpecies.flatMap((species) =>
      HATCHED_STAGES.flatMap((stage) => [`${species}-${stage}-happy`, `${species}-${stage}-sad`]),
    );
    expect(Object.keys(clips).sort()).toEqual([...expected, "sparkle"].sort());
  });

  it("keeps every clip short, loudness-balanced, and below clipping", () => {
    const levels = [];
    for (const samples of Object.values(clips)) {
      let top = 0;
      for (let i = 0; i < samples.length; i += 1) {
        const abs = Math.abs(samples[i]);
        if (abs > top) top = abs;
      }
      expect(samples.length / SAMPLE_RATE).toBeLessThan(0.8);
      expect(top).toBeGreaterThan(0.15);
      expect(top).toBeLessThanOrEqual(0.75);
      const { aDba, phoneDb } = measureLoudness(samples);
      expect(aDba).toBeGreaterThan(-20);
      expect(aDba).toBeLessThan(-15.5);
      expect(phoneDb).toBeGreaterThan(-22);
      levels.push(aDba);
    }
    expect(Math.max(...levels) - Math.min(...levels)).toBeLessThan(2.5);
  });

  it("keeps the committed mobile and web WAVs and mobile asset map in sync with the generator", () => {
    const expectedFiles = Object.keys(clips)
      .map((name) => `${name}.wav`)
      .sort();

    for (const dir of ["apps/mobile/assets/sounds/pet", "apps/web/public/pet/sounds"]) {
      const absDir = join(REPO_ROOT, dir);
      const actualFiles = readdirSync(absDir)
        .filter((file) => file.endsWith(".wav"))
        .sort();
      expect(actualFiles).toEqual(expectedFiles);
      for (const [name, samples] of Object.entries(clips)) {
        expect(readFileSync(join(absDir, `${name}.wav`)).equals(encodeWav(samples))).toBe(true);
      }
    }

    const assetMap = readFileSync(
      join(REPO_ROOT, "apps/mobile/src/features/pet/pet-sound-assets.ts"),
      "utf8",
    );
    expect(assetMap).toBe(buildMobileAssetMap(Object.keys(clips)));
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
