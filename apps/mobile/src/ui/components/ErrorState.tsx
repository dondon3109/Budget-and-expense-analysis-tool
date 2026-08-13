import { Text, View } from "react-native";

import { useZoptionTheme } from "@/ui/theme-provider";
import { spacing, typography } from "@/ui/tokens";
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
      style={{ paddingVertical: spacing.lg }}
    >
      <Text style={[typography.title, { color: theme.colors.danger }]}>{title}</Text>
      <Text style={[typography.body, { color: theme.colors.text }]}>{message}</Text>
      {onRetry ? <Button onPress={onRetry}>Try again</Button> : null}
    </View>
  );
}
