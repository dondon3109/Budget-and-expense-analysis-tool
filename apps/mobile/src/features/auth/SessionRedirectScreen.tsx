import { Redirect } from "expo-router";
import { View } from "react-native";

import { useSessionSnapshot } from "@/auth/session-state";
import { LedgerLoader } from "@/ui/components";

export function SessionRedirectScreen() {
  const session = useSessionSnapshot();
  if (session.status === "loading") {
    return (
      <View className="flex-1 items-center justify-center">
        <LedgerLoader accessibilityLabel="Opening Zoption" />
      </View>
    );
  }
  const inApp = session.status === "signed-in" || session.status === "guest";
  return <Redirect href={inApp ? "/(app)/(tabs)" : "/(public)"} />;
}
