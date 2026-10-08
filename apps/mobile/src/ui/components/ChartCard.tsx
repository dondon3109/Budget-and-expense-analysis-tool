import type { PropsWithChildren, ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { spacing, typography } from "@/ui/tokens";
import { useZoptionTheme } from "@/ui/theme-provider";

interface ChartCardProps extends PropsWithChildren {
  title: string;
  /** Visible caption under the chart: the range plus how to interact. */
  accessibleSummary: string;
  alternative?: ReactNode;
}

/**
 * Flat shell for charts (a hairline above, no card): a compact heading, the chart itself, a visible
 * caption, and room for an alternative (empty or error) state. Chart children
 * keep their own accessible labels so screen readers hear per-point values.
 */
export function ChartCard({ title, accessibleSummary, alternative, children }: ChartCardProps) {
  const theme = useZoptionTheme();
  return (
    <View
      style={{
        gap: spacing.sm,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: theme.colors.border,
        paddingTop: spacing.md,
      }}
    >
      <Text accessibilityRole="header" style={[typography.headline, { color: theme.colors.text }]}>
        {title}
      </Text>
      {children}
      <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
        {accessibleSummary}
      </Text>
      {alternative}
    </View>
  );
}
