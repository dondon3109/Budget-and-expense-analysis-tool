import type {
  PetColor,
  PetFigureHealth,
  PetHatchedStage,
  PetReaction,
  PetSpecies,
} from "@zoption/shared";
import { lazy, Suspense } from "react";

import { PetFigure } from "./PetFigure";
import { canDraw3D } from "./pet3d/canDraw3D";

// PROTOTYPE: a healthy Baby pig draws as a live 3D figure; three.js loads only when it does.
const PetFigure3D = lazy(() => import("./PetFigure3D"));

/** Whether a pet draws as the 3D figure, which plays tap reactions inside its own scene. */
export function hasFigure3D(species: PetSpecies, stage: PetHatchedStage, health: PetFigureHealth) {
  return species === "pig" && stage === "baby" && health === "healthy" && canDraw3D();
}

/**
 * A hatched pet's figure, wherever it shows (the pet page and the pet pop-up), so a pet never
 * switches look between them: the 3D figure where it exists and the browser can draw it, the SVG
 * figure otherwise. While three.js loads, the space stays empty rather than flashing the SVG.
 */
export function PetModel({
  species,
  stage,
  health,
  color,
  size,
  live = false,
  tap,
  className,
}: {
  species: PetSpecies;
  stage: PetHatchedStage;
  health: PetFigureHealth;
  color: PetColor | null;
  size: number;
  live?: boolean;
  tap?: { reaction: PetReaction; id: number } | null;
  className?: string;
}) {
  if (hasFigure3D(species, stage, health))
    return (
      <Suspense fallback={<span className="pet-figure-3d" style={{ width: size, height: size }} />}>
        <PetFigure3D color={color} size={size} still={!live} tap={tap} className={className} />
      </Suspense>
    );
  return (
    <PetFigure
      species={species}
      stage={stage}
      health={health}
      color={color}
      size={size}
      live={live}
      className={className}
    />
  );
}
