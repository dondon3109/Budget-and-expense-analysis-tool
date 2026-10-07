import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import type { ComponentProps, ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useZoptionTheme } from "@/ui/theme-provider";
import { radii, spacing, typography } from "@/ui/tokens";

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  icon?: ComponentProps<typeof MaterialCommunityIcons>["name"];
}) {
  const theme = useZoptionTheme();
  return (
    <View className="w-full items-center gap-3" style={styles.empty}>
      {icon ? (
        <View
          accessibilityElementsHidden
          style={[
            styles.iconWrap,
            { backgroundColor: theme.colors.brandSoft, borderColor: theme.colors.border },
          ]}
        >
          <MaterialCommunityIcons name={icon} size={26} color={theme.colors.brand} />
        </View>
      ) : null}
      <Text
        accessibilityRole="header"
        style={[typography.title, styles.centered, { color: theme.colors.text }]}
      >
        {title}
      </Text>
      <Text style={[typography.body, styles.centered, { color: theme.colors.textMuted }]}>
        {description}
      </Text>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { paddingVertical: spacing.xxl, paddingHorizontal: spacing.lg },
  centered: { textAlign: "center" },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: radii.lg,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xxs,
  },
});
