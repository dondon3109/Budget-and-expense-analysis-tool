import type { PropsWithChildren, ReactNode } from "react";
import { Text } from "react-native";

import { typography } from "@/ui/tokens";
import { useZoptionTheme } from "@/ui/theme-provider";
import { Card } from "./Card";

interface ChartCardProps extends PropsWithChildren {
  title: string;
  /** Visible caption under the chart: the range plus how to interact. */
  accessibleSummary: string;
  alternative?: ReactNode;
}

/**
 * Foundation shell for charts: a compact heading, the chart itself, a visible
 * caption, and room for an alternative (empty or error) state. Chart children
 * keep their own accessible labels so screen readers hear per-point values.
 */
export function ChartCard({ title, accessibleSummary, alternative, children }: ChartCardProps) {
  const theme = useZoptionTheme();
  return (
    <Card>
      <Text accessibilityRole="header" style={[typography.headline, { color: theme.colors.text }]}>
        {title}
      </Text>
      {children}
      <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
        {accessibleSummary}
      </Text>
      {alternative}
    </Card>
  );
}
