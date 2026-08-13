import { Text } from "react-native";

import { Screen } from "@/ui/screen";
import { useZoptionTheme } from "@/ui/theme-provider";
import { typography } from "@/ui/tokens";

export default function ForgotPasswordScreen() {
  const theme = useZoptionTheme();
  return (
    <Screen
      title="Reset password"
      description="Recovery will open safely in this app once mobile Auth callbacks are connected."
    >
      <Text style={[typography.body, { color: theme.colors.textMuted }]}>
        No recovery request is sent from the foundation build.
      </Text>
    </Screen>
  );
}
