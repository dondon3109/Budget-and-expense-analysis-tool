import { router } from "expo-router";
import { Image, Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { petMomentCopy } from "@zoption/shared";

import { withTapSound } from "@/features/sounds/sound-effects";
import { Button } from "@/ui/components";
import { useZoptionTheme } from "@/ui/theme-provider";
import { elevation, radii, spacing, typography } from "@/ui/tokens";

import { petImage } from "./pet-images";
import { usePetMoment } from "./use-pet-moment";

/** The pet pop-up on Home: the pet's picture and how it is doing, at most once per open. */
export function PetMomentModal() {
  const theme = useZoptionTheme();
  const { shown, close } = usePetMoment();
  if (!shown) return null;

  const { pet } = shown;
  const copy = petMomentCopy(shown.moment, pet, shown.before);
  const unwell = pet.healthState === "sick" || pet.healthState === "fading";
  const open = () => {
    close();
    router.push("/(app)/pet");
  };
  return (
    <Modal animationType="fade" transparent visible onRequestClose={close}>
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
          {/* A sick pet is drawn healthy, so it is shown washed out instead. */}
          <View
            style={
              unwell
                ? {
                    filter: [{ grayscale: pet.healthState === "fading" ? 0.85 : 0.55 }],
                    opacity: pet.healthState === "fading" ? 0.7 : 0.9,
                  }
                : undefined
            }
          >
            <Image
              accessibilityIgnoresInvertColors
              source={petImage(pet.species, pet.stage)}
              style={styles.picture}
            />
          </View>
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
