import {
  PET_REACTION_MOTION,
  petFigureHealth,
  petMood,
  type PetReaction,
  type PetSpecies,
  type PetView,
} from "@zoption/shared";
import { useEffect, useRef } from "react";

import { useReducedMotion } from "../../hooks/useReducedMotion";
import { PetFigure } from "./PetFigure";
import "./PetPicture.css";

/**
 * A hatched pet as its live vinyl figure in its pet color, like the phone app's: it bounces and
 * blinks when healthy, shivers when sick, and barely breathes when fading (PetFigure.css). Each new
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

  if (pet.stage === "egg") return null;
  return (
    <span
      className={className ? `pet-live ${className}` : "pet-live"}
      data-mood={petMood(pet)}
      style={{ width: size, height: size }}
    >
      <span ref={reacting} className="pet-live-react">
        <PetFigure
          species={pet.species}
          stage={pet.stage}
          health={petFigureHealth(pet)}
          color={pet.color}
          size={size}
          live
        />
      </span>
    </span>
  );
}
