import { Stack } from "expo-router";

import { useZoptionTheme } from "@/ui/theme-provider";

export default function PublicLayout() {
  const theme = useZoptionTheme();
  return (
    <Stack
      screenOptions={{
        headerShadowVisible: false,
        headerStyle: { backgroundColor: theme.colors.canvas },
        headerTintColor: theme.colors.brand,
        contentStyle: { backgroundColor: theme.colors.canvas },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="sign-in" options={{ title: "Sign in", presentation: "modal" }} />
      <Stack.Screen name="forgot-password" options={{ title: "Reset password" }} />
    </Stack>
  );
}
