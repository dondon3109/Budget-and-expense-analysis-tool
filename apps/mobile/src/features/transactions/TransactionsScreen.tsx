import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { router } from "expo-router";
import { useCallback, useDeferredValue, useMemo, useState } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useLocalTransactions, useLocalWorkspace } from "@/db/local-workspace-state";
import { transactionKindFilters, type TransactionKindFilter } from "@/db/view-models";
import { monthLabel } from "@/features/calendar/event-form";
import { useSyncState } from "@/sync/sync-state";
import { telemetry } from "@/telemetry/telemetry";
import {
  BottomSheet,
  Button,
  ConfirmationDialog,
  ErrorState,
  OfflineBanner,
  Skeleton,
  SyncPausedBanner,
} from "@/ui/components";
import { useZoptionTheme } from "@/ui/theme-provider";
import { radii, spacing, touchTarget, typography } from "@/ui/tokens";

import { SmsQuickPasteModal } from "./SmsQuickPasteModal";
import {
  categorySummary,
  groupTransactionsByDate,
  kindLabels,
  monthStartForDate,
  shiftMonthStart,
  summarizeTransactions,
} from "./transaction-list-view";
import { CategorySummaryRow, DateHeader, TotalsValue, TransactionItemRow } from "./TransactionRows";
import { TransactionsEmptyView } from "./TransactionsEmptyView";

type ViewMode = "daily" | "monthly" | "summary";

const viewTabs: Array<{ key: ViewMode; label: string }> = [
  { key: "daily", label: "Daily" },
  { key: "monthly", label: "Monthly" },
  { key: "summary", label: "Summary" },
];

function HeaderIcon({
  icon,
  label,
  selected,
  onPress,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  selected?: boolean;
  onPress: () => void;
}) {
  const theme = useZoptionTheme();
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ selected: Boolean(selected) }}
      android_ripple={{ color: "rgba(10, 117, 86, 0.12)", borderless: true }}
      hitSlop={4}
      onPress={onPress}
      style={styles.iconButton}
    >
      <MaterialCommunityIcons
        accessibilityElementsHidden
        color={selected ? theme.colors.brand : theme.colors.text}
        name={icon}
        size={26}
      />
    </Pressable>
  );
}

export function TransactionsScreen() {
  const [month, setMonth] = useState(() => monthStartForDate(new Date()));
  const [search, setSearch] = useState("");
  const [searchVisible, setSearchVisible] = useState(false);
  const [kind, setKind] = useState<TransactionKindFilter>("all");
  const [view, setView] = useState<ViewMode>("daily");
  const [smsQuickPasteVisible, setSmsQuickPasteVisible] = useState(false);
  const [netInfoVisible, setNetInfoVisible] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const deferredSearch = useDeferredValue(search);
  const local = useLocalTransactions(deferredSearch, kind, month);
  const workspace = useLocalWorkspace().workspace;
  const sync = useSyncState();
  const theme = useZoptionTheme();
  const filtering = search.trim().length > 0 || kind !== "all";

  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    sync.retry();
    local.retry();
    try {
      await new Promise((resolve) => setTimeout(resolve, 650));
    } finally {
      setRefreshing(false);
    }
  }, [local, sync]);

  const isRefreshing = refreshing || sync.status === "syncing";
  const refreshControl = (
    <RefreshControl
      colors={[String(theme.colors.brand)]}
      onRefresh={handleRefresh}
      progressBackgroundColor={String(theme.colors.surfaceRaised)}
      refreshing={isRefreshing}
      tintColor={String(theme.colors.brand)}
    />
  );

  const items = useMemo(() => local.items ?? [], [local.items]);
  const totals = useMemo(() => summarizeTransactions(items), [items]);
  const dateGroups = useMemo(() => groupTransactionsByDate(items), [items]);
  const summaryItems = useMemo(() => categorySummary(items), [items]);
  const existingTransactions = useMemo(
    () =>
      items.map((i) => ({
        id: i.transaction.id,
        date: i.transaction.date,
        amountMinor: i.transaction.amountMinor,
        description: i.transaction.description,
        notes: i.transaction.notes,
      })),
    [items],
  );

  // Derived from the live list, so a row that left the month or filter never
  // inflates the count, and select mode ends when nothing selected is visible.
  const selectedItems = useMemo(
    () => items.filter((i) => selectedIds.includes(i.transaction.id)),
    [items, selectedIds],
  );
  const selecting = selectedItems.length > 0;
  const toggleSelected = useCallback((id: string) => {
    setDeleteError(null);
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  }, []);

  const deleteSelected = async () => {
    setConfirmDelete(false);
    if (!workspace || deleting) return;
    setDeleting(true);
    setDeleteError(null);
    const deleted = new Set<string>();
    try {
      for (const { transaction } of selectedItems) {
        await workspace.transactionMutations.deleteTransaction(transaction.id);
        deleted.add(transaction.id);
        void telemetry.capture("transaction_deleted", {
          transaction_kind: transaction.kind === "transfer" ? "transfer" : "transaction",
        });
      }
    } catch (error) {
      // Rows after the failure stay selected so the user can retry.
      setDeleteError(
        error instanceof Error
          ? error.message
          : "The selected transactions could not be deleted from encrypted local storage.",
      );
    } finally {
      setSelectedIds((current) => current.filter((id) => !deleted.has(id)));
      setDeleting(false);
      if (deleted.size > 0) sync.retry();
    }
  };

  const emptyState = (
    <TransactionsEmptyView
      filtering={filtering}
      kind={kind}
      month={month}
      onGoToCurrentMonth={() => setMonth(monthStartForDate(new Date()))}
      onResetFilters={() => {
        setSearch("");
        setKind("all");
      }}
      search={search}
    />
  );

  const filterPanel = (
    <View style={[styles.filterPanel, { borderColor: theme.colors.border }]}>
      <View accessibilityLabel="Filter by transaction type" style={styles.chips}>
        {transactionKindFilters.map((filter) => {
          const selected = filter === kind;
          return (
            <Pressable
              key={filter}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => setKind(filter)}
              style={[
                styles.chip,
                {
                  backgroundColor: selected ? theme.colors.brand : theme.colors.surface,
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
      <Button
        accessibilityHint="Opens the SMS quick-paste sheet to parse a bank notification"
        icon="message-text-outline"
        onPress={() => setSmsQuickPasteVisible(true)}
        variant="secondary"
      >
        Paste SMS notification
      </Button>
    </View>
  );

  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      style={[styles.safe, { backgroundColor: theme.colors.canvas }]}
    >
      {selecting ? (
        <View style={styles.toolbar}>
          <View style={styles.toolbarSide}>
            <HeaderIcon
              icon="close"
              label="Cancel selection"
              onPress={() => {
                setSelectedIds([]);
                setDeleteError(null);
              }}
            />
          </View>
          <Text
            accessibilityLiveRegion="polite"
            numberOfLines={1}
            style={[styles.toolbarTitle, { color: theme.colors.text }]}
          >
            {selectedItems.length} selected
          </Text>
          <View style={[styles.toolbarSide, styles.toolbarRight]}>
            <HeaderIcon
              icon="trash-can-outline"
              label={`Delete ${selectedItems.length} selected`}
              onPress={() => setConfirmDelete(true)}
            />
          </View>
        </View>
      ) : (
        <View style={styles.toolbar}>
          <View style={styles.toolbarSide}>
            <HeaderIcon
              icon="magnify"
              label={searchVisible ? "Hide transaction search" : "Search transactions"}
              selected={searchVisible}
              onPress={() => setSearchVisible((visible) => !visible)}
            />
          </View>
          <Text numberOfLines={1} style={[styles.toolbarTitle, { color: theme.colors.text }]}>
            Transactions
          </Text>
          <View style={[styles.toolbarSide, styles.toolbarRight]}>
            <HeaderIcon
              icon="line-scan"
              label="Scan receipt"
              onPress={() => router.push("/(app)/receipt-scan")}
            />
            <HeaderIcon
              icon="tag-outline"
              label="Manage categories"
              onPress={() => router.push("/(app)/categories")}
            />
          </View>
        </View>
      )}

      {deleteError ? (
        <Text
          accessibilityRole="alert"
          style={[styles.deleteError, { color: theme.colors.danger }]}
        >
          {deleteError}
        </Text>
      ) : null}

      {searchVisible ? (
        <View style={styles.controlInset}>
          <View
            style={[
              styles.searchBox,
              { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
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
              autoFocus
              maxFontSizeMultiplier={1.2}
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
        </View>
      ) : null}

      <View style={styles.monthNav}>
        <HeaderIcon
          icon="chevron-left"
          label="Previous month"
          onPress={() => setMonth((value) => shiftMonthStart(value, -1))}
        />
        <Text accessibilityRole="header" style={[styles.monthTitle, { color: theme.colors.text }]}>
          {monthLabel(month)}
        </Text>
        <HeaderIcon
          icon="chevron-right"
          label="Next month"
          onPress={() => setMonth((value) => shiftMonthStart(value, 1))}
        />
      </View>

      <View
        accessibilityLabel="Transaction views"
        accessibilityRole="tablist"
        style={[styles.viewTabsContainer, { borderBottomColor: theme.colors.border }]}
      >
        {viewTabs.map((tab) => {
          const selected = tab.key === view;
          return (
            <Pressable
              key={tab.key}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              onPress={() => setView(tab.key)}
              style={[styles.viewTab, selected && { borderBottomColor: theme.colors.brand }]}
            >
              <Text
                style={[
                  typography.label,
                  {
                    color: selected ? theme.colors.text : theme.colors.textMuted,
                    fontWeight: selected ? "700" : "500",
                  },
                ]}
              >
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View
        style={[
          styles.monthTotals,
          { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
        ]}
      >
        <View style={styles.monthTotalColumn}>
          <Text style={[typography.caption, { color: theme.colors.textMuted }]}>Income</Text>
          <TotalsValue totals={totals} field="incomeMinor" tone="income" />
        </View>
        <View style={styles.monthTotalColumn}>
          <Text style={[typography.caption, { color: theme.colors.textMuted }]}>Expenses</Text>
          <TotalsValue totals={totals} field="expenseMinor" tone="expense" />
        </View>
        <View style={styles.monthTotalColumn}>
          <View style={styles.monthTotalLabel}>
            <Text style={[typography.caption, { color: theme.colors.textMuted }]}>Net</Text>
            <Pressable
              accessibilityHint="Opens an explanation of how Net is calculated"
              accessibilityLabel="What is Net?"
              accessibilityRole="button"
              hitSlop={12}
              onPress={() => setNetInfoVisible(true)}
              style={styles.netInfoButton}
            >
              <MaterialCommunityIcons
                accessibilityElementsHidden
                color={theme.colors.textMuted}
                name="help-circle-outline"
                size={14}
              />
            </Pressable>
          </View>
          <TotalsValue totals={totals} field="netMinor" tone="default" />
        </View>
      </View>

      <OfflineBanner />
      {sync.message && sync.status !== "waiting" ? (
        <SyncPausedBanner
          message={sync.message}
          onRetry={sync.retry}
          style={styles.syncBannerInset}
        />
      ) : null}
      {local.error ? (
        <ErrorState message={local.error} onRetry={local.retry} title="Local data unavailable" />
      ) : local.items === null ? (
        <View accessibilityLabel="Loading transactions" style={styles.loading}>
          <Skeleton height={72} />
          <Skeleton height={72} />
          <Skeleton height={72} />
        </View>
      ) : view === "daily" ? (
        <SectionList
          alwaysBounceVertical
          contentContainerStyle={[styles.listContent, dateGroups.length === 0 && styles.emptyList]}
          sections={dateGroups.map((group) => ({ ...group, data: group.items }))}
          keyExtractor={(item) => item.transaction.id}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={emptyState}
          ListHeaderComponent={filterPanel}
          refreshControl={refreshControl}
          renderItem={({ item }) => (
            <TransactionItemRow
              item={item}
              onToggleSelect={toggleSelected}
              selected={selectedIds.includes(item.transaction.id)}
              selecting={selecting}
            />
          )}
          extraData={selectedIds}
          renderSectionHeader={({ section }) => <DateHeader section={section} />}
          showsVerticalScrollIndicator={false}
          stickySectionHeadersEnabled
        />
      ) : view === "summary" ? (
        <FlatList
          alwaysBounceVertical
          contentContainerStyle={[
            styles.listContent,
            summaryItems.length === 0 && styles.emptyList,
          ]}
          data={summaryItems}
          keyExtractor={(item) => item.key}
          ListEmptyComponent={emptyState}
          ListHeaderComponent={filterPanel}
          refreshControl={refreshControl}
          renderItem={({ item }) => <CategorySummaryRow item={item} />}
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <FlatList
          alwaysBounceVertical
          contentContainerStyle={[styles.listContent, items.length === 0 && styles.emptyList]}
          data={items}
          keyExtractor={(item) => item.transaction.id}
          ListEmptyComponent={emptyState}
          ListHeaderComponent={filterPanel}
          refreshControl={refreshControl}
          extraData={selectedIds}
          renderItem={({ item }) => (
            <TransactionItemRow
              item={item}
              onToggleSelect={toggleSelected}
              selected={selectedIds.includes(item.transaction.id)}
              selecting={selecting}
              showDate
            />
          )}
          showsVerticalScrollIndicator={false}
        />
      )}

      {selecting ? null : (
        <View pointerEvents="box-none" style={styles.fabPosition}>
          <Pressable
            accessibilityLabel="Add transaction"
            accessibilityHint="Opens the new transaction form"
            accessibilityRole="button"
            android_ripple={{ color: "rgba(255, 255, 255, 0.22)", borderless: false, radius: 29 }}
            onPress={() => router.push("/(app)/transaction")}
            style={[styles.fabButton, { backgroundColor: theme.colors.brand }]}
          >
            <MaterialCommunityIcons
              accessibilityElementsHidden
              color={theme.colors.onBrand}
              name="plus"
              size={32}
            />
          </Pressable>
        </View>
      )}

      <ConfirmationDialog
        confirmLabel="Delete"
        destructive
        message="These are removed from this device. Anything already synchronized is queued for deletion on the server. A transfer is deleted with both of its ledger entries."
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => void deleteSelected()}
        title={
          selectedItems.length === 1
            ? "Delete transaction?"
            : `Delete ${selectedItems.length} transactions?`
        }
        visible={confirmDelete}
      />

      <BottomSheet
        visible={netInfoVisible}
        title="What is Net?"
        onDismiss={() => setNetInfoVisible(false)}
      >
        <View style={styles.netInfoBody}>
          <Text style={[typography.body, { color: theme.colors.text }]}>
            Net is income minus expenses for {monthLabel(month)}. It shows how much this month
            changed your money, not how much you have.
          </Text>
          <Text style={[typography.body, { color: theme.colors.textMuted }]}>
            Total Balance on Home is a different figure. It adds up every transaction ever recorded
            on each account.
          </Text>
          <Text style={[typography.body, { color: theme.colors.textMuted }]}>
            A balance adjustment counts as income or an expense, so correcting an account moves Net
            even when no money changed hands.
          </Text>
        </View>
      </BottomSheet>

      <SmsQuickPasteModal
        existingTransactions={existingTransactions}
        visible={smsQuickPasteVisible}
        onDismiss={() => setSmsQuickPasteVisible(false)}
        onApply={(parsed) => {
          setSmsQuickPasteVisible(false);
          router.push({
            pathname: "/(app)/transaction",
            params: {
              amount: (parsed.amountMinor / 100).toFixed(2),
              description: parsed.payeeOrMerchant,
              date: parsed.date,
              kind: parsed.type,
              category: parsed.suggestedCategory,
              referenceNumber: parsed.referenceNumber ?? "",
              channel: parsed.channel,
              accountSuffix: parsed.accountSuffix ?? "",
              currency: parsed.currency,
            },
          });
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  toolbar: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.sm,
  },
  toolbarSide: { width: 96, flexDirection: "row", alignItems: "center" },
  toolbarRight: { justifyContent: "flex-end" },
  toolbarTitle: { ...typography.title, textAlign: "center", flexShrink: 1 },
  iconButton: {
    width: touchTarget,
    height: touchTarget,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.round,
  },
  controlInset: { paddingHorizontal: spacing.md, paddingBottom: spacing.xs },
  searchBox: {
    minHeight: touchTarget,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: spacing.sm,
  },
  searchInput: { flex: 1, minHeight: touchTarget, fontSize: 16 },
  monthNav: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.xs,
  },
  monthTitle: { ...typography.headline, textAlign: "center" },
  viewTabsContainer: {
    flexDirection: "row",
    paddingHorizontal: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  viewTab: {
    flex: 1,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderBottomWidth: 3,
    borderBottomColor: "transparent",
    marginBottom: -StyleSheet.hairlineWidth,
  },
  monthTotals: {
    minHeight: 72,
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  monthTotalColumn: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    paddingHorizontal: spacing.xxs,
  },
  monthTotalLabel: { flexDirection: "row", alignItems: "center", gap: spacing.xxs },
  netInfoButton: {
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.round,
  },
  netInfoBody: { gap: spacing.sm },
  deleteError: { ...typography.caption, paddingHorizontal: spacing.md, paddingBottom: spacing.xs },
  filterPanel: {
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  chip: {
    minHeight: 36,
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
    borderRadius: radii.round,
    borderWidth: 1,
  },
  loading: { gap: spacing.xs, padding: spacing.md },
  syncBannerInset: { width: "auto", marginHorizontal: spacing.md, marginVertical: spacing.sm },
  listContent: { paddingBottom: 96 },
  emptyList: { flexGrow: 1 },
  fabPosition: {
    position: "absolute",
    right: spacing.md,
    bottom: spacing.md,
    width: 58,
    height: 58,
    borderRadius: 29,
    elevation: 6,
    shadowColor: "#000000",
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  fabButton: {
    width: 58,
    height: 58,
    borderRadius: 29,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
});
