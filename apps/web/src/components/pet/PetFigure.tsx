import {
  petFigureArt,
  type PetColor,
  type PetFigureHealth,
  type PetHatchedStage,
  type PetSpecies,
} from "@zoption/shared";

import { PetLayers, usePetArtId } from "./PetSvg";
import "./PetFigure.css";

/**
 * A hatched pet as its soft vinyl figure in its pet color, the same drawing as the phone app.
 * `live` animates it (PetFigure.css): a healthy pet bounces with squash and stretch over a shadow
 * that shrinks as it lifts, and blinks; a sick one shivers; a fading one barely breathes.
 */
export function PetFigure({
  species,
  stage,
  health,
  color,
  size,
  live = false,
  className,
}: {
  species: PetSpecies;
  stage: PetHatchedStage;
  health: PetFigureHealth;
  color: PetColor | null;
  size: number;
  live?: boolean;
  className?: string;
}) {
  const idBase = usePetArtId();
  const art = petFigureArt(species, stage, health, color);
  return (
    <svg
      className={className ? `pet-figure ${className}` : "pet-figure"}
      data-health={health}
      data-live={live ? true : undefined}
      viewBox="0 0 200 200"
      width={size}
      height={size}
      aria-hidden="true"
    >
      <g className="pet-figure-shadow">
        <PetLayers layers={[art.shadow]} idBase={`${idBase}s`} />
      </g>
      <g className="pet-figure-body">
        <PetLayers layers={art.body} idBase={`${idBase}b`} />
        <g className="pet-figure-eyes">
          <PetLayers layers={[art.eyes]} idBase={`${idBase}e`} />
        </g>
        {art.blink ? (
          <g className="pet-figure-blink">
            <PetLayers layers={[art.blink]} idBase={`${idBase}k`} />
          </g>
        ) : null}
      </g>
    </svg>
  );
}
