import type { PetSpecies, PetStage } from "../pet";
import type { PetView } from "../schemas/pet";

import { adultArt } from "./adults";
import { babyArt } from "./babies";
import { eggArt } from "./eggs";
import { juvenileArt } from "./juveniles";
import { legendArt } from "./legends";
import type { PetArt } from "./shapes";

export type { PetArt, PetLayer, PetPart, PetShape } from "./shapes";
export { eggArt } from "./eggs";

const hatched = { baby: babyArt, juvenile: juvenileArt, adult: adultArt, legend: legendArt };

/** The drawing for a species at a stage; an egg shows its crack for `eggDays` and `taps` to hatch. */
export function petArt(species: PetSpecies, stage: PetStage, eggDays = 0, taps = 0): PetArt {
  if (stage === "egg") return eggArt(species, eggDays, taps);
  return hatched[stage][species];
}

export type PetMood = "egg" | "cute" | "sick" | "fading";

/** How the pet moves: an egg sways, a healthy pet bobs, a sick one shivers, a fading one flickers. */
export function petMood(view: PetView): PetMood {
  if (view.stage === "egg") return "egg";
  if (view.healthState === "fading") return "fading";
  if (view.healthState === "sick") return "sick";
  return "cute";
}
