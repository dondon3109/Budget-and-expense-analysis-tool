import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useDeferredValue, useMemo, useState } from "react";
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

import { resolveCategoryEmoji, type Currency } from "@zoption/shared";
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
import { SmsQuickPasteModal } from "@/features/transactions/SmsQuickPasteModal";
import { useSyncState } from "@/sync/sync-state";
import {
  Button,
  ErrorState,
  MoneyValue,
  OfflineBanner,
  Skeleton,
  SyncPausedBanner,
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
          ? "Saved on this device"
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
      onPress={() =>
        router.push({ pathname: "/(app)/transaction", params: { id: transaction.id } })
      }
      style={[styles.transactionRow, { backgroundColor: theme.colors.surface }]}
    >
      <View style={styles.categoryColumn}>
        <View style={styles.categoryLine}>
          {resolveCategoryEmoji({
            name: transaction.categoryName,
            iconEmoji: transaction.categoryIconEmoji,
            kind: transaction.kind,
          }) ? (
            <Text accessibilityElementsHidden style={styles.categoryEmoji}>
              {resolveCategoryEmoji({
                name: transaction.categoryName,
                iconEmoji: transaction.categoryIconEmoji,
                kind: transaction.kind,
              })}
            </Text>
          ) : (
            <View style={[styles.categoryDot, { backgroundColor: transaction.categoryColor }]} />
          )}
          <Text
            numberOfLines={1}
            style={[typography.caption, styles.categoryText, { color: theme.colors.textMuted }]}
          >
            {transaction.categoryName}
          </Text>
        </View>
      </View>
      <View style={styles.descriptionColumn}>
        <Text
          numberOfLines={1}
          style={[styles.descriptionText, { color: theme.colors.text }]}
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
        adjustsFontSizeToFit
        currency={transaction.currency}
        minimumFontScale={0.8}
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
  iconEmoji: string | null;
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
      iconEmoji: transaction.categoryIconEmoji ?? null,
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
      right.expenseMinor +
        right.incomeMinor +
        right.transferMinor -
        (left.expenseMinor + left.incomeMinor + left.transferMinor) ||
      left.name.localeCompare(right.name),
  );
}

function TransactionsEmptyView({
  filtering,
  search,
  kind,
  month,
  onResetFilters,
  onGoToCurrentMonth,
}: {
  filtering: boolean;
  search: string;
  kind: TransactionKindFilter;
  month: string;
  onResetFilters: () => void;
  onGoToCurrentMonth: () => void;
}) {
  const theme = useZoptionTheme();
  const isCurrentMonth = month === monthStartForDate(new Date());

  if (filtering) {
    return (
      <View style={styles.emptyContainer}>
        <View
          accessibilityElementsHidden
          style={[
            styles.emptyIconBox,
            { backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.border },
          ]}
        >
          <MaterialCommunityIcons
            name="magnify-remove-outline"
            size={32}
            color={theme.colors.brand}
          />
        </View>
        <Text
          accessibilityRole="header"
          style={[typography.title, styles.emptyTitle, { color: theme.colors.text }]}
        >
          No matching transactions
        </Text>
        <Text
          style={[typography.body, styles.emptyDescription, { color: theme.colors.textMuted }]}
        >
          {search.trim().length > 0 && kind !== "all"
            ? `No ${kindLabels[kind].toLowerCase()} transactions match "${search.trim()}".`
            : search.trim().length > 0
              ? `No transactions match "${search.trim()}".`
              : `No ${kindLabels[kind].toLowerCase()} transactions recorded in ${monthLabel(month)}.`}
        </Text>
        <Button variant="secondary" onPress={onResetFilters}>
          Clear filters
        </Button>
      </View>
    );
  }

  return (
    <View style={styles.emptyContainer}>
      <View
        accessibilityElementsHidden
        style={[
          styles.emptyIconBox,
          { backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.border },
        ]}
      >
        <MaterialCommunityIcons
          name="receipt-text-outline"
          size={34}
          color={theme.colors.brand}
        />
      </View>
      <Text
        accessibilityRole="header"
        style={[typography.title, styles.emptyTitle, { color: theme.colors.text }]}
      >
        No transactions in {monthLabel(month)}
      </Text>
      <Text
        style={[typography.body, styles.emptyDescription, { color: theme.colors.textMuted }]}
      >
        Record your spending, income, or scan a paper receipt to track this month&apos;s activity.
      </Text>
      <View style={styles.emptyActions}>
        <Button
          accessibilityHint="Opens the new transaction form"
          onPress={() => router.push("/(app)/transaction")}
          variant="primary"
        >
          Add transaction
        </Button>
        <Button
          accessibilityHint="Opens camera to scan a receipt"
          onPress={() => router.push("/(app)/receipt-scan")}
          variant="secondary"
        >
          Scan receipt
        </Button>
      </View>
      {!isCurrentMonth ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Jump to ${monthLabel(monthStartForDate(new Date()))}`}
          hitSlop={8}
          onPress={onGoToCurrentMonth}
          style={styles.currentMonthLink}
        >
          <MaterialCommunityIcons name="calendar-today" size={16} color={theme.colors.brand} />
          <Text style={[typography.label, { color: theme.colors.brand }]}>
            Jump to {monthLabel(monthStartForDate(new Date()))}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export default function TransactionsScreen() {
  const [month, setMonth] = useState(() => monthStartForDate(new Date()));
  const [search, setSearch] = useState("");
  const [searchVisible, setSearchVisible] = useState(false);
  const [kind, setKind] = useState<TransactionKindFilter>("all");
  const [view, setView] = useState<ViewMode>("daily");
  const [smsQuickPasteVisible, setSmsQuickPasteVisible] = useState(false);
  const deferredSearch = useDeferredValue(search);
  const local = useLocalTransactions(deferredSearch, kind, month);
  const sync = useSyncState();
  const theme = useZoptionTheme();
  const filtering = search.trim().length > 0 || kind !== "all";

  const items = local.items ?? [];
  const totals = useMemo(() => summarizeTransactions(items), [items]);
  const dateGroups = useMemo(() => groupTransactionsByDate(items), [items]);
  const summaryItems = useMemo(() => categorySummary(items), [items]);

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
          <Text style={[typography.caption, { color: theme.colors.textMuted }]}>Balance</Text>
          <TotalsValue totals={totals} field="netMinor" tone="default" />
        </View>
      </View>

      <OfflineBanner />
      {sync.message && sync.status !== "waiting" ? (
        <View style={styles.syncBannerInset}>
          <SyncPausedBanner message={sync.message} onRetry={sync.retry} />
        </View>
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
          stickySectionHeadersEnabled
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
          ListHeaderComponent={filterPanel}
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
              {resolveCategoryEmoji(item) ? (
                <Text accessibilityElementsHidden style={styles.summaryEmoji}>
                  {resolveCategoryEmoji(item)}
                </Text>
              ) : (
                <View style={[styles.summaryDot, { backgroundColor: item.color }]} />
              )}
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
                  item.incomeMinor > 0 ? "income" : item.expenseMinor > 0 ? "expense" : "default"
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
            items.length === 0 && styles.emptyList,
          ]}
          data={items}
          keyExtractor={(item) => item.transaction.id}
          ListEmptyComponent={emptyState}
          ListHeaderComponent={filterPanel}
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

      <SmsQuickPasteModal
        visible={smsQuickPasteVisible}
        onDismiss={() => setSmsQuickPasteVisible(false)}
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
  syncBannerInset: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
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
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    gap: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(127, 127, 127, 0.18)",
  },
  categoryColumn: { width: 72, flexShrink: 0 },
  categoryLine: { minWidth: 0, flexDirection: "row", alignItems: "center", gap: spacing.xxs },
  categoryText: { flex: 1, minWidth: 0 },
  categoryDot: { width: 9, height: 9, borderRadius: radii.round, flexShrink: 0 },
  categoryEmoji: { width: 20, fontSize: 16, lineHeight: 20, flexShrink: 0 },
  descriptionColumn: { flex: 1, minWidth: 0, gap: 2 },
  descriptionText: { fontSize: 13, lineHeight: 18, fontWeight: "600" },
  rowMoney: {
    width: 96,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "600",
    flexShrink: 0,
    textAlign: "right",
  },
  summaryRow: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  summaryDot: { width: 10, height: 10, borderRadius: radii.round },
  summaryEmoji: { width: 24, fontSize: 19, lineHeight: 24 },
  summaryName: { flex: 1, minWidth: 0 },
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
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xxl,
    gap: spacing.sm,
  },
  emptyIconBox: {
    width: 64,
    height: 64,
    borderRadius: radii.lg,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xs,
  },
  emptyTitle: {
    textAlign: "center",
    fontSize: 20,
    lineHeight: 26,
  },
  emptyDescription: {
    textAlign: "center",
    maxWidth: 320,
    lineHeight: 22,
    marginBottom: spacing.xs,
  },
  emptyActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flexWrap: "wrap",
    justifyContent: "center",
  },
  currentMonthLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: spacing.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
});
