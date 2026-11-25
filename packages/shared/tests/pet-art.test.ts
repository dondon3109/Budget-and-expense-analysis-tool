import { describe, expect, it } from "vitest";

import { petSpecies, type PetColor } from "../src/pet";
import { petFigureHealth, petMood } from "../src/petArt";
import { tintPetHex } from "../src/petArt/colors";
import { eggArt, eggCracks } from "../src/petArt/eggs";
import { petFigureArt, tombstoneArt } from "../src/petArt/figures";
import type { PetLayer } from "../src/petArt/shapes";
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

describe("pet figures", () => {
  const stages = ["baby", "juvenile", "adult", "legend"] as const;
  const fills = (layers: PetLayer[]) =>
    layers
      .flatMap((layer) => layer.shapes)
      .flatMap((shape) =>
        typeof shape.fill === "object"
          ? shape.fill.stops.map((stop) => stop.color)
          : shape.fill
            ? [shape.fill]
            : [],
      );

  it("draws every species and stage, with a blink only when healthy", () => {
    for (const species of petSpecies)
      for (const stage of stages) {
        const healthy = petFigureArt(species, stage, "healthy", null);
        expect(healthy.body.flatMap((layer) => layer.shapes).length).toBeGreaterThan(8);
        expect(healthy.eyes.shapes.length).toBeGreaterThan(0);
        expect(healthy.blink?.shapes.length).toBeGreaterThan(0);
        expect(petFigureArt(species, stage, "sick", null).blink).toBeNull();
        expect(petFigureArt(species, stage, "fading", null).blink).toBeNull();
      }
    expect(tombstoneArt().length).toBeGreaterThan(0);
  });

  it("scales younger stages around the feet", () => {
    expect(petFigureArt("pig", "baby", "healthy", null).body[0]?.transform).toContain(
      "scale(0.82)",
    );
    expect(petFigureArt("pig", "adult", "healthy", null).body[0]?.transform).toBeUndefined();
  });

  it("recolors the body and keeps the rest", () => {
    const original = fills(petFigureArt("penguin", "adult", "healthy", "original").body);
    const pink = fills(petFigureArt("penguin", "adult", "healthy", "pink").body);
    expect(fills(petFigureArt("penguin", "adult", "healthy", null).body)).toEqual(original);
    expect(original).toContain("#313A4C");
    expect(pink).toContain(tintPetHex("#313A4C", "pink"));
    expect(pink).not.toContain("#313A4C");
    // The white belly is drawn the same in every color.
    expect(pink.filter((color) => color === "#FBF8F1")).toHaveLength(
      original.filter((color) => color === "#FBF8F1").length,
    );
  });

  it("only uses six-digit hex colors", () => {
    const art = petFigureArt("hippo", "legend", "sick", "lilac");
    const colors = fills([art.shadow, ...art.body, art.eyes]);
    for (const color of colors) expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });
});

describe("pet colors", () => {
  it("tints only an egg's body fills", () => {
    const fills = (color: PetColor) =>
      eggArt("panda", 0, 0, color)
        .flatMap((layer) => layer.shapes)
        .map((shape) => shape.fill)
        .filter((fill) => typeof fill === "string");
    const pink = fills("pink");
    // The black patches turn pink; the white shell and green bamboo stay as drawn.
    expect(pink).toContain(tintPetHex("#24242C", "pink"));
    expect(pink).not.toContain("#24242C");
    expect(pink).toContain("#FAFAF5");
    expect(pink).toContain("#6CBF45");
    expect(fills("original")).toContain("#24242C");
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
    expect(petFigureHealth(baby)).toBe("healthy");
    expect(petFigureHealth({ ...baby, healthState: "sick" })).toBe("sick");
    expect(petFigureHealth({ ...baby, healthState: "fading" })).toBe("fading");
  });
});
