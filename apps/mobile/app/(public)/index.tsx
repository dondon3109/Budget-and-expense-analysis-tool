import { router } from "expo-router";
import { Text, View } from "react-native";

import { BrandMark } from "@/ui/brand-mark";
import { Button, Card, MoneyValue, SyncStatus } from "@/ui/components";
import { Screen } from "@/ui/screen";
import { useZoptionTheme } from "@/ui/theme-provider";
import { spacing, typography } from "@/ui/tokens";

export default function WelcomeScreen() {
  const theme = useZoptionTheme();
  return (
    <Screen
      title="Your money, in your hands."
      description="A native Zoption workspace is being built around private, local-first records."
    >
      <BrandMark />
      <Card accessibilityLabel="Illustrative private workspace preview">
        <View className="flex-row items-start justify-between gap-3">
          <View className="flex-1 gap-1">
            <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
              ILLUSTRATIVE BALANCE
            </Text>
            <MoneyValue amountMinor={4285000} />
          </View>
          <SyncStatus state="synced" />
        </View>
        <View className="gap-2" style={{ marginTop: spacing.sm }}>
          <View
            style={{
              height: 8,
              width: "78%",
              borderRadius: 8,
              backgroundColor: theme.colors.brand,
            }}
          />
          <View
            style={{
              height: 8,
              width: "54%",
              borderRadius: 8,
              backgroundColor: theme.colors.expense,
            }}
          />
          <View
            style={{
              height: 8,
              width: "35%",
              borderRadius: 8,
              backgroundColor: theme.colors.budget,
            }}
          />
        </View>
        <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
          Preview values are synthetic and are not fetched from an account.
        </Text>
      </Card>
      <View className="w-full gap-3">
        <Button onPress={() => router.push("/(public)/sign-in")}>Sign in</Button>
        <Text style={[typography.caption, { color: theme.colors.textMuted, textAlign: "center" }]}>
          The Zoption website stays available too - your account works in both.
        </Text>
      </View>
    </Screen>
  );
}
