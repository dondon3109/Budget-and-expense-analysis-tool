import { StyleSheet, Switch, Text, View } from "react-native";

import { playSound } from "@/features/sounds/sound-effects";
import { useSoundEffectsStore } from "@/stores/sound-effects-store";
import { CollapsibleCard } from "@/ui/components";
import { useZoptionTheme } from "@/ui/theme-provider";
import { spacing, touchTarget, typography } from "@/ui/tokens";

/** Turns the tap, success, and error sounds on or off for this device. */
export function SoundEffectsCard() {
  const theme = useZoptionTheme();
  const enabled = useSoundEffectsStore((state) => state.enabled);
  const setEnabled = useSoundEffectsStore((state) => state.setEnabled);

  const toggle = (next: boolean) => {
    setEnabled(next);
    playSound("tap");
  };

  return (
    <CollapsibleCard title="Sound effects" summary={enabled ? "On" : "Off"} icon="volume-high">
      <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
        Play short sounds for taps, saved entries, and errors. Follows your device volume.
      </Text>
      <View style={styles.option}>
        <Text style={[typography.headline, { color: theme.colors.text }]}>Play sounds</Text>
        <Switch
          accessibilityLabel="Play sounds"
          value={enabled}
          onValueChange={toggle}
          trackColor={{ true: theme.colors.brand, false: theme.colors.border }}
        />
      </View>
    </CollapsibleCard>
  );
}

const styles = StyleSheet.create({
  option: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: touchTarget,
    gap: spacing.sm,
  },
});
