import { describe, expect, it } from "vitest";

import { petSpecies } from "../src/pet";
import { petMood } from "../src/petArt";
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

describe("petMood", () => {
  const baby = {
    enabled: true,
    species: "panda",
    name: "Bao",
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
