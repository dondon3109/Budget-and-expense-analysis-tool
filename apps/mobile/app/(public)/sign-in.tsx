import { router } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";

import { Button, FormField } from "@/ui/components";
import { Screen } from "@/ui/screen";
import { useZoptionTheme } from "@/ui/theme-provider";
import { typography } from "@/ui/tokens";

export default function SignInScreen() {
  const theme = useZoptionTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  return (
    <Screen title="Welcome back" description="Use the same Zoption identity as the website.">
      <View className="w-full gap-4">
        <FormField
          label="Email"
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <FormField
          label="Password"
          autoCapitalize="none"
          autoComplete="current-password"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />
        <Button disabled>Sign in</Button>
        <Text
          accessibilityRole="alert"
          style={[typography.caption, { color: theme.colors.textMuted }]}
        >
          Authentication is intentionally disabled until Milestone 2 connects secure Supabase
          sessions.
        </Text>
        <Button variant="quiet" onPress={() => router.push("/(public)/forgot-password")}>
          Forgot password?
        </Button>
      </View>
    </Screen>
  );
}
