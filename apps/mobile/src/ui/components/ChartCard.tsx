import type { PropsWithChildren, ReactNode } from "react";
import { Text, View } from "react-native";

import { typography } from "@/ui/tokens";
import { useZoptionTheme } from "@/ui/theme-provider";
import { Card } from "./Card";

interface ChartCardProps extends PropsWithChildren {
  title: string;
  accessibleSummary: string;
  alternative?: ReactNode;
}

export function ChartCard({ title, accessibleSummary, alternative, children }: ChartCardProps) {
  const theme = useZoptionTheme();
  return (
    <Card>
      <Text accessibilityRole="header" style={[typography.title, { color: theme.colors.text }]}>
        {title}
      </Text>
      <View accessibilityLabel={accessibleSummary}>{children}</View>
      <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
        {accessibleSummary}
      </Text>
      {alternative}
    </Card>
  );
}
