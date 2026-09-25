import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { useZoptionTheme } from "@/ui/theme-provider";
import { radii, spacing, typography } from "@/ui/tokens";
import { Button } from "./Button";

export function SyncPausedBanner({
  message,
  onRetry,
  style,
}: {
  message: string;
  onRetry: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useZoptionTheme();
  // Dismissal hides only this message, so a different sync failure still surfaces.
  const [dismissedMessage, setDismissedMessage] = useState<string | null>(null);

  if (dismissedMessage === message) {
    return null;
  }

  return (
    <View style={[styles.banner, { backgroundColor: theme.colors.warningSoft }, style]}>
      <View
        accessibilityElementsHidden
        style={[styles.iconWrap, { backgroundColor: theme.colors.surfaceRaised }]}
      >
        <MaterialCommunityIcons color={theme.colors.warning} name="cloud-alert-outline" size={22} />
      </View>

      <View style={styles.content}>
        <Text
          accessibilityLabel={`Sync delayed. ${message} Your changes are safe on this device. Zoption will retry automatically.`}
          accessibilityRole="alert"
          style={[typography.headline, { color: theme.colors.text }]}
        >
          Sync delayed
        </Text>
        <Text style={[typography.callout, { color: theme.colors.text }]}>{message}</Text>
        <Text style={[typography.caption, { color: theme.colors.text }]}>
          Your changes are safe on this device. Zoption will retry automatically.
        </Text>
        <View style={styles.action}>
          <Button icon="refresh" onPress={onRetry} variant="quiet">
            Retry now
          </Button>
        </View>
      </View>

      <Pressable
        accessibilityLabel="Dismiss sync delayed notice"
        accessibilityRole="button"
        hitSlop={8}
        onPress={() => setDismissedMessage(message)}
        style={styles.dismiss}
      >
        <MaterialCommunityIcons color={theme.colors.textMuted} name="close" size={20} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    width: "100%",
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  iconWrap: {
    width: 36,
    height: 36,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.md,
  },
  content: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xxs,
  },
  action: { alignSelf: "flex-start" },
  dismiss: { flexShrink: 0, padding: spacing.xxs },
});
