import { router } from "expo-router";
import { Image, Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { petMomentCopy, petMood } from "@zoption/shared";

import { withTapSound } from "@/features/sounds/sound-effects";
import { Button } from "@/ui/components";
import { useZoptionTheme } from "@/ui/theme-provider";
import { elevation, radii, spacing, typography } from "@/ui/tokens";

import { petImage } from "./pet-images";
import { TintedPetImage } from "./TintedPetImage";
import { usePetMoment } from "./use-pet-moment";

/** The pet pop-up on Home: the pet's picture and how it is doing, at most once per open. */
export function PetMomentModal() {
  const theme = useZoptionTheme();
  const { shown, close } = usePetMoment();
  if (!shown) return null;

  const { pet } = shown;
  const copy = petMomentCopy(shown.moment, pet);
  const mood = petMood(pet);
  const look = mood === "sick" || mood === "fading" ? mood : "healthy";
  const open = () => {
    close();
    router.push("/(app)/pet");
  };
  return (
    <Modal
      animationType="fade"
      navigationBarTranslucent
      statusBarTranslucent
      transparent
      visible
      onRequestClose={close}
    >
      <View style={[styles.layer, { backgroundColor: theme.colors.overlay }]}>
        <Pressable
          accessibilityLabel="Close"
          style={StyleSheet.absoluteFill}
          onPress={withTapSound(close)}
        />
        <View
          accessibilityRole="alert"
          style={[
            styles.dialog,
            elevation.dialog,
            { backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.border },
          ]}
        >
          {pet.species === null ? (
            <Image
              accessibilityIgnoresInvertColors
              source={petImage(null, pet.stage)}
              style={styles.picture}
            />
          ) : (
            <TintedPetImage
              species={pet.species}
              stage={pet.stage}
              look={look}
              color={pet.color}
              size={200}
            />
          )}
          <Text
            accessibilityRole="header"
            style={[typography.title, styles.center, { color: theme.colors.text }]}
          >
            {copy.title}
          </Text>
          <Text style={[typography.body, styles.center, { color: theme.colors.textMuted }]}>
            {copy.body}
          </Text>
          <View style={{ alignSelf: "stretch", gap: spacing.xs }}>
            <Button onPress={open}>
              {pet.species === null ? "Choose a new egg" : "See my pet"}
            </Button>
            <Button variant="quiet" onPress={close}>
              Close
            </Button>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  layer: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.lg },
  dialog: {
    width: "100%",
    maxWidth: 400,
    alignItems: "center",
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  picture: { width: 200, height: 200 },
  center: { textAlign: "center" },
});
