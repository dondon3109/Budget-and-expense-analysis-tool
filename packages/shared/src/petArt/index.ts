import type { PetView } from "../schemas/pet";

import type { PetFigureHealth } from "./figures";

export type { PetArt, PetGradient, PetGradientStop, PetLayer, PetShape } from "./shapes";
export { petColorSwatch, tintPetHex } from "./colors";
export { eggArt, hatchShineLayer } from "./eggs";
export { petFigureArt, tombstoneArt, type PetFigure, type PetFigureHealth } from "./figures";

export type PetMood = "egg" | "cute" | "sick" | "fading";

/**
 * How the pet looks and moves: an egg sways; a hatched pet bounces and blinks when cute, shivers
 * when sick, or barely breathes when fading.
 */
export function petMood(view: PetView): PetMood {
  if (view.stage === "egg") return "egg";
  if (view.healthState === "fading") return "fading";
  if (view.healthState === "sick") return "sick";
  return "cute";
}

/** The look of a hatched pet's figure for its health. */
export function petFigureHealth(view: PetView): PetFigureHealth {
  if (view.healthState === "fading") return "fading";
  if (view.healthState === "sick") return "sick";
  return "healthy";
}
