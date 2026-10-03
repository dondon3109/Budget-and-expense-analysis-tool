import { petSpecies, type PetSpecies } from "@zoption/shared";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Button } from "@/ui/components";
import { useZoptionTheme } from "@/ui/theme-provider";
import { radii, spacing, typography } from "@/ui/tokens";

import { eggArt } from "./art";
import { petSpeciesLabels } from "./pet-labels";
import { PetSprite } from "./PetSprite";

interface EggPickerProps {
  busy: boolean;
  onChoose: (species: PetSpecies) => void;
}

/** Six eggs to pick from; each hatches into its species after seven days in a row. */
export function EggPicker({ busy, onChoose }: EggPickerProps) {
  const theme = useZoptionTheme();
  const [picked, setPicked] = useState<PetSpecies | null>(null);

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
              onPress={() => setPicked(species)}
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
      <Button disabled={!picked} loading={busy} onPress={() => picked && onChoose(picked)}>
        {picked ? `Choose the ${petSpeciesLabels[picked]} egg` : "Pick an egg"}
      </Button>
    </View>
  );
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
