import { petMood, type PetSpecies, type PetStage, type PetView } from "@zoption/shared";

/** Which picture of a hatched pet: its healthy pose, that pose mid-blink, or sick or fading. */
export type PetLook = "healthy" | "blink" | "sick" | "fading";

/** The look that matches how the pet is doing. */
export function petLook(view: PetView): PetLook {
  const mood = petMood(view);
  return mood === "sick" || mood === "fading" ? mood : "healthy";
}

/** The name of a pet's picture (`hedgehog-baby-sick`), shared by its file and its body mask. */
export function petPictureName(species: PetSpecies, stage: PetStage, look: PetLook = "healthy") {
  if (stage === "egg" || look === "healthy") return `${species}-${stage}`;
  return `${species}-${stage}-${look}`;
}

/** The Grok-drawn picture for a pet (prompts in docs/pet.md), or the tombstone once it died. */
export function petImageUrl(
  species: PetSpecies | null,
  stage: PetStage,
  look: PetLook = "healthy",
): string {
  if (species === null) return "/pet/tombstone.webp";
  return `/pet/${petPictureName(species, stage, look)}.webp`;
}

/** The body mask a pet color tints through (scripts/generate-pet-masks.mjs). */
export function petMaskUrl(species: PetSpecies, stage: PetStage, look: PetLook = "healthy") {
  return `/pet/masks/${petPictureName(species, stage, look)}.webp`;
}
