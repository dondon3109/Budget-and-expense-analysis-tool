import type { PetView } from "../schemas/pet";

export type { PetArt, PetLayer, PetShape } from "./shapes";
export { eggArt, hatchShineLayer } from "./eggs";

export type PetMood = "egg" | "cute" | "sick" | "fading";

/**
 * How the pet looks and moves: an egg sways; a hatched pet shows its healthy picture and bobs, its
 * sick picture and shivers, or its fading picture and barely breathes.
 */
export function petMood(view: PetView): PetMood {
  if (view.stage === "egg") return "egg";
  if (view.healthState === "fading") return "fading";
  if (view.healthState === "sick") return "sick";
  return "cute";
}
