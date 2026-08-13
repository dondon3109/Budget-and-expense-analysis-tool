import { Redirect, Stack } from "expo-router";

import { useSessionSnapshot } from "@/auth/session-state";

export default function AuthenticatedLayout() {
  const session = useSessionSnapshot();
  if (session.status !== "signed-in") return <Redirect href="/(public)/sign-in" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
