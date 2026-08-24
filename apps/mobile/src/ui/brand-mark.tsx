import { Image, StyleSheet, Text, View } from "react-native";

import brandIcon from "../../assets/zoption-icon.png";
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
      <Image accessibilityElementsHidden source={brandIcon} style={styles.mark} />
      {!compact ? (
        <Text style={[typography.title, { color: theme.colors.text }]}>Zoption</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  mark: {
    width: 36,
    height: 36,
    borderRadius: radii.md,
  },
});
