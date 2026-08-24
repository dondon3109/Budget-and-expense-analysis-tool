import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useDeferredValue, useMemo, useState } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  SectionList,
  StyleSheet,
  Text as NativeText,
  TextInput,
  View,
  type TextProps,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import type { Currency } from "@zoption/shared";
import { useLocalTransactions } from "@/db/local-workspace-state";
import {
  transactionKindFilters,
  type LocalTransactionItem,
  type TransactionKindFilter,
} from "@/db/repository";
import { monthLabel } from "@/features/calendar/event-form";
import {
  groupTransactionsByDate,
  monthStartForDate,
  shiftMonthStart,
  summarizeTransactions,
  transactionDayLabel,
  type TransactionDateGroup,
  type TransactionTotals,
  type TransactionTotalsByCurrency,
} from "@/features/transactions/transaction-list-view";
import { useSyncState } from "@/sync/sync-state";
import {
  Button,
  EmptyState,
  ErrorState,
  MoneyValue,
  OfflineBanner,
  Skeleton,
  SyncStatus,
} from "@/ui/components";
import { useZoptionTheme } from "@/ui/theme-provider";
import { radii, spacing, touchTarget, typography } from "@/ui/tokens";

const kindLabels: Record<TransactionKindFilter, string> = {
  all: "All",
  income: "Income",
  expense: "Expenses",
  transfer: "Transfers",
};

const currencies: Currency[] = ["PHP", "USD"];
type ViewMode = "daily" | "monthly" | "summary" | "description";

const viewTabs: Array<{ key: ViewMode | "calendar"; label: string }> = [
  { key: "daily", label: "Daily" },
  { key: "calendar", label: "Calendar" },
  { key: "monthly", label: "Monthly" },
  { key: "summary", label: "Summary" },
  { key: "description", label: "Description" },
];

// Dense ledger columns need a bounded scale to remain distinguishable when a
// device uses very large display text. Screen readers still receive full copy.
function Text(props: TextProps) {
  return <NativeText maxFontSizeMultiplier={1.2} {...props} />;
}

function visibleSyncState(status: ReturnType<typeof useSyncState>["status"]) {
  if (status === "syncing") return "syncing" as const;
  if (status === "synced") return "synced" as const;
  if (status === "waiting") return "waiting" as const;
  return "failed" as const;
}

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
      android_ripple={{ color: "rgba(15, 107, 91, 0.12)", borderless: true }}
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

function TotalsValue({
  totals,
  field,
  tone,
}: {
  totals: TransactionTotalsByCurrency;
  field: keyof TransactionTotals;
  tone: "default" | "income" | "expense";
}) {
  const populated = currencies.filter((currency) => totals[currency] !== undefined);
  const visibleCurrencies = populated.length > 0 ? populated : (["PHP"] as Currency[]);
  return (
    <View style={styles.totalValues}>
      {visibleCurrencies.map((currency) => {
        const amount = totals[currency]?.[field] ?? 0;
        return (
          <MoneyValue
            key={currency}
            amountMinor={amount}
            currency={currency}
            tone={tone === "default" && amount < 0 ? "expense" : tone}
            maxFontSizeMultiplier={1.2}
            numberOfLines={1}
            style={styles.totalMoney}
          />
        );
      })}
    </View>
  );
}

function TransactionItemRow({
  item,
  showDate = false,
}: {
  item: LocalTransactionItem;
  showDate?: boolean;
}) {
  const theme = useZoptionTheme();
  const { transaction } = item;
  const stateLabel =
    item.syncState === "conflicted"
      ? "Needs review"
      : item.syncState === "failed"
        ? "Sync failed"
        : item.syncState === "pending"
          ? "Pending"
          : null;
  const tone =
    transaction.kind === "income"
      ? "income"
      : transaction.kind === "expense"
        ? "expense"
        : "default";
  return (
    <Pressable
      accessibilityLabel={`${transaction.description}, ${transaction.categoryName}, ${transaction.date}`}
      accessibilityHint="Opens transaction details"
      accessibilityRole="button"
      android_ripple={{ color: "rgba(15, 107, 91, 0.12)", borderless: false }}
      className="w-full flex-row items-center"
      onPress={() =>
        router.push({ pathname: "/(app)/transaction", params: { id: transaction.id } })
      }
      style={({ pressed }) => [
        styles.transactionRow,
        { backgroundColor: pressed ? theme.colors.canvasMuted : theme.colors.surface },
      ]}
    >
      <View style={styles.categoryColumn}>
        <View style={styles.categoryLine}>
          <View style={[styles.categoryDot, { backgroundColor: transaction.categoryColor }]} />
          <Text numberOfLines={2} style={[typography.caption, { color: theme.colors.textMuted }]}>
            {transaction.categoryName}
          </Text>
        </View>
      </View>
      <View style={styles.descriptionColumn}>
        <Text
          numberOfLines={1}
          style={[typography.body, { color: theme.colors.text, fontWeight: "600" }]}
        >
          {transaction.description}
        </Text>
        <Text numberOfLines={1} style={[typography.caption, { color: theme.colors.textMuted }]}>
          {transaction.accountName}
          {showDate ? ` · ${transaction.date}` : ""}
          {stateLabel ? ` · ${stateLabel}` : ""}
        </Text>
      </View>
      <MoneyValue
        amountMinor={transaction.amountMinor}
        currency={transaction.currency}
        maxFontSizeMultiplier={1.2}
        numberOfLines={1}
        style={styles.rowMoney}
        tone={tone}
      />
    </Pressable>
  );
}

function DateHeader({ section }: { section: TransactionDateGroup }) {
  const theme = useZoptionTheme();
  const label = transactionDayLabel(section.date);
  return (
    <View
      accessibilityLabel={`Transactions for ${section.date}`}
      style={[
        styles.dateHeader,
        { backgroundColor: theme.colors.canvasMuted, borderColor: theme.colors.border },
      ]}
    >
      <View style={styles.dateIdentity}>
        <Text style={[styles.dayNumber, { color: theme.colors.text }]}>{label.day}</Text>
        <View style={[styles.weekdayPill, { backgroundColor: theme.colors.border }]}>
          <Text style={[typography.caption, { color: theme.colors.text }]}>{label.weekday}</Text>
        </View>
      </View>
      <View style={styles.dayTotals}>
        <View style={styles.dayTotalColumn}>
          <Text style={[styles.dayTotalLabel, { color: theme.colors.textMuted }]}>INCOME</Text>
          <TotalsValue totals={section.totals} field="incomeMinor" tone="income" />
        </View>
        <View style={styles.dayTotalColumn}>
          <Text style={[styles.dayTotalLabel, { color: theme.colors.textMuted }]}>EXPENSES</Text>
          <TotalsValue totals={section.totals} field="expenseMinor" tone="expense" />
        </View>
      </View>
    </View>
  );
}

interface CategorySummaryItem {
  key: string;
  name: string;
  color: string;
  currency: Currency;
  incomeMinor: number;
  expenseMinor: number;
  transferMinor: number;
}

function categorySummary(items: readonly LocalTransactionItem[]): CategorySummaryItem[] {
  const rows = new Map<string, CategorySummaryItem>();
  for (const item of items) {
    const { transaction } = item;
    const key = `${transaction.categoryId}:${transaction.currency}`;
    const row = rows.get(key) ?? {
      key,
      name: transaction.categoryName,
      color: transaction.categoryColor,
      currency: transaction.currency,
      incomeMinor: 0,
      expenseMinor: 0,
      transferMinor: 0,
    };
    if (transaction.kind === "income") row.incomeMinor += Math.abs(transaction.amountMinor);
    if (transaction.kind === "expense") row.expenseMinor += Math.abs(transaction.amountMinor);
    if (transaction.kind === "transfer") row.transferMinor += Math.abs(transaction.amountMinor);
    rows.set(key, row);
  }
  return [...rows.values()].sort(
    (left, right) =>
      right.expenseMinor + right.incomeMinor + right.transferMinor -
        (left.expenseMinor + left.incomeMinor + left.transferMinor) ||
      left.name.localeCompare(right.name),
  );
}

export default function TransactionsScreen() {
  const [month, setMonth] = useState(() => monthStartForDate(new Date()));
  const [search, setSearch] = useState("");
  const [searchVisible, setSearchVisible] = useState(false);
  const [filtersVisible, setFiltersVisible] = useState(false);
  const [kind, setKind] = useState<TransactionKindFilter>("all");
  const [view, setView] = useState<ViewMode>("daily");
  const deferredSearch = useDeferredValue(search);
  const local = useLocalTransactions(deferredSearch, kind, month);
  const sync = useSyncState();
  const theme = useZoptionTheme();
  const filtering = search.trim().length > 0 || kind !== "all";

  const items = local.items ?? [];
  const totals = useMemo(() => summarizeTransactions(items), [items]);
  const dateGroups = useMemo(() => groupTransactionsByDate(items), [items]);
  const monthlyItems = useMemo(
    () =>
      view === "description"
        ? [...items].sort((left, right) =>
            left.transaction.description.localeCompare(right.transaction.description),
          )
        : items,
    [items, view],
  );
  const summaryItems = useMemo(() => categorySummary(items), [items]);

  const chooseView = (next: ViewMode | "calendar") => {
    if (next === "calendar") {
      router.push("/(app)/calendar");
      return;
    }
    setView(next);
  };

  const emptyState = (
    <EmptyState
      icon={filtering ? "magnify" : "swap-vertical"}
      title={filtering ? "No matching transactions" : "No transactions this month"}
      description={
        filtering
          ? "Try a different search or filter."
          : "Choose another month or add your first transaction."
      }
      action={
        !filtering ? (
          <Button onPress={() => router.push("/(app)/transaction")} variant="secondary">
            Add transaction
          </Button>
        ) : undefined
      }
    />
  );

  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      style={[styles.safe, { backgroundColor: theme.colors.canvas }]}
    >
      <View style={styles.toolbar}>
        <View style={styles.toolbarSide}>
          <HeaderIcon
            icon="magnify"
            label={searchVisible ? "Hide transaction search" : "Search transactions"}
            selected={searchVisible}
            onPress={() => setSearchVisible((visible) => !visible)}
          />
        </View>
        <Text numberOfLines={1} style={[styles.toolbarTitle, { color: theme.colors.text }]}>Transactions</Text>
        <View style={[styles.toolbarSide, styles.toolbarRight]}>
          <HeaderIcon
            icon="line-scan"
            label="Scan receipt"
            onPress={() => router.push("/(app)/receipt-scan")}
          />
          <HeaderIcon
            icon="tune-variant"
            label={filtersVisible ? "Hide transaction filters" : "Filter transactions"}
            selected={filtersVisible || kind !== "all"}
            onPress={() => setFiltersVisible((visible) => !visible)}
          />
        </View>
      </View>

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

      <ScrollView
        accessibilityLabel="Transaction views"
        horizontal
        contentContainerStyle={styles.viewTabs}
        showsHorizontalScrollIndicator={false}
      >
        {viewTabs.map((tab) => {
          const selected = tab.key === view;
          return (
            <Pressable
              key={tab.key}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              onPress={() => chooseView(tab.key)}
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
      </ScrollView>

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
          <Text style={[typography.caption, { color: theme.colors.textMuted }]}>Net</Text>
          <TotalsValue totals={totals} field="netMinor" tone="default" />
        </View>
      </View>

      {filtersVisible ? (
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
          <SyncStatus state={visibleSyncState(sync.status)} />
        </View>
      ) : null}

      <OfflineBanner />
      {sync.message && sync.status !== "waiting" ? (
        <ErrorState message={sync.message} onRetry={sync.retry} title="Sync paused" />
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
          contentContainerStyle={[
            styles.listContent,
            dateGroups.length === 0 && styles.emptyList,
          ]}
          sections={dateGroups.map((group) => ({ ...group, data: group.items }))}
          keyExtractor={(item) => item.transaction.id}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={emptyState}
          refreshControl={
            <RefreshControl
              refreshing={sync.status === "syncing"}
              onRefresh={sync.retry}
              tintColor={String(theme.colors.brand)}
            />
          }
          renderItem={({ item }) => <TransactionItemRow item={item} />}
          renderSectionHeader={({ section }) => <DateHeader section={section} />}
          showsVerticalScrollIndicator={false}
          stickySectionHeadersEnabled={false}
        />
      ) : view === "summary" ? (
        <FlatList
          contentContainerStyle={[
            styles.listContent,
            summaryItems.length === 0 && styles.emptyList,
          ]}
          data={summaryItems}
          keyExtractor={(item) => item.key}
          ListEmptyComponent={emptyState}
          refreshControl={
            <RefreshControl
              refreshing={sync.status === "syncing"}
              onRefresh={sync.retry}
              tintColor={String(theme.colors.brand)}
            />
          }
          renderItem={({ item }) => (
            <View
              style={[
                styles.summaryRow,
                { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
              ]}
            >
              <View style={[styles.summaryDot, { backgroundColor: item.color }]} />
              <Text
                numberOfLines={1}
                style={[typography.body, styles.summaryName, { color: theme.colors.text }]}
              >
                {item.name}
              </Text>
              <MoneyValue
                amountMinor={
                  item.incomeMinor > 0
                    ? item.incomeMinor
                    : item.expenseMinor > 0
                      ? item.expenseMinor
                      : item.transferMinor
                }
                currency={item.currency}
                maxFontSizeMultiplier={1.2}
                tone={
                  item.incomeMinor > 0
                    ? "income"
                    : item.expenseMinor > 0
                      ? "expense"
                      : "default"
                }
                style={styles.rowMoney}
              />
            </View>
          )}
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <FlatList
          contentContainerStyle={[
            styles.listContent,
            monthlyItems.length === 0 && styles.emptyList,
          ]}
          data={monthlyItems}
          keyExtractor={(item) => item.transaction.id}
          ListEmptyComponent={emptyState}
          refreshControl={
            <RefreshControl
              refreshing={sync.status === "syncing"}
              onRefresh={sync.retry}
              tintColor={String(theme.colors.brand)}
            />
          }
          renderItem={({ item }) => <TransactionItemRow item={item} showDate />}
          showsVerticalScrollIndicator={false}
        />
      )}

      <View pointerEvents="box-none" style={styles.fabPosition}>
        <Pressable
          accessibilityLabel="Add transaction"
          accessibilityHint="Opens the new transaction form"
          accessibilityRole="button"
          android_ripple={{ color: "rgba(255, 255, 255, 0.22)", borderless: true }}
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
  viewTabs: { minWidth: "100%", paddingHorizontal: spacing.xs },
  viewTab: {
    minHeight: touchTarget,
    paddingHorizontal: spacing.xs,
    alignItems: "center",
    justifyContent: "center",
    borderBottomWidth: 3,
    borderBottomColor: "transparent",
  },
  monthTotals: {
    minHeight: 72,
    flexDirection: "row",
    borderTopWidth: StyleSheet.hairlineWidth,
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
  totalValues: { alignItems: "center", minWidth: 0 },
  totalMoney: { fontSize: 16, lineHeight: 21, fontWeight: "600" },
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
  listContent: { paddingBottom: 96 },
  emptyList: { flexGrow: 1 },
  dateHeader: {
    minHeight: 62,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  dateIdentity: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  dayNumber: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  weekdayPill: {
    minWidth: 38,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xxs,
    borderRadius: radii.sm,
    alignItems: "center",
  },
  dayTotals: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  dayTotalColumn: { minWidth: 72, alignItems: "flex-end" },
  dayTotalLabel: { fontSize: 10, lineHeight: 13, fontWeight: "700", letterSpacing: 0.4 },
  transactionRow: {
    minHeight: 72,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    gap: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(127, 127, 127, 0.18)",
  },
  categoryColumn: { width: 88, flexShrink: 0 },
  categoryLine: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  categoryDot: { width: 9, height: 9, borderRadius: radii.round, flexShrink: 0 },
  descriptionColumn: { flex: 1, minWidth: 0, gap: 2 },
  rowMoney: { fontSize: 17, lineHeight: 22, fontWeight: "600", flexShrink: 0 },
  summaryRow: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  summaryDot: { width: 10, height: 10, borderRadius: radii.round },
  summaryName: { flex: 1, minWidth: 0 },
  fabPosition: {
    position: "absolute",
    right: spacing.lg,
    bottom: spacing.lg,
  },
  fabButton: {
    width: 58,
    height: 58,
    borderRadius: radii.round,
    alignItems: "center",
    justifyContent: "center",
    elevation: 6,
    shadowColor: "#000000",
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
});
