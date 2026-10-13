import type { PetSpecies, PetView } from "@zoption/shared";

import { petImageUrl, petLook } from "../../lib/petImages";
import "./PetPicture.css";

/**
 * A hatched pet as its Grok picture, like the phone app's: a healthy pet breathes and blinks (an
 * eyes-closed copy of the same picture flashes on top), a sick one shows its sick picture and
 * shivers, and a fading one shows its fading picture and barely breathes.
 */
export function PetPicture({
  pet,
  size,
  className,
}: {
  pet: PetView & { species: PetSpecies };
  size: number;
  className?: string;
}) {
  const look = petLook(pet);
  return (
    <span
      className={className ? `pet-live ${className}` : "pet-live"}
      data-look={look}
      style={{ width: size, height: size }}
    >
      <img src={petImageUrl(pet.species, pet.stage, look)} alt="" width={size} height={size} />
      {look === "healthy" ? (
        <img
          className="pet-live-blink"
          src={petImageUrl(pet.species, pet.stage, "blink")}
          alt=""
          width={size}
          height={size}
        />
      ) : null}
    </span>
  );
}
