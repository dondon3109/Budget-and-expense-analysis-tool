import { describe, expect, it } from "vitest";

import { petColors, petSpecies } from "../src/pet";
import { petMood } from "../src/petArt";
import { petColorMatrix, tintPetHex } from "../src/petArt/colors";
import { eggArt, eggCracks } from "../src/petArt/eggs";
import type { PetView } from "../src/schemas/pet";

describe("pet art", () => {
  it("draws an egg for every species", () => {
    for (const species of petSpecies) expect(eggArt(species).length).toBeGreaterThan(0);
  });

  it("grows the egg crack each streak day and adds a side crack near hatching", () => {
    expect(eggCracks(0)).toEqual([]);
    const lengthOf = (days: number) => {
      const [main] = eggCracks(days);
      return main?.kind === "path" ? main.d.split("L").length : 0;
    };
    expect(lengthOf(2)).toBeGreaterThan(lengthOf(1));
    expect(eggCracks(4)).toHaveLength(1);
    expect(eggCracks(6)).toHaveLength(2);
    // A ready egg cracks a little more every two taps.
    expect(eggCracks(7, 1)).toHaveLength(3);
    expect(eggCracks(7, 10)).toHaveLength(7);
  });
});

describe("pet colors", () => {
  it("tints an egg's body fills the way the picture matrix tints a pixel", () => {
    const fills = (color: (typeof petColors)[number]) =>
      eggArt("panda", 0, 0, color)
        .flatMap((layer) => layer.shapes)
        .map((shape) => shape.fill);
    const pink = fills("pink");
    // The black patches turn pink; the white shell and green bamboo stay as drawn.
    expect(pink).toContain(tintPetHex("#24242C", "pink"));
    expect(pink).not.toContain("#24242C");
    expect(pink).toContain("#FAFAF5");
    expect(pink).toContain("#6CBF45");
    expect(fills("original")).toContain("#24242C");

    for (const color of petColors) {
      const matrix = petColorMatrix(color);
      if (!matrix) {
        expect(color).toBe("original");
        continue;
      }
      const rgb = [0x24, 0x24, 0x2c].map((value) => value / 255);
      const channel = (row: number) =>
        Math.round(
          Math.min(
            1,
            rgb.reduce(
              (sum, value, index) => sum + value * matrix[row * 5 + index]!,
              matrix[row * 5 + 4]!,
            ),
          ) * 255,
        );
      const hex = `#${[0, 1, 2].map((row) => channel(row).toString(16).padStart(2, "0")).join("")}`;
      expect(hex).toBe(tintPetHex("#24242C", color));
    }
  });
});

describe("petMood", () => {
  const baby = {
    enabled: true,
    species: "panda",
    name: "Bao",
    color: "original",
    stage: "baby",
    points: 120,
    nextStagePoints: 350,
    pointsToday: 30,
    eggStreakDays: 7,
    eggHatchDays: 7,
    health: 100,
    healthState: "healthy",
    lastActivityAt: "2026-10-03T01:00:00.000Z",
    diedAt: null,
  } satisfies PetView;

  it("moves by health, whatever the stage", () => {
    expect(petMood(baby)).toBe("cute");
    expect(petMood({ ...baby, stage: "legend", healthState: "sick" })).toBe("sick");
    expect(petMood({ ...baby, healthState: "fading" })).toBe("fading");
    expect(petMood({ ...baby, stage: "egg", healthState: null })).toBe("egg");
  });
});
