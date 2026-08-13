import { useNetInfo } from "@react-native-community/netinfo";
import { StyleSheet, Text, View } from "react-native";

import { useZoptionTheme } from "@/ui/theme-provider";
import { spacing, typography } from "@/ui/tokens";

export function OfflineBanner() {
  const netInfo = useNetInfo();
  const theme = useZoptionTheme();
  const reachable = netInfo.isInternetReachable ?? netInfo.isConnected;
  if (reachable !== false) return null;

  return (
    <View
      accessibilityRole="alert"
      style={[styles.banner, { backgroundColor: theme.colors.warningSoft }]}
    >
      <Text style={[typography.label, { color: theme.colors.warning }]}>You’re offline</Text>
      <Text style={[typography.caption, { color: theme.colors.text }]}>
        Pending changes will wait for a confirmed server response.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    width: "100%",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.xxs,
  },
});
