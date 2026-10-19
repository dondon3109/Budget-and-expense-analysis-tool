import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/ui/components";
import { useZoptionTheme } from "@/ui/theme-provider";
import { radii, spacing, typography } from "@/ui/tokens";

/**
 * Full-screen fallback for the root expo-router ErrorBoundary. It renders
 * outside the session and workspace providers, so it may only use the theme.
 */
export function CrashScreen({ error, retry }: { error: Error; retry: () => Promise<void> }) {
  const theme = useZoptionTheme();
  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: theme.colors.canvas }]}>
      <View accessibilityRole="alert" style={styles.content}>
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[
            styles.iconWrap,
            { backgroundColor: theme.colors.dangerSoft, borderColor: theme.colors.border },
          ]}
        >
          <MaterialCommunityIcons
            name="alert-circle-outline"
            size={28}
            color={theme.colors.danger}
          />
        </View>
        <Text
          accessibilityRole="header"
          style={[typography.title, styles.centered, { color: theme.colors.text }]}
        >
          Something went wrong
        </Text>
        <Text style={[typography.body, styles.centered, { color: theme.colors.textMuted }]}>
          Zoption couldn’t show this screen. Your entries are safe on this phone. Try again, or go
          back to Home.
        </Text>
        {/* Raw error text helps while developing but means nothing to a user. */}
        {__DEV__ && error.message ? (
          <Text
            selectable
            style={[
              typography.body,
              styles.detail,
              { color: theme.colors.textMuted, borderColor: theme.colors.border },
            ]}
          >
            {error.message}
          </Text>
        ) : null}
      </View>
      <View style={styles.actions}>
        <Button icon="refresh" size="large" onPress={() => void retry()}>
          Try again
        </Button>
        <Button
          icon="home-outline"
          size="large"
          variant="secondary"
          onPress={() => {
            // The navigator sits above the root boundary, so move to Home first
            // and then remount the layout there instead of on the failing route.
            router.replace("/");
            void retry();
          }}
        >
          Go to Home
        </Button>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
  content: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.sm },
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
  detail: {
    alignSelf: "stretch",
    marginTop: spacing.sm,
    padding: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    fontSize: 12,
  },
  actions: { gap: spacing.sm },
});
