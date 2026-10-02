import { router } from "expo-router";
import { Text } from "react-native";

import { useSessionSnapshot } from "@/auth/session-state";
import { Button, Card } from "@/ui/components";
import { useZoptionTheme } from "@/ui/theme-provider";
import { typography } from "@/ui/tokens";

import { accountBenefits } from "./account-features";

/** Tells a guest what they are missing and offers sign-in. Renders nothing for an account. */
export function GuestAccountCard() {
  const theme = useZoptionTheme();
  const { status } = useSessionSnapshot();
  if (status !== "guest") return null;
  return (
    <Card accessibilityLabel="Using Zoption without an account">
      <Text accessibilityRole="header" style={[typography.headline, { color: theme.colors.text }]}>
        You're using Zoption without an account
      </Text>
      <Text style={[typography.callout, { color: theme.colors.textMuted }]}>
        Your data stays on this device. With an account you get:
      </Text>
      {accountBenefits.map((benefit) => (
        <Text key={benefit} style={[typography.callout, { color: theme.colors.text }]}>
          • {benefit}
        </Text>
      ))}
      <Button onPress={() => router.push("/(public)/sign-in")}>Sign in or create an account</Button>
    </Card>
  );
}
