import type { PropsWithChildren } from "react";
import { Pressable, StyleSheet, Text, View, type ViewProps } from "react-native";

import { useZoptionTheme } from "@/ui/theme-provider";
import { radii, spacing, typography } from "@/ui/tokens";
import { withTapSound } from "@/features/sounds/sound-effects";

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

// Header for a flat Home section: a title and a "View all" link, with no card
// around the content below it.
export function SectionHeader({
  title,
  actionLabel,
  onAction,
}: {
  title: string;
  actionLabel: string;
  onAction: () => void;
}) {
  const theme = useZoptionTheme();
  return (
    <View style={homeCardStyles.cardHeaderRow}>
      <SectionLabel>{title}</SectionLabel>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={actionLabel}
        onPress={withTapSound(onAction)}
        hitSlop={8}
      >
        <Text style={[typography.caption, { color: theme.colors.brand, fontWeight: "600" }]}>
          View all
        </Text>
      </Pressable>
    </View>
  );
}

// Hairline between rows of a flat section.
export function RowDivider() {
  const theme = useZoptionTheme();
  return (
    <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.colors.border }} />
  );
}

// A Home section with no card around it. `divided` draws a hairline above it,
// which is how consecutive Analytics sections are told apart.
export function FlatSection({
  divided = true,
  children,
  style,
  ...props
}: PropsWithChildren<ViewProps & { divided?: boolean }>) {
  const theme = useZoptionTheme();
  return (
    <View
      style={[
        { gap: spacing.sm },
        divided && {
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: theme.colors.border,
          paddingTop: spacing.md,
        },
        style,
      ]}
      {...props}
    >
      {children}
    </View>
  );
}
