import {
  petFigureArt,
  type PetColor,
  type PetFigureHealth,
  type PetHatchedStage,
  type PetSpecies,
} from "@zoption/shared";
import { useId } from "react";
import { View } from "react-native";

import { PetArtSvg } from "./PetArtSvg";

interface PetFigureViewProps {
  species: PetSpecies;
  stage: PetHatchedStage;
  health: PetFigureHealth;
  color: PetColor | null;
  size: number;
}

/**
 * A hatched pet's soft vinyl figure in its pet color, standing still: for the pop-up and the color
 * previews. The pet page animates the same parts in `PetPicture`.
 */
export function PetFigureView({ species, stage, health, color, size }: PetFigureViewProps) {
  const idBase = useId().replace(/[^a-zA-Z0-9]/g, "");
  const art = petFigureArt(species, stage, health, color);
  return (
    <View accessible={false} importantForAccessibility="no-hide-descendants">
      <PetArtSvg layers={[art.shadow, ...art.body, art.eyes]} size={size} idBase={idBase} />
    </View>
  );
}
