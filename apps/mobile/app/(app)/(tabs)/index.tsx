import { Text, View } from "react-native";

import { useLocalWorkspaceStats } from "@/db/local-workspace-state";
import { useSyncState } from "@/sync/sync-state";
import { Card, EmptyState, ErrorState, OfflineBanner, SyncStatus } from "@/ui/components";
import { Screen } from "@/ui/screen";
import { useZoptionTheme } from "@/ui/theme-provider";
import { typography } from "@/ui/tokens";

export default function HomeScreen() {
  const local = useLocalWorkspaceStats();
  const sync = useSyncState();
  const theme = useZoptionTheme();
  const syncState =
    sync.status === "syncing"
      ? "syncing"
      : sync.status === "synced"
        ? "synced"
        : sync.status === "waiting"
          ? "waiting"
          : "failed";
  const hasRecords = Boolean(
    local.stats &&
    (local.stats.accountCount > 0 ||
      local.stats.categoryCount > 0 ||
      local.stats.transactionCount > 0),
  );
  return (
    <Screen action={<SyncStatus state={syncState} />} title="Home">
      <OfflineBanner />
      {sync.message && sync.status !== "waiting" ? (
        <ErrorState message={sync.message} onRetry={sync.retry} title="Sync paused" />
      ) : null}
      {local.error ? (
        <ErrorState message={local.error} title="Local data unavailable" />
      ) : hasRecords && local.stats ? (
        <Card accessibilityLabel="Encrypted local workspace summary">
          <View className="gap-2">
            <Text style={[typography.headline, { color: theme.colors.text }]}>
              Local data ready
            </Text>
            <Text style={[typography.body, { color: theme.colors.textMuted }]}>
              {`${local.stats.accountCount} accounts · ${local.stats.categoryCount} categories · ${local.stats.transactionCount} transactions`}
            </Text>
            <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
              Financial screens read this encrypted copy first. Server changes appear only after a
              complete pull page is committed locally.
            </Text>
          </View>
        </Card>
      ) : (
        <EmptyState
          title={sync.status === "syncing" ? "Checking your workspace…" : "No local records yet"}
          description="Previously synchronized records remain available here even when you’re offline."
        />
      )}
    </Screen>
  );
}
