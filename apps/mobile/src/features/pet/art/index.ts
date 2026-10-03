import type { PetSpecies, PetStage } from "@zoption/shared";

import { adultArt } from "./adults";
import { babyArt } from "./babies";
import { eggArt } from "./eggs";
import { juvenileArt } from "./juveniles";
import { monsterArt } from "./monsters";
import type { PetArt } from "./shapes";

export type { PetArt, PetLayer, PetPart, PetShape } from "./shapes";
export { eggArt } from "./eggs";

const hatched = { baby: babyArt, juvenile: juvenileArt, adult: adultArt, monster: monsterArt };

/** The drawing for a species at a stage; an egg shows its crack for `eggDays`. */
export function petArt(species: PetSpecies, stage: PetStage, eggDays = 0): PetArt {
  if (stage === "egg") return eggArt(species, eggDays);
  return hatched[stage][species];
}
