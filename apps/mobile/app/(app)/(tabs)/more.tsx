import { router } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";

import { useSessionSnapshot } from "@/auth/session-state";
import { useLocalWorkspace, useLocalWorkspaceStats } from "@/db/local-workspace-state";
import { Button, Card, ConfirmationDialog } from "@/ui/components";
import { ThemePicker } from "@/ui/theme-picker";
import { Screen } from "@/ui/screen";
import { useZoptionTheme } from "@/ui/theme-provider";
import { typography } from "@/ui/tokens";

export default function MoreScreen() {
  const session = useSessionSnapshot();
  const local = useLocalWorkspace();
  const localStats = useLocalWorkspaceStats();
  const theme = useZoptionTheme();
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
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

  return (
    <Screen
      title="More"
      description="Appearance is device-local and never contains financial records."
    >
      <Card accessibilityLabel="Financial setup">
        <View className="gap-3">
          <Text style={[typography.headline, { color: theme.colors.text }]}>Money setup</Text>
          <Text style={[typography.body, { color: theme.colors.textMuted }]}>
            Manage accounts and categories from encrypted local data, including while offline.
          </Text>
          <Button
            accessibilityHint="Opens native account and category management"
            variant="secondary"
            onPress={() => router.push("/(app)/money-setup")}
          >
            Accounts & categories
          </Button>
          <Button
            accessibilityHint="Opens the preview-first transaction importer"
            variant="secondary"
            onPress={() => router.push("/(app)/import")}
          >
            Import transactions
          </Button>
          <Button
            accessibilityHint="Opens savings goals"
            variant="secondary"
            onPress={() => router.push("/(app)/goals")}
          >
            Savings goals
          </Button>
          <Button
            accessibilityHint="Opens debt payoff planning"
            variant="secondary"
            onPress={() => router.push("/(app)/debts")}
          >
            Debts
          </Button>
          <Button
            accessibilityHint="Opens subscription tracking"
            variant="secondary"
            onPress={() => router.push("/(app)/subscriptions")}
          >
            Subscriptions
          </Button>
          <Button
            accessibilityHint="Opens the combined agenda calendar"
            variant="secondary"
            onPress={() => router.push("/(app)/calendar")}
          >
            Calendar
          </Button>
        </View>
      </Card>
      <Card accessibilityLabel="Local data protection status">
        <View className="gap-1">
          <Text style={[typography.headline, { color: theme.colors.text }]}>Local data</Text>
          <Text style={[typography.body, { color: theme.colors.textMuted }]}>
            Encrypted with SQLCipher
          </Text>
          <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
            Local schema version {local.workspace?.schemaVersion ?? "unavailable"}
          </Text>
        </View>
      </Card>
      <ThemePicker />
      <Card accessibilityLabel="Account session controls">
        <View className="gap-3">
          <Text style={[typography.headline, { color: theme.colors.text }]}>Session</Text>
          <Text style={[typography.body, { color: theme.colors.textMuted }]}>
            Signing out removes this account&apos;s encrypted local copy from this device after a
            safety check. Synced records remain in your Zoption workspace.
          </Text>
          {signOutError ? (
            <Text
              accessibilityRole="alert"
              style={[typography.body, { color: theme.colors.danger }]}
            >
              {signOutError}
            </Text>
          ) : null}
          <Button
            accessibilityHint="Checks for unsynchronized changes before removing the local workspace"
            disabled={!localStats.stats || signingOut}
            loading={signingOut}
            variant="secondary"
            onPress={() => setConfirmingSignOut(true)}
          >
            Sign out
          </Button>
        </View>
      </Card>
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
