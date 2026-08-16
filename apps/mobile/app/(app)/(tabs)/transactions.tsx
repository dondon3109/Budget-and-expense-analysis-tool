import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useDeferredValue, useState } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { useLocalTransactions } from "@/db/local-workspace-state";
import { transactionKindFilters, type TransactionKindFilter } from "@/db/repository";
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
import { radii, spacing, touchTarget, typography } from "@/ui/tokens";
import { useZoptionTheme } from "@/ui/theme-provider";

const kindLabels: Record<TransactionKindFilter, string> = {
  all: "All",
  income: "Income",
  expense: "Expense",
  transfer: "Transfer",
};

function visibleSyncState(status: ReturnType<typeof useSyncState>["status"]) {
  if (status === "syncing") return "syncing" as const;
  if (status === "synced") return "synced" as const;
  if (status === "waiting") return "waiting" as const;
  return "failed" as const;
}

export default function TransactionsScreen() {
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<TransactionKindFilter>("all");
  const deferredSearch = useDeferredValue(search);
  const local = useLocalTransactions(deferredSearch, kind);
  const sync = useSyncState();
  const theme = useZoptionTheme();
  const filtering = search.trim().length > 0 || kind !== "all";

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
                // A clearly outlined surface box so the button is obvious
                // in every theme; pressing fills it with the soft brand tint.
                backgroundColor: pressed ? theme.colors.brandSoft : theme.colors.surfaceRaised,
                borderColor: theme.colors.brand,
              },
            ]}
          >
            <MaterialCommunityIcons
              accessibilityElementsHidden
              color={theme.colors.brand}
              name="plus"
              size={26}
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
      <View style={styles.filters}>
        <View
          style={[
            styles.searchBox,
            { backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.border },
          ]}
        >
          <MaterialCommunityIcons
            accessibilityElementsHidden
            color={theme.colors.textMuted}
            name="magnify"
            size={20}
          />
          <TextInput
            accessibilityLabel="Search transactions"
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={setSearch}
            placeholder="Search description or category"
            placeholderTextColor={theme.colors.textMuted}
            style={[styles.searchInput, { color: theme.colors.text }]}
            value={search}
          />
          {search.length > 0 ? (
            <Pressable
              accessibilityLabel="Clear search"
              accessibilityRole="button"
              hitSlop={8}
              onPress={() => setSearch("")}
            >
              <MaterialCommunityIcons
                accessibilityElementsHidden
                color={theme.colors.textMuted}
                name="close-circle"
                size={20}
              />
            </Pressable>
          ) : null}
        </View>
        <View accessibilityLabel="Filter by type" style={styles.chips}>
          {transactionKindFilters.map((filter) => {
            const selected = filter === kind;
            return (
              <Pressable
                key={filter}
                accessibilityLabel={kindLabels[filter]}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => setKind(filter)}
                style={[
                  styles.chip,
                  {
                    backgroundColor: selected ? theme.colors.brand : theme.colors.surfaceRaised,
                    borderColor: selected ? theme.colors.brand : theme.colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    typography.label,
                    { color: selected ? theme.colors.onBrand : theme.colors.text },
                  ]}
                >
                  {kindLabels[filter]}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
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
              title={filtering ? "No matching transactions" : "No transactions yet"}
              description={
                filtering
                  ? "Try a different search or filter."
                  : "Pull down to check for records. Synchronized records are read from encrypted local storage."
              }
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
    paddingHorizontal: spacing.sm,
    // A contained, boxed button: rounded corners, a visible ring, and a
    // shadow so it reads clearly against the canvas in any theme.
    borderRadius: radii.md,
    borderWidth: 1.5,
    shadowColor: "#000000",
    shadowOpacity: 0.22,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  filters: {
    gap: spacing.xs,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    minHeight: touchTarget,
    borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: spacing.sm,
  },
  searchInput: {
    flex: 1,
    minHeight: touchTarget,
    fontSize: 16,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  chip: {
    minHeight: touchTarget,
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
    borderRadius: radii.round,
    borderWidth: 1,
  },
});
