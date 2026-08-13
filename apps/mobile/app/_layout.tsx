import "react-native-gesture-handler";
import "@/styles/global.css";

import { Stack, type ErrorBoundaryProps } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { SessionProvider } from "@/auth/session-state";
import { configureConnectivity } from "@/config/connectivity";
import { Button } from "@/ui/components";
import { ZoptionThemeProvider, useZoptionTheme } from "@/ui/theme-provider";
import { spacing, typography } from "@/ui/tokens";

function RootNavigator() {
  const theme = useZoptionTheme();
  return (
    <>
      <StatusBar style={theme.dark ? "light" : "dark"} />
      <Stack
        screenOptions={{
          contentStyle: { backgroundColor: theme.colors.canvas },
          headerTintColor: theme.colors.brand,
        }}
      >
        <Stack.Screen name="(public)" options={{ headerShown: false }} />
        <Stack.Screen name="(app)" options={{ headerShown: false }} />
        <Stack.Screen name="auth" options={{ headerShown: false }} />
        <Stack.Screen name="+not-found" options={{ title: "Not found" }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  useEffect(() => configureConnectivity(), []);
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <ZoptionThemeProvider>
          <RootNavigator />
        </ZoptionThemeProvider>
      </SessionProvider>
    </SafeAreaProvider>
  );
}

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <SafeAreaProvider>
      <ZoptionThemeProvider>
        <View
          className="flex-1 items-start justify-center gap-4 px-6"
          style={{ padding: spacing.lg }}
        >
          <Text accessibilityRole="header" style={typography.title}>
            Zoption couldn’t open this screen
          </Text>
          <Text accessibilityRole="alert" style={typography.body}>
            {error.message || "An unexpected local error occurred."}
          </Text>
          <Button onPress={retry}>Try again</Button>
        </View>
      </ZoptionThemeProvider>
    </SafeAreaProvider>
  );
}
