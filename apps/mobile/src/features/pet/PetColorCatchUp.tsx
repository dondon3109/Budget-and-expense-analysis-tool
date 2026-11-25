import {
  eggArt,
  petColorLabels,
  type PetColor,
  type PetSpecies,
  type PetView,
} from "@zoption/shared";
import { Text } from "react-native";

import { Button, Card } from "@/ui/components";
import { useZoptionTheme } from "@/ui/theme-provider";
import { spacing, typography } from "@/ui/tokens";

import { EggSprite } from "./EggSprite";
import { PetColorPicker } from "./PetColorPicker";
import { PetFigureView } from "./PetFigureView";

interface PetColorCatchUpProps {
  pet: PetView & { species: PetSpecies };
  name: string;
  busy: boolean;
  error?: string | null;
  onPick: (color: PetColor) => void;
}

/**
 * Asks the owner of a pet from before colors existed to pick one, once: each option previews their
 * own pet. "Keep original" saves the original, so the question never comes back.
 */
export function PetColorCatchUp({ pet, name, busy, error, onPick }: PetColorCatchUpProps) {
  const theme = useZoptionTheme();
  return (
    <Card style={{ gap: spacing.sm }}>
      <Text accessibilityRole="header" style={[typography.title, { color: theme.colors.text }]}>
        Pick a color for {name}
      </Text>
      <Text style={[typography.callout, { color: theme.colors.textMuted }]}>
        Pets come in colors now. You can change it any time in Settings.
      </Text>
      <PetColorPicker
        label={`${name}'s color`}
        value={null}
        disabled={busy}
        onChange={onPick}
        preview={(color) =>
          pet.stage === "egg" ? (
            <EggSprite
              art={eggArt(pet.species, 0, 0, color)}
              size={56}
              accessibilityLabel={petColorLabels[color]}
              still
            />
          ) : (
            <PetFigureView
              species={pet.species}
              stage={pet.stage}
              health="healthy"
              color={color}
              size={56}
            />
          )
        }
      />
      <Button variant="secondary" disabled={busy} onPress={() => onPick("original")}>
        Keep original
      </Button>
      {error ? (
        <Text
          accessibilityRole="alert"
          style={[typography.caption, { color: theme.colors.danger }]}
        >
          {error}
        </Text>
      ) : null}
    </Card>
  );
}
