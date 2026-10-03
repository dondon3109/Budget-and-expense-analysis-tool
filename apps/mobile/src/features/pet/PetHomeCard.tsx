import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

import { usePetStore } from "@/stores/pet-store";
import { Card } from "@/ui/components";
import { useZoptionTheme } from "@/ui/theme-provider";
import { spacing, typography } from "@/ui/tokens";

import { petArt } from "./art";
import { petMood, petSpeciesLabels, petStageLabels, petStatusLine } from "./pet-labels";
import { PetSprite } from "./PetSprite";

/** The pet on Home. Hidden for guests, offline launches, a pet turned off, and before an egg is picked. */
export function PetHomeCard() {
  const theme = useZoptionTheme();
  const pet = usePetStore((state) => state.pet);
  if (!pet || !pet.enabled || (pet.species === null && pet.diedAt === null)) return null;

  const title =
    pet.species === null
      ? "Your pet"
      : `${petSpeciesLabels[pet.species]} · ${petStageLabels[pet.stage]}`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${petStatusLine(pet)}`}
      onPress={() => router.push("/(app)/pet")}
    >
      <Card style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
        {pet.species ? (
          <PetSprite
            art={petArt(pet.species, pet.stage, pet.eggStreakDays)}
            mood={petMood(pet)}
            size={72}
            accessibilityLabel={title}
            still
          />
        ) : (
          <MaterialCommunityIcons name="egg-outline" size={40} color={theme.colors.textMuted} />
        )}
        <View style={{ flex: 1, gap: spacing.xxs }}>
          <Text style={[typography.headline, { color: theme.colors.text }]}>{title}</Text>
          <Text style={[typography.callout, { color: theme.colors.textMuted }]}>
            {petStatusLine(pet)}
          </Text>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={22} color={theme.colors.textMuted} />
      </Card>
    </Pressable>
  );
}
