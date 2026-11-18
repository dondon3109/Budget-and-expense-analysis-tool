import { Redirect } from "expo-router";

import { useSessionSnapshot } from "@/auth/session-state";
import { AppLoadingScreen } from "@/ui/components";

export function SessionRedirectScreen() {
  const session = useSessionSnapshot();
  if (session.status === "loading") {
    return <AppLoadingScreen accessibilityLabel="Opening Zoption" />;
  }
  const inApp = session.status === "signed-in" || session.status === "guest";
  return <Redirect href={inApp ? "/(app)/(tabs)" : "/(public)"} />;
}
