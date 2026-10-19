import type { FamilyDeletedEntry } from "@zoption/shared";
import { useCallback, useEffect, useState } from "react";
import { Text, View } from "react-native";

import { getFamilyDeletedEntries, restoreFamilyEntry } from "@/api/family";
import { useSessionSnapshot } from "@/auth/session-state";
import { useSyncState } from "@/sync/sync-state";
import { Button, Card, EmptyState, ErrorState, formatMoneyMinor, Skeleton } from "@/ui/components";
import { Screen } from "@/ui/screen";
import { useZoptionTheme } from "@/ui/theme-provider";
import { spacing, typography } from "@/ui/tokens";

import { useActiveWorkspace } from "./active-workspace";
import { formatFamilyTime } from "./entry-history";
import { useFamilyApi } from "./use-family-api";

/**
 * The family's entries deleted in the last 30 days. The owner restores any of them, anyone else
 * only what they deleted; a restored entry comes back with the next sync. Needs a connection.
 */
export function FamilyDeletedScreen() {
  const theme = useZoptionTheme();
  const me = useSessionSnapshot().subject;
  const role = useActiveWorkspace().family?.role;
  const familyApi = useFamilyApi();
  const sync = useSyncState();
  const [entries, setEntries] = useState<FamilyDeletedEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!familyApi) return;
    setError(null);
    void familyApi(getFamilyDeletedEntries)
      .then(setEntries)
      .catch((cause: unknown) =>
        setError(
          cause instanceof Error ? cause.message : "Recently deleted entries could not be loaded.",
        ),
      );
  }, [familyApi]);
  useEffect(load, [load]);

  const restore = async (transactionId: string) => {
    if (!familyApi) return;
    setRestoring(transactionId);
    try {
      await familyApi((api) => restoreFamilyEntry(api, transactionId));
      setEntries((current) =>
        (current ?? []).filter((entry) => entry.transactionId !== transactionId),
      );
      sync.retry();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The entry could not be restored.");
    } finally {
      setRestoring(null);
    }
  };

  return (
    <Screen
      description="Deleted family entries can be restored for 30 days."
      edges={["bottom", "left", "right"]}
      title="Recently deleted"
    >
      {error ? <ErrorState message={error} onRetry={load} title="Not available offline" /> : null}
      {!entries && !error ? <Skeleton height={96} /> : null}
      {entries?.length === 0 ? (
        <EmptyState description="Nothing was deleted in this family recently." title="All clear" />
      ) : null}
      {entries?.map((deleted) => (
        <Card key={deleted.transactionId} style={{ gap: spacing.xs }}>
          <View className="flex-row justify-between gap-3">
            <Text style={[typography.headline, { color: theme.colors.text, flex: 1 }]}>
              {deleted.entry.description}
            </Text>
            <Text style={[typography.headline, { color: theme.colors.text }]}>
              {formatMoneyMinor(deleted.entry.amountMinor, deleted.entry.currency)}
            </Text>
          </View>
          <Text style={[typography.callout, { color: theme.colors.textMuted }]}>
            {deleted.entry.categoryName} · {deleted.entry.accountName} · deleted{" "}
            {formatFamilyTime(deleted.deletedAt)}
          </Text>
          {role === "owner" || (role !== "viewer" && deleted.deletedByUserId === me) ? (
            <Button
              loading={restoring === deleted.transactionId}
              onPress={() => void restore(deleted.transactionId)}
              variant="secondary"
            >
              Restore
            </Button>
          ) : null}
        </Card>
      ))}
    </Screen>
  );
}
