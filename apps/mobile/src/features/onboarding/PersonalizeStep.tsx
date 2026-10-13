import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { setPetEnabled } from "@/api/pet";
import { useSessionSnapshot } from "@/auth/session-state";
import { withTapSound } from "@/features/sounds/sound-effects";
import { usePetStore } from "@/stores/pet-store";
import { Button } from "@/ui/components";
import { Screen } from "@/ui/screen";
import { ThemePicker } from "@/ui/theme-picker";
import { useZoptionTheme } from "@/ui/theme-provider";
import { radii, spacing, touchTarget, typography } from "@/ui/tokens";

const PET_CHOICES = [
  {
    value: true,
    title: "Yes, give me a pet",
    detail: "Hatch an egg with a 7-day streak, then keep it happy by logging money.",
    icon: "egg-easter",
  },
  {
    value: false,
    title: "No pet for now",
    detail: "You can turn it on later from the pet page.",
    icon: "sleep",
  },
] as const;

/**
 * The last first-run step, after the Worker has finished setup: pick a theme (saved on the
 * device as soon as it is tapped) and say whether to raise a streak pet. The pet answer is
 * saved on the Worker only when it differs from the current setting, so a yes costs no request.
 */
export function PersonalizeStep({ onDone }: { onDone: (wantsPet: boolean) => void }) {
  const theme = useZoptionTheme();
  const session = useSessionSnapshot();
  const petEnabled = usePetStore((state) => state.pet?.enabled ?? true);
  const [wantsPet, setWantsPet] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const finish = async () => {
    if (wantsPet === petEnabled) {
      onDone(wantsPet);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const accessToken = await session.getAccessToken(false);
      usePetStore.getState().setPet(await setPetEnabled({ accessToken }, wantsPet));
      onDone(wantsPet);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Your pet choice could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      title="Make it yours"
      description="Pick a look and decide if a streak pet should cheer you on. You can change both anytime."
    >
      <Text style={[typography.headline, { color: theme.colors.text }]}>Theme</Text>
      <ThemePicker />
      <Text style={[typography.headline, { color: theme.colors.text }]}>Streak pet</Text>
      <View accessibilityRole="radiogroup" accessibilityLabel="Streak pet" style={styles.choices}>
        {PET_CHOICES.map((choice) => {
          const selected = choice.value === wantsPet;
          return (
            <Pressable
              key={choice.title}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              disabled={busy}
              onPress={withTapSound(() => setWantsPet(choice.value))}
              style={[
                styles.choice,
                {
                  backgroundColor: selected ? theme.colors.brandSoft : theme.colors.surface,
                  borderColor: selected ? theme.colors.brand : theme.colors.border,
                },
              ]}
            >
              <MaterialCommunityIcons
                accessibilityElementsHidden
                name={choice.icon}
                size={26}
                color={selected ? theme.colors.brand : theme.colors.textMuted}
              />
              <View style={styles.choiceCopy}>
                <Text style={[typography.label, { color: theme.colors.text }]}>{choice.title}</Text>
                <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
                  {choice.detail}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
      {error ? (
        <Text
          accessibilityRole="alert"
          style={[typography.callout, { color: theme.colors.danger }]}
        >
          {error}
        </Text>
      ) : null}
      <Button loading={busy} disabled={busy} onPress={() => void finish()}>
        {wantsPet ? "Pick my egg" : "Start tracking"}
      </Button>
    </Screen>
  );
}

const styles = StyleSheet.create({
  choices: { gap: spacing.sm },
  choice: {
    minHeight: touchTarget,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
  },
  choiceCopy: { flex: 1, minWidth: 0, gap: 2 },
});
