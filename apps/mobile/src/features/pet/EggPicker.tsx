import {
  eggArt,
  PET_NAME_MAX_LENGTH,
  petSpecies,
  petSpeciesLabels,
  type PetSpecies,
} from "@zoption/shared";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Button, FormField } from "@/ui/components";
import { useZoptionTheme } from "@/ui/theme-provider";
import { radii, spacing, typography } from "@/ui/tokens";

import { PetSprite } from "./PetSprite";
import { withTapSound } from "@/features/sounds/sound-effects";

interface EggPickerProps {
  busy: boolean;
  onChoose: (species: PetSpecies, name: string) => void;
}

/** Six eggs to pick from, each hatching into its species, and the name the pet goes by. */
export function EggPicker({ busy, onChoose }: EggPickerProps) {
  const theme = useZoptionTheme();
  const [picked, setPicked] = useState<PetSpecies | null>(null);
  const [name, setName] = useState("");
  const trimmed = name.trim();

  return (
    <View style={{ gap: spacing.md }}>
      <View accessibilityRole="radiogroup" style={styles.grid}>
        {petSpecies.map((species) => {
          const selected = picked === species;
          return (
            <Pressable
              key={species}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={`${petSpeciesLabels[species]} egg`}
              onPress={withTapSound(() => setPicked(species))}
              style={[
                styles.option,
                {
                  borderColor: selected ? theme.colors.brand : theme.colors.border,
                  backgroundColor: selected ? theme.colors.brandSoft : theme.colors.surfaceRaised,
                },
              ]}
            >
              <PetSprite
                art={eggArt(species)}
                mood="egg"
                size={84}
                accessibilityLabel={`${petSpeciesLabels[species]} egg`}
                still={!selected}
              />
              <Text style={[typography.label, { color: theme.colors.text }]}>
                {petSpeciesLabels[species]}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <FormField
        label="Name your pet"
        value={name}
        onChangeText={setName}
        placeholder={picked ? petSpeciesLabels[picked] : "Pingu"}
        maxLength={PET_NAME_MAX_LENGTH}
        autoCapitalize="words"
        returnKeyType="done"
      />
      <Button
        disabled={!picked || !trimmed}
        loading={busy}
        onPress={() => picked && trimmed && onChoose(picked, trimmed)}
      >
        {eggButtonLabel(picked, trimmed)}
      </Button>
    </View>
  );
}

function eggButtonLabel(picked: PetSpecies | null, name: string): string {
  if (!picked) return "Pick an egg";
  if (!name) return "Give it a name";
  return `Choose the ${petSpeciesLabels[picked]} egg`;
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: spacing.sm,
  },
  option: {
    width: "31.5%",
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderWidth: 2,
    borderRadius: radii.lg,
    gap: spacing.xxs,
  },
});
