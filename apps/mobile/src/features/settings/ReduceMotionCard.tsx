import { StyleSheet, Switch, Text, View } from "react-native";

import { playSound } from "@/features/sounds/sound-effects";
import { useReduceMotionStore } from "@/stores/reduce-motion-store";
import { CollapsibleCard } from "@/ui/components";
import { useZoptionTheme } from "@/ui/theme-provider";
import { spacing, touchTarget, typography } from "@/ui/tokens";

/** Turns the in-app Reduce Motion switch on or off for this device. */
export function ReduceMotionCard() {
  const theme = useZoptionTheme();
  const enabled = useReduceMotionStore((state) => state.enabled);
  const setEnabled = useReduceMotionStore((state) => state.setEnabled);

  const toggle = (next: boolean) => {
    setEnabled(next);
    playSound("select");
  };

  return (
    <CollapsibleCard title="Reduce motion" summary={enabled ? "On" : "Off"} icon="motion-pause">
      <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
        Keep animations still across Zoption. Your device&apos;s Reduce Motion setting always
        applies too.
      </Text>
      <View style={styles.option}>
        <Text style={[typography.headline, { color: theme.colors.text }]}>Reduce motion</Text>
        <Switch
          accessibilityLabel="Reduce motion"
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
