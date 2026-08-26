import { MaterialCommunityIcons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";

import { useZoptionTheme } from "@/ui/theme-provider";
import { radii, spacing, typography } from "@/ui/tokens";
import { Button } from "./Button";

export function SyncPausedBanner({ message, onRetry }: { message: string; onRetry: () => void }) {
  const theme = useZoptionTheme();

  return (
    <View style={[styles.banner, { backgroundColor: theme.colors.warningSoft }]}>
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
});
