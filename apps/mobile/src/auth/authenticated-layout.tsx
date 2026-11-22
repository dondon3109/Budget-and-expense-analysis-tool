import { Redirect } from "expo-router";
import { useState, type PropsWithChildren } from "react";
import { Alert, View } from "react-native";

import { useSessionSnapshot } from "@/auth/session-state";
import { useWorkerIdentity } from "@/auth/worker-identity-state";
import { useGoalProfileSync } from "@/auth/goal-profile-sync";
import { usePetSync } from "@/auth/pet-sync";
import { usePetNotifications } from "@/features/pet/pet-notifications";
import { usePushRegistration } from "@/features/push/use-push-registration";
import { useWorkspaceCurrencySync } from "@/auth/workspace-currency-sync";
import { AccountPromptHost } from "@/features/account-prompt/AccountPromptHost";
import { AppLockGate } from "@/features/app-lock/AppLockGate";
import { PlanLimitHost } from "@/features/billing/PlanLimitDialog";
import { ThankYouHost } from "@/features/thank-you/ThankYouHost";
import { UsageAnalyticsPromptHost } from "@/features/usage-analytics/UsageAnalytics";
import { DailyReminderTapHandler } from "@/features/reminders/daily-reminder";
import { LocalWorkspaceProvider, useLocalWorkspace } from "@/db/local-workspace-state";
import { ActiveWorkspaceProvider, useActiveWorkspace } from "@/features/family/active-workspace";
import { FamilyPushTapHandler } from "@/features/family/family-push-tap";
import { SubscriptionPushTapHandler } from "@/features/subscriptions/subscription-push-tap";
import { SharedReceiptHandoff } from "@/features/receipts/SharedReceiptHandoff";
import { SyncProvider, useSyncState } from "@/sync/sync-state";
import { ScreenViewedTracker } from "@/telemetry/screen-viewed";
import { AppLoadingScreen, Button, ErrorState } from "@/ui/components";

/**
 * Everything the authenticated route group waits on before it renders `children`: the restored
 * session, the app lock, the encrypted local workspace, and for a freshly created workspace its
 * first sync. A guest session gets the local workspace only: no app lock, and sync stays off
 * because it needs an account.
 */
export function AuthenticatedGate({ children }: PropsWithChildren) {
  const session = useSessionSnapshot();
  const identity = useWorkerIdentity();
  // Hold the route while the stored session is still being restored. A deep
  // link that opens the app cold arrives before the restore settles, and
  // redirecting here would discard that route and its params: the home-screen
  // mic widget's widget-intent link lost its transcript and payload that way.
  // Only a resolved signed-out session redirects. Same rule as SessionRedirectScreen.
  if (session.status === "loading") {
    return <AppLoadingScreen accessibilityLabel="Restoring your session" />;
  }
  if (session.status !== "signed-in" && session.status !== "guest") {
    return <Redirect href="/(public)/sign-in" />;
  }
  if (!session.subject) return <Redirect href="/(public)/sign-in" />;
  const gate = <LocalWorkspaceGate identity={identity}>{children}</LocalWorkspaceGate>;
  // Load the workspace record and open SQLite in parallel with the app-lock check
  // instead of waiting for each SecureStore read in series. AppLockGate holds every
  // screen, SyncProvider, and SharedReceiptHandoff only until it has read the lock kind;
  // after that they mount beneath the lock screen, which covers them until unlock.
  return (
    <ActiveWorkspaceProvider subject={session.subject}>
      <ActiveLocalWorkspace>
        {session.status === "guest" ? (
          gate
        ) : (
          <AppLockGate subject={session.subject}>{gate}</AppLockGate>
        )}
      </ActiveLocalWorkspace>
    </ActiveWorkspaceProvider>
  );
}

/** Opens the local file of the workspace shown: personal, or the family switched to. */
function ActiveLocalWorkspace({ children }: PropsWithChildren) {
  const active = useActiveWorkspace();
  return (
    <LocalWorkspaceProvider subject={active.status === "ready" ? active.workspaceSubject : null}>
      {children}
    </LocalWorkspaceProvider>
  );
}

function LocalWorkspaceGate({
  identity,
  children,
}: PropsWithChildren<{ identity: ReturnType<typeof useWorkerIdentity> }>) {
  const local = useLocalWorkspace();
  useWorkspaceCurrencySync();
  useGoalProfileSync();
  usePetSync();
  usePetNotifications();
  usePushRegistration();
  if (local.status === "opening") {
    return <AppLoadingScreen accessibilityLabel="Opening encrypted local workspace" />;
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
      <InitialSyncGate>
        {children}
        <ScreenViewedTracker />
        <DailyReminderTapHandler />
        <FamilyPushTapHandler />
        <SubscriptionPushTapHandler />
        <SharedReceiptHandoff />
        <PlanLimitHost />
        <ThankYouHost />
        <AccountPromptHost />
        <UsageAnalyticsPromptHost />
      </InitialSyncGate>
    </SyncProvider>
  );
}

/**
 * Holds a freshly created workspace behind the loading screen until its first sync finishes, so
 * signing into an existing account on a new install does not flash empty setup and tutorial steps
 * before its records arrive. Already-synced workspaces open straight away, including offline.
 */
function InitialSyncGate({ children }: PropsWithChildren) {
  const session = useSessionSnapshot();
  const active = useActiveWorkspace();
  const sync = useSyncState();
  const [signingOut, setSigningOut] = useState(false);

  if (sync.hasSynced !== false) return children;
  if (sync.offline || sync.status === "failed" || sync.status === "full-resync-required") {
    const signOut = () => {
      if (signingOut) return;
      setSigningOut(true);
      void session.signOut().catch((error: unknown) => {
        setSigningOut(false);
        Alert.alert(
          "Couldn't sign out",
          error instanceof Error ? error.message : "Zoption could not sign you out.",
        );
      });
    };
    return (
      <View className="flex-1 items-center justify-center gap-3 px-6">
        <ErrorState
          title={sync.offline ? "You're offline" : "Couldn't sync your workspace"}
          message={
            sync.offline
              ? "Connect to the internet to finish syncing your workspace."
              : (sync.message ?? "Zoption could not finish syncing your workspace.")
          }
          onRetry={sync.retry}
        />
        {active.family ? (
          <Button variant="quiet" onPress={() => active.switchTo(null)}>
            Switch to Personal
          </Button>
        ) : (
          <Button variant="quiet" loading={signingOut} onPress={signOut}>
            Sign out
          </Button>
        )}
      </View>
    );
  }
  if (active.family) {
    return (
      <View className="flex-1">
        <AppLoadingScreen accessibilityLabel="Syncing your workspace" />
        <View className="items-center pb-10">
          <Button variant="quiet" onPress={() => active.switchTo(null)}>
            Switch to Personal
          </Button>
        </View>
      </View>
    );
  }
  return <AppLoadingScreen accessibilityLabel="Syncing your workspace" />;
}
