import { petSpecies } from "@zoption/shared";

import { babyArt } from "./babies";
import { eggArt, eggCracks } from "./eggs";

describe("pet art", () => {
  it("draws an egg and a baby with blinking eyes for every species", () => {
    for (const species of petSpecies) {
      expect(eggArt(species).length).toBeGreaterThan(0);
      expect(babyArt[species].some((layer) => layer.part === "eyes")).toBe(true);
    }
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
