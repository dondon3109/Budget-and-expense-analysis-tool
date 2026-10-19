import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { router } from "expo-router";
import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";

import { withTapSound } from "@/features/sounds/sound-effects";
import { useZoptionTheme } from "@/ui/theme-provider";
import { radii, spacing, touchTarget, typography } from "@/ui/tokens";

/** Header close for the entry form: leaves without saving. */
export function EditorCloseButton() {
  const theme = useZoptionTheme();
  return (
    <Pressable
      accessibilityLabel="Close without saving"
      accessibilityRole="button"
      hitSlop={8}
      onPress={withTapSound(() => router.back())}
      style={styles.close}
    >
      <MaterialCommunityIcons color={theme.colors.text} name="close" size={24} />
    </Pressable>
  );
}

/** Header save for the entry form, so saving never needs a scroll to the bottom. */
export function EditorSaveButton({
  accessibilityLabel,
  disabled,
  saving,
  onPress,
}: {
  accessibilityLabel: string;
  disabled: boolean;
  saving: boolean;
  onPress: () => void;
}) {
  const theme = useZoptionTheme();
  const inactive = disabled || saving;
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: saving }}
      disabled={inactive}
      hitSlop={8}
      onPress={onPress}
      style={[styles.save, { backgroundColor: theme.colors.solid, opacity: disabled ? 0.45 : 1 }]}
    >
      {saving ? (
        <ActivityIndicator color={theme.colors.onSolid} size="small" />
      ) : (
        <Text style={[typography.label, { color: theme.colors.onSolid }]}>Save</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  close: {
    width: touchTarget,
    height: touchTarget,
    alignItems: "center",
    justifyContent: "center",
  },
  save: {
    minWidth: 72,
    minHeight: 36,
    borderRadius: radii.round,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
  },
});
