import { petMood, type PetSpecies, type PetStage, type PetView } from "@zoption/shared";

/** Which picture of a hatched pet: its healthy pose, that pose mid-blink, or sick or fading. */
export type PetLook = "healthy" | "blink" | "sick" | "fading";

/** The look that matches how the pet is doing. */
export function petLook(view: PetView): PetLook {
  const mood = petMood(view);
  return mood === "sick" || mood === "fading" ? mood : "healthy";
}

/** The Grok-drawn picture for a pet (prompts in docs/pet.md), or the tombstone once it died. */
export function petImageUrl(
  species: PetSpecies | null,
  stage: PetStage,
  look: PetLook = "healthy",
): string {
  if (species === null) return "/pet/tombstone.webp";
  if (stage === "egg" || look === "healthy") return `/pet/${species}-${stage}.webp`;
  return `/pet/${species}-${stage}-${look}.webp`;
}
