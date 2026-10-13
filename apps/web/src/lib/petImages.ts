import type { PetSpecies, PetStage } from "@zoption/shared";

/** The Grok-drawn picture for a pet (prompts in docs/pet.md), or the tombstone once it died. */
export function petImageUrl(species: PetSpecies | null, stage: PetStage): string {
  return species === null ? "/pet/tombstone.webp" : `/pet/${species}-${stage}.webp`;
}
