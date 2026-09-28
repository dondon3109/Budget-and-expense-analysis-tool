import { StyleSheet, Text } from "react-native";

import { useZoptionTheme } from "@/ui/theme-provider";
import { radii, spacing, typography } from "@/ui/tokens";

export function SectionLabel({ children }: { children: string }) {
  const theme = useZoptionTheme();
  return <Text style={[typography.headline, { color: theme.colors.text }]}>{children}</Text>;
}

// Layout shared by the Home cards; each card spreads these into its own StyleSheet.
export const homeCardStyles = StyleSheet.create({
  allocationBar: {
    flexDirection: "row",
    height: 10,
    gap: 2,
    borderRadius: radii.round,
    overflow: "hidden",
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: radii.round,
  },
  track: {
    height: 6,
    borderRadius: radii.round,
    overflow: "hidden",
    marginTop: spacing.xxs,
  },
  fill: {
    height: 6,
    borderRadius: radii.round,
  },
});
