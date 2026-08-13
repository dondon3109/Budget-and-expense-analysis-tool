import { Redirect, Stack } from "expo-router";
import { ActivityIndicator, Text, View } from "react-native";

import { useSessionSnapshot } from "@/auth/session-state";
import { useWorkerIdentity } from "@/auth/worker-identity-state";
import { LocalWorkspaceProvider, useLocalWorkspace } from "@/db/local-workspace-state";
import { Button, ErrorState } from "@/ui/components";
import { useZoptionTheme } from "@/ui/theme-provider";
import { spacing, typography } from "@/ui/tokens";

export default function AuthenticatedLayout() {
  const session = useSessionSnapshot();
  const identity = useWorkerIdentity();
  const theme = useZoptionTheme();
  if (session.status !== "signed-in") return <Redirect href="/(public)/sign-in" />;
  if (identity.status === "checking" || identity.status === "idle") {
    return (
      <View className="flex-1 items-center justify-center gap-3 px-6">
        <ActivityIndicator
          accessibilityLabel="Verifying your Zoption workspace"
          color={theme.colors.brand}
        />
        <Text style={[typography.body, { color: theme.colors.textMuted }]}>
          Opening your secure workspace…
        </Text>
      </View>
    );
  }
  if (identity.status === "error") {
    return (
      <View className="flex-1 items-start justify-center px-6" style={{ gap: spacing.md }}>
        <ErrorState
          title="Workspace unavailable"
          message={identity.message ?? "Zoption could not verify your financial workspace."}
          onRetry={identity.retry}
        />
        <Button variant="quiet" onPress={() => void session.signOut()}>
          Sign out
        </Button>
      </View>
    );
  }
  if (!session.subject) return <Redirect href="/(public)/sign-in" />;
  return (
    <LocalWorkspaceProvider subject={session.subject}>
      <LocalWorkspaceGate />
    </LocalWorkspaceProvider>
  );
}

function LocalWorkspaceGate() {
  const local = useLocalWorkspace();
  const theme = useZoptionTheme();
  if (local.status === "opening") {
    return (
      <View className="flex-1 items-center justify-center gap-3 px-6">
        <ActivityIndicator
          accessibilityLabel="Opening encrypted local workspace"
          color={theme.colors.brand}
        />
        <Text style={[typography.body, { color: theme.colors.textMuted }]}>
          Unlocking encrypted local data…
        </Text>
      </View>
    );
  }
  if (local.status === "error") {
    return (
      <View className="flex-1 items-start justify-center px-6">
        <ErrorState
          title="Local workspace unavailable"
          message={local.message ?? "The encrypted local workspace could not be opened."}
          onRetry={local.retry}
        />
      </View>
    );
  }
  return <Stack screenOptions={{ headerShown: false }} />;
}
