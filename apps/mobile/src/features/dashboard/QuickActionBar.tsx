import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useZoptionTheme } from "@/ui/theme-provider";
import { radii, spacing, touchTarget, typography } from "@/ui/tokens";

export function QuickActionBar() {
  const theme = useZoptionTheme();
  return (
    <View accessibilityLabel="Quick actions" style={styles.quickActionsGrid}>
      <Pressable
        accessibilityLabel="Add transaction"
        accessibilityHint="Opens the new transaction form"
        accessibilityRole="button"
        android_ripple={{ color: "rgba(10, 117, 86, 0.16)", borderless: false }}
        onPress={() => router.push("/(app)/transaction")}
        style={[
          styles.quickActionTile,
          { backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.border },
        ]}
      >
        <View
          accessibilityElementsHidden
          style={[styles.quickActionIconWrap, { backgroundColor: theme.colors.brandSoft }]}
        >
          <MaterialCommunityIcons name="plus" size={20} color={theme.colors.brand} />
        </View>
        <Text style={[typography.caption, { color: theme.colors.text, fontWeight: "600" }]}>
          Add
        </Text>
      </Pressable>

      <Pressable
        accessibilityLabel="Scan receipt"
        accessibilityHint="Opens camera to scan a receipt"
        accessibilityRole="button"
        android_ripple={{ color: "rgba(10, 117, 86, 0.16)", borderless: false }}
        onPress={() => router.push("/(app)/receipt-scan")}
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
        accessibilityLabel="View budgets"
        accessibilityHint="Opens category budgets overview"
        accessibilityRole="button"
        android_ripple={{ color: "rgba(10, 117, 86, 0.16)", borderless: false }}
        onPress={() => router.push("/(app)/(tabs)/budgets")}
        style={[
          styles.quickActionTile,
          { backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.border },
        ]}
      >
        <View
          accessibilityElementsHidden
          style={[styles.quickActionIconWrap, { backgroundColor: theme.colors.brandSoft }]}
        >
          <MaterialCommunityIcons name="chart-donut" size={20} color={theme.colors.brand} />
        </View>
        <Text style={[typography.caption, { color: theme.colors.text, fontWeight: "600" }]}>
          Budgets
        </Text>
      </Pressable>

      <Pressable
        accessibilityLabel="AI Assistant"
        accessibilityHint="Opens financial AI assistant"
        accessibilityRole="button"
        android_ripple={{ color: "rgba(10, 117, 86, 0.16)", borderless: false }}
        onPress={() => router.push("/(app)/assistant")}
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
