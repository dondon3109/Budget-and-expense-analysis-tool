import { StyleSheet, Text, View } from "react-native";

import { radii, spacing, typography } from "@/ui/tokens";
import { useZoptionTheme } from "@/ui/theme-provider";

export type SyncState = "waiting" | "synced" | "pending" | "syncing" | "failed" | "conflicted";

const labels: Record<SyncState, string> = {
  waiting: "Waiting to sync",
  synced: "Up to date",
  pending: "Saved on this device",
  syncing: "Syncing",
  failed: "Sync failed",
  conflicted: "Needs review",
};

export function SyncStatus({ state, count }: { state: SyncState; count?: number }) {
  const theme = useZoptionTheme();
  const color =
    state === "failed" || state === "conflicted"
      ? theme.colors.danger
      : state === "pending" || state === "waiting"
        ? theme.colors.warning
        : theme.colors.brand;
  const label = `${labels[state]}${count ? ` · ${count}` : ""}`;
  return (
    <View
      accessibilityLabel={label}
      className="flex-row items-center gap-2"
      style={styles.container}
    >
      <View accessibilityElementsHidden style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[typography.caption, { color: theme.colors.textMuted }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { minHeight: 28, paddingHorizontal: spacing.xs, borderRadius: radii.round },
  dot: { width: 8, height: 8, borderRadius: radii.round },
});
