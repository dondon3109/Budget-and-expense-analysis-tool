import { router } from "expo-router";
import { useCallback, useState } from "react";
import { Text } from "react-native";

import { useNetInfo } from "@react-native-community/netinfo";
import { usePlan } from "@/auth/plan-state";
import { useSessionSnapshot } from "@/auth/session-state";
import { isDevelopmentAppVariant } from "@/config/app-variant";
import { seedDummyWorkspaceData } from "@/db/demo-seed";
import { useLocalWorkspace, useLocalWorkspaceStats } from "@/db/local-workspace-state";
import { useSyncState } from "@/sync/sync-state";
import { PreferenceCards } from "@/features/settings/PreferenceCards";
import { UpdateSettingsCard } from "@/features/updates";
import { ConfirmationDialog, MenuGroup, MenuRow } from "@/ui/components";
import { Screen } from "@/ui/screen";
import { useZoptionTheme } from "@/ui/theme-provider";
import { typography } from "@/ui/tokens";

export function MoreScreen() {
  const demoEnabled = isDevelopmentAppVariant();
  const session = useSessionSnapshot();
  const planState = usePlan();
  const local = useLocalWorkspace();
  const localStats = useLocalWorkspaceStats();
  const theme = useZoptionTheme();
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [seedSuccess, setSeedSuccess] = useState(false);

  const handleSeedData = async (): Promise<void> => {
    if (!demoEnabled || !local.workspace || seeding) return;
    setSeeding(true);
    try {
      await seedDummyWorkspaceData(local.workspace.database);
      setSeedSuccess(true);
      setTimeout(() => setSeedSuccess(false), 3000);
    } finally {
      setSeeding(false);
    }
  };

  const unsyncedCount =
    (localStats.stats?.unsyncedOperationCount ?? 0) +
    (localStats.stats?.unresolvedConflictCount ?? 0);

  const confirmSignOut = async (): Promise<void> => {
    setSigningOut(true);
    setSignOutError(null);
    try {
      await session.signOut({ discardUnsyncedChanges: unsyncedCount > 0 });
    } catch (error) {
      setConfirmingSignOut(false);
      setSignOutError(error instanceof Error ? error.message : "Zoption could not sign you out.");
    } finally {
      setSigningOut(false);
    }
  };

  const isPro = planState.plan === "zoption_pro";
  const netInfo = useNetInfo();
  const isOffline = netInfo.isConnected === false || netInfo.isInternetReachable === false;
  const sync = useSyncState();
  const handleRefresh = useCallback(async () => {
    sync.retry();
    await new Promise((resolve) => setTimeout(resolve, 650));
  }, [sync]);

  return (
    <Screen onRefresh={handleRefresh} refreshing={sync.status === "syncing"} title="More">
      <MenuGroup title="Tools">
        <MenuRow
          icon={isOffline ? "robot-off-outline" : "robot-happy-outline"}
          title="AI Assistant"
          value={isOffline ? "Offline" : undefined}
          onPress={() => router.push("/(app)/assistant")}
        />
        <MenuRow
          icon="wallet-outline"
          title="Accounts & categories"
          onPress={() => router.push("/(app)/money-setup")}
        />
        <MenuRow
          icon="file-document-outline"
          title="Import transactions"
          onPress={() => router.push("/(app)/import")}
        />
        <MenuRow icon="target" title="Savings goals" onPress={() => router.push("/(app)/goals")} />
        <MenuRow
          icon="credit-card-refund-outline"
          title="Debts"
          onPress={() => router.push("/(app)/debts")}
        />
        <MenuRow
          icon="calendar-sync-outline"
          title="Subscriptions"
          onPress={() => router.push("/(app)/subscriptions")}
        />
        <MenuRow
          icon="calendar-month-outline"
          title="Calendar"
          onPress={() => router.push("/(app)/calendar")}
        />
      </MenuGroup>

      <PreferenceCards />

      <MenuGroup title="Support">
        <MenuRow
          icon="star-outline"
          title="Plan & billing"
          badge={isPro ? "PRO" : "FREE"}
          onPress={() => router.push("/(app)/plan-billing")}
        />
        <MenuRow
          icon="help-circle-outline"
          title="Help & support"
          onPress={() => router.push("/(app)/support")}
        />
        <MenuRow
          icon="book-open-page-variant-outline"
          title="Tutorials & guides"
          onPress={() => router.push("/(app)/tutorials")}
        />
        <MenuRow
          icon="account-cog-outline"
          title="Account"
          onPress={() => router.push("/(app)/account")}
        />
      </MenuGroup>

      {demoEnabled ? (
        <MenuGroup title="Demo data">
          <MenuRow
            icon={
              seeding
                ? "timer-sand"
                : seedSuccess
                  ? "check-circle-outline"
                  : "database-plus-outline"
            }
            title={seedSuccess ? "Demo data added" : "Add demo data"}
            onPress={() => void handleSeedData()}
          />
        </MenuGroup>
      ) : null}

      <UpdateSettingsCard />

      <MenuGroup>
        <MenuRow
          icon="logout"
          title="Sign out"
          tone="danger"
          disabled={!localStats.stats || signingOut}
          onPress={() => setConfirmingSignOut(true)}
        />
      </MenuGroup>
      {signOutError ? (
        <Text accessibilityRole="alert" style={[typography.body, { color: theme.colors.danger }]}>
          {signOutError}
        </Text>
      ) : null}
      <Text style={[typography.caption, { color: theme.colors.textMuted, textAlign: "center" }]}>
        Encrypted on this device · schema {local.workspace?.schemaVersion ?? "ready"}
      </Text>

      <ConfirmationDialog
        confirmLabel={unsyncedCount > 0 ? "Discard and sign out" : "Sign out"}
        destructive={unsyncedCount > 0}
        message={
          unsyncedCount > 0
            ? `${unsyncedCount} local change${unsyncedCount === 1 ? " has" : "s have"} not been safely synchronized. Signing out now permanently removes that work from this device.`
            : "Your encrypted local copy will be removed from this device. Records already synchronized with Zoption will remain available when you sign in again."
        }
        title={unsyncedCount > 0 ? "Discard local changes?" : "Sign out of Zoption?"}
        visible={confirmingSignOut}
        onCancel={() => setConfirmingSignOut(false)}
        onConfirm={() => void confirmSignOut()}
      />
    </Screen>
  );
}
