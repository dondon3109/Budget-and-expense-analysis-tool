import { petSpecies } from "@zoption/shared";

import { adultArt } from "./adults";
import { babyArt } from "./babies";
import { eggArt, eggCracks } from "./eggs";
import { juvenileArt } from "./juveniles";
import { monsterArt } from "./monsters";

describe("pet art", () => {
  it("draws every hatched stage of every species with eyes that can blink", () => {
    for (const stage of [babyArt, juvenileArt, adultArt, monsterArt]) {
      for (const species of petSpecies) {
        expect(stage[species].some((layer) => layer.part === "eyes")).toBe(true);
      }
    }
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
  });
});
