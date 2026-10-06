import { StyleSheet, Text, View } from "react-native";

import { radii } from "@/ui/tokens";

/**
 * A category's emoji on a soft sticker tinted with the category color, so the
 * same emoji reads as a friendly tile on every row. A category without an emoji
 * gets a dot in its color on the same tile.
 */
export function CategoryBadge({
  emoji,
  color,
  size = 32,
}: {
  emoji: string | null;
  color: string;
  size?: number;
}) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      // 26 is the hex alpha (~15%): the tint stays soft enough for text on every theme.
      style={[styles.badge, { width: size, height: size, backgroundColor: `${color}26` }]}
    >
      {emoji ? (
        <Text style={{ fontSize: size * 0.5, lineHeight: size * 0.62, textAlign: "center" }}>
          {emoji}
        </Text>
      ) : (
        <View style={[styles.dot, { backgroundColor: color }]} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { borderRadius: radii.md, alignItems: "center", justifyContent: "center" },
  dot: { width: 10, height: 10, borderRadius: radii.round },
});
