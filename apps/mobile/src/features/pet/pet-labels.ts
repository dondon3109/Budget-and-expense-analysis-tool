import type { PetView } from "@zoption/shared";

export type PetMood = "egg" | "cute" | "sick" | "fading";

/** How the pet moves. */
export function petMood(view: PetView): PetMood {
  if (view.stage === "egg") return "egg";
  if (view.healthState === "fading") return "fading";
  if (view.healthState === "sick") return "sick";
  return "cute";
}
