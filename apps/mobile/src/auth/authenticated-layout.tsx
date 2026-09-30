import { Redirect } from "expo-router";
import type { PropsWithChildren } from "react";
import { Text, View } from "react-native";

import { useSessionSnapshot } from "@/auth/session-state";
import { useWorkerIdentity } from "@/auth/worker-identity-state";
import { useWorkspaceCurrencySync } from "@/auth/workspace-currency-sync";
import { AppLockGate } from "@/features/app-lock/AppLockGate";
import { PlaceVisitTapHandler } from "@/features/place-visits/place-visits";
import { DailyReminderTapHandler } from "@/features/reminders/daily-reminder";
import { LocalWorkspaceProvider, useLocalWorkspace } from "@/db/local-workspace-state";
import { SyncProvider } from "@/sync/sync-state";
import { ErrorState, LedgerLoader } from "@/ui/components";
import { useZoptionTheme } from "@/ui/theme-provider";
import { typography } from "@/ui/tokens";

/**
 * Everything the authenticated route group waits on before it renders `children`: the restored
 * session, the app lock, the encrypted local workspace, and the sync loop.
 */
export function AuthenticatedGate({ children }: PropsWithChildren) {
  const session = useSessionSnapshot();
  const identity = useWorkerIdentity();
  const theme = useZoptionTheme();
  // Hold the route while the stored session is still being restored. A deep
  // link that opens the app cold arrives before the restore settles, and
  // redirecting here would discard that route and its params: the home-screen
  // mic widget's widget-intent link lost its transcript and payload that way.
  // Only a resolved signed-out session redirects. Same rule as SessionRedirectScreen.
  if (session.status === "loading") {
    return (
      <View className="flex-1 items-center justify-center gap-5 px-6">
        <LedgerLoader accessibilityLabel="Restoring your session" />
        <Text style={[typography.body, { color: theme.colors.textMuted }]}>
          Restoring your session…
        </Text>
      </View>
    );
  }
  if (session.status !== "signed-in") return <Redirect href="/(public)/sign-in" />;
  if (!session.subject) return <Redirect href="/(public)/sign-in" />;
  return (
    <AppLockGate subject={session.subject}>
      <LocalWorkspaceProvider subject={session.subject}>
        <LocalWorkspaceGate identity={identity}>{children}</LocalWorkspaceGate>
      </LocalWorkspaceProvider>
    </AppLockGate>
  );
}

function LocalWorkspaceGate({
  identity,
  children,
}: PropsWithChildren<{ identity: ReturnType<typeof useWorkerIdentity> }>) {
  const local = useLocalWorkspace();
  useWorkspaceCurrencySync();
  const theme = useZoptionTheme();
  if (local.status === "opening") {
    return (
      <View className="flex-1 items-center justify-center gap-5 px-6">
        <LedgerLoader accessibilityLabel="Opening encrypted local workspace" />
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
  return (
    <SyncProvider
      enabled={identity.status === "verified"}
      onUnavailableRetry={identity.retry}
      unavailableMessage={
        identity.status === "error"
          ? (identity.message ?? "Zoption could not verify your financial workspace.")
          : null
      }
    >
      {children}
      <DailyReminderTapHandler />
      <PlaceVisitTapHandler />
    </SyncProvider>
  );
}
