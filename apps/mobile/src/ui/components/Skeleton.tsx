import { StyleSheet, View } from "react-native";

import { radii } from "@/ui/tokens";
import { useZoptionTheme } from "@/ui/theme-provider";

export function Skeleton({
  width = "100%",
  height = 20,
}: {
  width?: number | `${number}%`;
  height?: number;
}) {
  const theme = useZoptionTheme();
  return (
    <View
      accessibilityLabel="Loading"
      accessibilityRole="progressbar"
      style={[styles.skeleton, { width, height, backgroundColor: theme.colors.brandSoft }]}
    />
  );
}

const styles = StyleSheet.create({ skeleton: { borderRadius: radii.sm } });
