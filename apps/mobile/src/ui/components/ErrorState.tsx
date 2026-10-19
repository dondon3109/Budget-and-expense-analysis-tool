import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { StyleSheet, Text, View } from "react-native";

import { useZoptionTheme } from "@/ui/theme-provider";
import { radii, spacing, typography } from "@/ui/tokens";
import { Button } from "./Button";

/**
 * A failed load in place of the content it stands for, on a page or inside a card. The icon
 * carries the alarm, so the title stays in the text color and the message stays calm.
 */
export function ErrorState({
  title,
  message,
  onRetry,
}: {
  title: string;
  message: string;
  onRetry?: () => void;
}) {
  const theme = useZoptionTheme();
  return (
    <View accessibilityRole="alert" style={styles.container}>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[
          styles.iconWrap,
          { backgroundColor: theme.colors.dangerSoft, borderColor: theme.colors.border },
        ]}
      >
        <MaterialCommunityIcons name="alert-circle-outline" size={28} color={theme.colors.danger} />
      </View>
      <Text style={[typography.title, styles.centered, { color: theme.colors.text }]}>{title}</Text>
      <Text style={[typography.body, styles.centered, { color: theme.colors.textMuted }]}>
        {message}
      </Text>
      {onRetry ? (
        <View style={styles.action}>
          <Button icon="refresh" onPress={onRetry}>
            Try again
          </Button>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.md,
  },
  centered: { textAlign: "center", maxWidth: 360 },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: radii.lg,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xs,
  },
  action: { marginTop: spacing.sm },
});
