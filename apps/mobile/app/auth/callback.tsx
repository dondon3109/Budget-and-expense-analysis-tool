import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";

import { authErrorMessage } from "@/auth/auth-validation";
import { useSessionSnapshot } from "@/auth/session-state";
import { Button } from "@/ui/components";
import { Screen } from "@/ui/screen";
import { useZoptionTheme } from "@/ui/theme-provider";
import { typography } from "@/ui/tokens";

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default function AuthCallbackRoute() {
  const theme = useZoptionTheme();
  const params = useLocalSearchParams<{ code?: string | string[]; next?: string | string[] }>();
  const { exchangeCodeForSession } = useSessionSnapshot();
  const handledRef = useRef(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    const code = first(params.code);
    const next = first(params.next);
    if (handledRef.current) return;
    handledRef.current = true;

    if (!code) {
      setError("The sign-in link is incomplete or has expired.");
      return;
    }

    void exchangeCodeForSession(code)
      .then(() => {
        const destination = next === "update-password" ? "/auth/update-password" : "/(app)/(tabs)";
        router.replace(destination);
      })
      .catch((callbackError: unknown) => {
        setError(authErrorMessage(callbackError, "Zoption could not finish authentication."));
      });
  }, [exchangeCodeForSession, params.code, params.next]);

  return (
    <Screen title="Finishing sign in" description="Zoption is validating the secure callback.">
      {error ? (
        <View className="w-full gap-4">
          <Text accessibilityRole="alert" style={[typography.body, { color: theme.colors.danger }]}>
            {error}
          </Text>
          <Button onPress={() => router.replace("/(public)/sign-in")}>Back to sign in</Button>
        </View>
      ) : (
        <ActivityIndicator accessibilityLabel="Finishing sign in" color={theme.colors.brand} />
      )}
    </Screen>
  );
}
