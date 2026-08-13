import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";

import { useSessionSnapshot } from "@/auth/session-state";

export default function IndexRoute() {
  const session = useSessionSnapshot();
  if (session.status === "loading") {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator accessibilityLabel="Opening Zoption" />
      </View>
    );
  }
  return <Redirect href={session.status === "signed-in" ? "/(app)/(tabs)" : "/(public)"} />;
}
