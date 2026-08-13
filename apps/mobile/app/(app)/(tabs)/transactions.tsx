import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from "react-native";

import { useLocalTransactions } from "@/db/local-workspace-state";
import { useSyncState } from "@/sync/sync-state";
import {
  EmptyState,
  ErrorState,
  OfflineBanner,
  Skeleton,
  SyncStatus,
  TransactionRow,
} from "@/ui/components";
import { Screen } from "@/ui/screen";
import { spacing, touchTarget } from "@/ui/tokens";
import { useZoptionTheme } from "@/ui/theme-provider";

function visibleSyncState(status: ReturnType<typeof useSyncState>["status"]) {
  if (status === "syncing") return "syncing" as const;
  if (status === "synced") return "synced" as const;
  if (status === "waiting") return "waiting" as const;
  return "failed" as const;
}

export default function TransactionsScreen() {
  const local = useLocalTransactions();
  const sync = useSyncState();
  const theme = useZoptionTheme();
  return (
    <Screen
      action={
        <View className="flex-row items-center gap-2">
          <SyncStatus state={visibleSyncState(sync.status)} />
          <Pressable
            accessibilityLabel="Add transaction"
            accessibilityHint="Opens the new transaction form"
            accessibilityRole="button"
            onPress={() => router.push("/(app)/transaction")}
            style={({ pressed }) => [
              styles.add,
              {
                backgroundColor: pressed ? theme.colors.brandPressed : theme.colors.brand,
              },
            ]}
          >
            <MaterialCommunityIcons
              accessibilityElementsHidden
              color={theme.colors.onBrand}
              name="plus"
              size={24}
            />
          </Pressable>
        </View>
      }
      scroll={false}
      title="Transactions"
    >
      <OfflineBanner />
      {sync.message && sync.status !== "waiting" ? (
        <ErrorState message={sync.message} onRetry={sync.retry} title="Sync paused" />
      ) : null}
      {local.error ? (
        <ErrorState message={local.error} onRetry={local.retry} title="Local data unavailable" />
      ) : local.items === null ? (
        <View accessibilityLabel="Loading transactions" style={{ gap: spacing.sm }}>
          <Skeleton height={56} />
          <Skeleton height={56} />
          <Skeleton height={56} />
        </View>
      ) : (
        <FlatList
          alwaysBounceVertical
          contentContainerStyle={local.items.length === 0 ? { flexGrow: 1 } : undefined}
          data={local.items}
          keyExtractor={(item) => item.transaction.id}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <EmptyState
              title={
                sync.status === "syncing" ? "Checking for transactions…" : "No transactions yet"
              }
              description="Pull down to check for records. Synchronized records are read from encrypted local storage."
            />
          }
          refreshControl={
            <RefreshControl refreshing={sync.status === "syncing"} onRefresh={sync.retry} />
          }
          renderItem={({ item }) => (
            <TransactionRow
              conflicted={item.syncState === "conflicted"}
              failed={item.syncState === "failed"}
              onPress={() =>
                router.push({ pathname: "/(app)/transaction", params: { id: item.transaction.id } })
              }
              pending={item.syncState === "pending"}
              transaction={item.transaction}
            />
          )}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  add: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: touchTarget,
    minWidth: touchTarget,
    borderRadius: touchTarget / 2,
  },
});
