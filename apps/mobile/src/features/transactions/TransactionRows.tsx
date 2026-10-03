import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { currencies, resolveCategoryEmoji, type Currency } from "@zoption/shared";
import type { LocalTransactionItem } from "@/db/view-models";
import { useWorkspaceCurrency } from "@/stores/workspace-currency-store";
import { CategoryBadge, MoneyValue } from "@/ui/components";
import { useZoptionTheme } from "@/ui/theme-provider";
import { radii, spacing, typography } from "@/ui/tokens";

import {
  transactionDayLabel,
  type CategorySummaryItem,
  type TransactionDateGroup,
  type TransactionTotals,
  type TransactionTotalsByCurrency,
} from "./transaction-list-view";

export function TotalsValue({
  totals,
  field,
  tone,
}: {
  totals: TransactionTotalsByCurrency;
  field: keyof TransactionTotals;
  tone: "default" | "income" | "expense";
}) {
  const workspaceCurrency = useWorkspaceCurrency();
  const populated = currencies.filter((currency) => totals[currency] !== undefined);
  const visibleCurrencies = populated.length > 0 ? populated : ([workspaceCurrency] as Currency[]);
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

export function TransactionItemRow({
  item,
  showDate = false,
  selecting = false,
  selected = false,
  onToggleSelect,
}: {
  item: LocalTransactionItem;
  showDate?: boolean;
  /** Select mode is on: a tap toggles the row instead of opening it. */
  selecting?: boolean;
  selected?: boolean;
  /** Long press starts select mode; while selecting, a tap toggles. */
  onToggleSelect?: (id: string) => void;
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
      accessibilityHint={
        selecting
          ? "Selects this transaction for deleting."
          : "Opens transaction details. Press and hold to select transactions to delete."
      }
      accessibilityRole={selecting ? "checkbox" : "button"}
      accessibilityState={selecting ? { checked: selected } : undefined}
      accessibilityActions={
        selecting || !onToggleSelect
          ? undefined
          : [{ name: "select", label: "Select transactions" }]
      }
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === "select") onToggleSelect?.(transaction.id);
      }}
      android_ripple={{ color: "rgba(10, 117, 86, 0.12)", borderless: false }}
      delayLongPress={450}
      onLongPress={selecting ? undefined : () => onToggleSelect?.(transaction.id)}
      onPress={() =>
        selecting
          ? onToggleSelect?.(transaction.id)
          : router.push({ pathname: "/(app)/transaction", params: { id: transaction.id } })
      }
      style={[
        styles.transactionRow,
        { backgroundColor: selected ? theme.colors.brandSoft : theme.colors.surface },
      ]}
    >
      {selecting ? (
        <MaterialCommunityIcons
          accessibilityElementsHidden
          color={selected ? theme.colors.brand : theme.colors.textMuted}
          name={selected ? "checkbox-marked" : "checkbox-blank-outline"}
          size={22}
        />
      ) : null}
      <View style={styles.categoryColumn}>
        <View style={styles.categoryLine}>
          <CategoryBadge
            emoji={resolveCategoryEmoji({
              name: transaction.categoryName,
              iconEmoji: transaction.categoryIconEmoji,
              kind: transaction.kind,
            })}
            color={transaction.categoryColor}
            size={26}
          />
          <Text
            numberOfLines={1}
            style={[typography.caption, styles.categoryText, { color: theme.colors.textMuted }]}
          >
            {transaction.categoryName}
          </Text>
        </View>
      </View>
      <View style={styles.descriptionColumn}>
        <Text numberOfLines={1} style={[styles.descriptionText, { color: theme.colors.text }]}>
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

export function DateHeader({ section }: { section: TransactionDateGroup }) {
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

export function CategorySummaryRow({ item }: { item: CategorySummaryItem }) {
  const theme = useZoptionTheme();
  return (
    <View
      style={[
        styles.summaryRow,
        { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
      ]}
    >
      <CategoryBadge emoji={resolveCategoryEmoji(item)} color={item.color} size={32} />
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
        tone={item.incomeMinor > 0 ? "income" : item.expenseMinor > 0 ? "expense" : "default"}
        style={styles.rowMoney}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  totalValues: { alignItems: "center", minWidth: 0 },
  totalMoney: { fontSize: 16, lineHeight: 21, fontWeight: "600" },
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
  summaryName: { flex: 1, minWidth: 0 },
});
