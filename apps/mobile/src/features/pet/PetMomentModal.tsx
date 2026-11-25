import { router } from "expo-router";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { eggArt, petFigureHealth, petMomentCopy, tombstoneArt } from "@zoption/shared";

import { withTapSound } from "@/features/sounds/sound-effects";
import { useThankYouOpen } from "@/features/thank-you/ThankYouHost";
import { usePlayUpdatePromptPending } from "@/features/updates/PlayUpdatePromptHost";
import { useAccountLink } from "@/telemetry/account-link";
import { Button } from "@/ui/components";
import { useZoptionTheme } from "@/ui/theme-provider";
import { elevation, radii, spacing, typography } from "@/ui/tokens";

import { EggSprite } from "./EggSprite";
import { PetArtSvg } from "./PetArtSvg";
import { PetFigureView } from "./PetFigureView";
import { usePetMoment } from "./use-pet-moment";

/**
 * The pet pop-up on Home: the pet's picture and how it is doing, at most once per open. It waits
 * for the thank-you card and the usage-analytics prompt, because two native modals open at once
 * take the screen from each other in turn on Android.
 */
export function PetMomentModal() {
  const theme = useZoptionTheme();
  const { shown, close } = usePetMoment();
  const analyticsPending = useAccountLink().pending;
  const thankYouOpen = useThankYouOpen();
  const playUpdatePending = usePlayUpdatePromptPending();
  if (!shown || analyticsPending || thankYouOpen || playUpdatePending) return null;

  const { pet } = shown;
  const copy = petMomentCopy(shown.moment, pet);
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
            <PetArtSvg layers={tombstoneArt()} size={200} idBase="petMomentStone" />
          ) : pet.stage === "egg" ? (
            <EggSprite
              art={eggArt(pet.species, pet.eggStreakDays, 0, pet.color ?? "original")}
              size={200}
              accessibilityLabel=""
              interactive={false}
              still
            />
          ) : (
            <PetFigureView
              species={pet.species}
              stage={pet.stage}
              health={petFigureHealth(pet)}
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
  center: { textAlign: "center" },
});
