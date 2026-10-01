import type { PropsWithChildren } from "react";
import { StyleSheet, View, type ViewProps } from "react-native";

import { radii, spacing } from "@/ui/tokens";
import { useZoptionTheme } from "@/ui/theme-provider";

export function Card({ children, style, ...props }: PropsWithChildren<ViewProps>) {
  const theme = useZoptionTheme();
  return (
    <View
      className="w-full"
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.surfaceRaised,
          boxShadow: theme.clay.raised,
        },
        style,
      ]}
      {...props}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
});
