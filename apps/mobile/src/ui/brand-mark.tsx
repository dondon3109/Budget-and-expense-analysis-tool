import { StyleSheet, Text, View } from "react-native";

import { radii, typography } from "./tokens";
import { useZoptionTheme } from "./theme-provider";

export function BrandMark({ compact = false }: { compact?: boolean }) {
  const theme = useZoptionTheme();
  return (
    <View
      accessibilityLabel="Zoption"
      accessibilityRole="text"
      className="flex-row items-center gap-3"
    >
      <View
        accessibilityElementsHidden
        style={[styles.mark, { backgroundColor: theme.colors.brand }]}
      >
        <Text style={[styles.letter, { color: theme.colors.onBrand }]}>Z</Text>
      </View>
      {!compact ? (
        <Text style={[typography.title, { color: theme.colors.text }]}>Zoption</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  mark: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
  },
  letter: { fontSize: 21, lineHeight: 24, fontWeight: "800" },
});
