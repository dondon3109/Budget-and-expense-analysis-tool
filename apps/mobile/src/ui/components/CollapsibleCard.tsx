import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useState, type PropsWithChildren } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { radii, spacing, touchTarget, typography } from "@/ui/tokens";
import { useZoptionTheme } from "@/ui/theme-provider";
import { Card } from "./Card";

interface CollapsibleCardProps extends PropsWithChildren {
  title: string;
  /** The current value, shown under the title so a folded card still answers "what is set". */
  summary: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
}

/** A settings card that folds to a single row; its content renders only while expanded. */
export function CollapsibleCard({ title, summary, icon, children }: CollapsibleCardProps) {
  const theme = useZoptionTheme();
  const [expanded, setExpanded] = useState(false);
  return (
    <Card>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${title}, ${summary}`}
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((current) => !current)}
        style={styles.header}
      >
        <View
          accessibilityElementsHidden
          style={[styles.iconBox, { backgroundColor: theme.colors.brandSoft }]}
        >
          <MaterialCommunityIcons name={icon} size={18} color={theme.colors.brand} />
        </View>
        <View style={styles.headerText}>
          <Text style={[typography.headline, { color: theme.colors.text }]}>{title}</Text>
          <Text numberOfLines={1} style={[typography.caption, { color: theme.colors.textMuted }]}>
            {summary}
          </Text>
        </View>
        <MaterialCommunityIcons
          accessibilityElementsHidden
          name={expanded ? "chevron-up" : "chevron-down"}
          size={22}
          color={theme.colors.textMuted}
        />
      </Pressable>
      {expanded ? children : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: touchTarget,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
});
