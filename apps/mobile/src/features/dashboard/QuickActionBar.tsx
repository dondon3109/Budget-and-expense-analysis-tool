import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useAccountGate } from "@/features/account-prompt/use-account-gate";
import { useZoptionTheme } from "@/ui/theme-provider";
import { radii, spacing, touchTarget, typography } from "@/ui/tokens";
import { withTapSound } from "@/features/sounds/sound-effects";

export function QuickActionBar() {
  const theme = useZoptionTheme();
  const { openFeature } = useAccountGate();
  return (
    <View accessibilityLabel="Quick actions" style={styles.quickActionsGrid}>
      <Pressable
        accessibilityLabel="Add transaction"
        accessibilityHint="Opens the new transaction form"
        accessibilityRole="button"
        android_ripple={{ color: "rgba(10, 117, 86, 0.16)", borderless: false }}
        onPress={withTapSound(() => router.push("/(app)/transaction"))}
        style={[
          styles.quickActionTile,
          styles.primaryTile,
          { backgroundColor: theme.colors.solid, borderColor: theme.colors.solid },
        ]}
      >
        <MaterialCommunityIcons name="plus" size={20} color={theme.colors.onSolid} />
        <Text style={[typography.label, { color: theme.colors.onSolid }]}>Add</Text>
      </Pressable>

      <Pressable
        accessibilityLabel="Scan receipt"
        accessibilityHint="Opens camera to scan a receipt"
        accessibilityRole="button"
        android_ripple={{ color: "rgba(10, 117, 86, 0.16)", borderless: false }}
        onPress={withTapSound(() => openFeature("receipt-scan", "/(app)/receipt-scan"))}
        style={[
          styles.quickActionTile,
          { backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.border },
        ]}
      >
        <View
          accessibilityElementsHidden
          style={[styles.quickActionIconWrap, { backgroundColor: theme.colors.brandSoft }]}
        >
          <MaterialCommunityIcons name="camera-outline" size={20} color={theme.colors.brand} />
        </View>
        <Text style={[typography.caption, { color: theme.colors.text, fontWeight: "600" }]}>
          Scan
        </Text>
      </Pressable>

      <Pressable
        accessibilityLabel="AI Assistant"
        accessibilityHint="Opens financial AI assistant"
        accessibilityRole="button"
        android_ripple={{ color: "rgba(10, 117, 86, 0.16)", borderless: false }}
        onPress={withTapSound(() => openFeature("assistant", "/(app)/assistant"))}
        style={[
          styles.quickActionTile,
          { backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.border },
        ]}
      >
        <View
          accessibilityElementsHidden
          style={[styles.quickActionIconWrap, { backgroundColor: theme.colors.brandSoft }]}
        >
          <MaterialCommunityIcons
            name="chat-processing-outline"
            size={20}
            color={theme.colors.brand}
          />
        </View>
        <Text style={[typography.caption, { color: theme.colors.text, fontWeight: "600" }]}>
          Assistant
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  quickActionsGrid: {
    flexDirection: "row",
    gap: spacing.xs,
    justifyContent: "space-between",
  },
  primaryTile: { flex: 1.4, flexDirection: "row", gap: spacing.xs },
  quickActionTile: {
    flex: 1,
    minHeight: touchTarget + spacing.xs,
    borderRadius: radii.md,
    borderWidth: 1,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xxs,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xxs,
  },
  quickActionIconWrap: {
    width: 32,
    height: 32,
    borderRadius: radii.round,
    alignItems: "center",
    justifyContent: "center",
  },
});
