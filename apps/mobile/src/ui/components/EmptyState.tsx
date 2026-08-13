import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useZoptionTheme } from "@/ui/theme-provider";
import { spacing, typography } from "@/ui/tokens";

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  const theme = useZoptionTheme();
  return (
    <View className="w-full items-start gap-3" style={styles.empty}>
      <Text accessibilityRole="header" style={[typography.title, { color: theme.colors.text }]}>
        {title}
      </Text>
      <Text style={[typography.body, { color: theme.colors.textMuted }]}>{description}</Text>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({ empty: { paddingVertical: spacing.xl } });
