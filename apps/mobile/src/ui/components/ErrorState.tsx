import { MaterialCommunityIcons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";

import { useZoptionTheme } from "@/ui/theme-provider";
import { radii, spacing, typography } from "@/ui/tokens";
import { Button } from "./Button";

export function ErrorState({
  title,
  message,
  onRetry,
}: {
  title: string;
  message: string;
  onRetry?: () => void;
}) {
  const theme = useZoptionTheme();
  return (
    <View
      accessibilityRole="alert"
      className="w-full items-start gap-3"
      style={styles.container}
    >
      <View
        accessibilityElementsHidden
        style={[
          styles.iconWrap,
          { backgroundColor: theme.colors.dangerSoft, borderColor: theme.colors.danger },
        ]}
      >
        <MaterialCommunityIcons name="alert-circle-outline" size={24} color={theme.colors.danger} />
      </View>
      <Text style={[typography.title, { color: theme.colors.danger }]}>{title}</Text>
      <Text style={[typography.body, { color: theme.colors.text }]}>{message}</Text>
      {onRetry ? <Button onPress={onRetry}>Try again</Button> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingVertical: spacing.lg },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xxs,
  },
});
