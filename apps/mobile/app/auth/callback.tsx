import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";

import { authErrorMessage } from "@/auth/auth-validation";
import { useSessionSnapshot } from "@/auth/session-state";
import { getSupabaseClient } from "@/auth/supabase-client";
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
  const { exchangeCodeForSession, status } = useSessionSnapshot();
  const handledRef = useRef(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    const code = first(params.code);
    const next = first(params.next);
    if (handledRef.current) return;
    handledRef.current = true;

    // The in-app Google flow exchanges the code itself when the browser
    // session resolves; on Android the same deep link also lands here, so a
    // session can already exist before this route mounts. In that case the
    // exchange below would race and consume the code twice.
    if (status === "signed-in") {
      router.replace("/(app)/(tabs)");
      return;
    }

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
        // If a parallel exchange already established the session, the code
        // is consumed and the server reports an invalid flow state; that is
        // a success, not an error.
        void getSupabaseClient()
          .auth.getSession()
          .then(({ data }) => {
            if (data.session) {
              router.replace("/(app)/(tabs)");
            } else {
              setError(authErrorMessage(callbackError, "Zoption could not finish authentication."));
            }
          });
      });
  }, [exchangeCodeForSession, params.code, params.next, status]);

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
