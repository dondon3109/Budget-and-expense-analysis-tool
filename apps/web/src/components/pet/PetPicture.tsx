import {
  PET_REACTION_MOTION,
  type PetReaction,
  type PetSpecies,
  type PetView,
} from "@zoption/shared";
import { useEffect, useRef } from "react";

import { useReducedMotion } from "../../hooks/useReducedMotion";
import { petLook } from "../../lib/petImages";
import { TintedPicture } from "./TintedPicture";
import "./PetPicture.css";

/**
 * A hatched pet as its Grok picture in its pet color, like the phone app's: a healthy pet breathes
 * and blinks (an eyes-closed copy of the same picture flashes on top), a sick one shows its sick
 * picture and shivers, and a fading one shows its fading picture and barely breathes. Each new
 * `tap` plays that reaction's motion once on top of the idle one, unless motion is reduced.
 */
export function PetPicture({
  pet,
  size,
  className,
  tap,
}: {
  pet: PetView & { species: PetSpecies };
  size: number;
  className?: string;
  tap?: { reaction: PetReaction; id: number } | null;
}) {
  const look = petLook(pet);
  const picture = { species: pet.species, stage: pet.stage, color: pet.color, size };
  const reduceMotion = useReducedMotion();
  const reacting = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const element = reacting.current;
    // jsdom has no Web Animations API.
    if (!tap || reduceMotion || typeof element?.animate !== "function") return;
    const motion = PET_REACTION_MOTION[tap.reaction];
    const frames = motion.at.map((offset, index) => ({
      offset,
      transform: `translateY(${(motion.hop[index] ?? 0) * 100}%) rotate(${motion.tilt[index] ?? 0}deg) scaleY(${1 + (motion.squash[index] ?? 0)})`,
    }));
    const animation = element.animate(frames, { duration: motion.ms, easing: "linear" });
    return () => animation.cancel();
  }, [reduceMotion, tap]);

  return (
    <span
      className={className ? `pet-live ${className}` : "pet-live"}
      data-look={look}
      style={{ width: size, height: size }}
    >
      <span ref={reacting} className="pet-live-react">
        <TintedPicture {...picture} look={look} />
        {look === "healthy" ? (
          <TintedPicture {...picture} look="blink" className="pet-live-blink" />
        ) : null}
      </span>
    </span>
  );
}
