import { Redirect } from "expo-router";
import { View } from "react-native";

import { useSessionSnapshot } from "@/auth/session-state";
import { LedgerLoader } from "@/ui/components";

export default function IndexRoute() {
  const session = useSessionSnapshot();
  if (session.status === "loading") {
    return (
      <View className="flex-1 items-center justify-center">
        <LedgerLoader accessibilityLabel="Opening Zoption" />
      </View>
    );
  }
  return <Redirect href={session.status === "signed-in" ? "/(app)/(tabs)" : "/(public)"} />;
}
