import { Pressable, StyleSheet, Text, View } from "react-native";

import type { TransactionListItem } from "@zoption/shared";
import { MoneyValue, moneyAccessibilityLabel } from "./MoneyValue";
import { radii, spacing, touchTarget, typography } from "@/ui/tokens";
import { useZoptionTheme } from "@/ui/theme-provider";

interface TransactionRowProps {
  transaction: TransactionListItem;
  pending?: boolean;
  conflicted?: boolean;
  failed?: boolean;
  onPress?: () => void;
}

export function TransactionRow({
  transaction,
  pending,
  conflicted,
  failed,
  onPress,
}: TransactionRowProps) {
  const theme = useZoptionTheme();
  const stateLabel = conflicted
    ? "Conflict needs review"
    : failed
      ? "Sync needs repair"
      : pending
        ? "Pending sync"
        : null;
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={`${transaction.description}, ${transaction.categoryName}, ${transaction.date}, ${moneyAccessibilityLabel(transaction.amountMinor, transaction.currency)}`}
      accessibilityHint={stateLabel ?? (onPress ? "Opens transaction details" : undefined)}
      disabled={!onPress}
      onPress={onPress}
      className="w-full flex-row items-center gap-3"
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? theme.colors.canvasMuted : "transparent" },
      ]}
    >
      <View
        accessibilityElementsHidden
        style={[styles.category, { backgroundColor: transaction.categoryColor }]}
      />
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} style={[typography.headline, { color: theme.colors.text }]}>
          {transaction.description}
        </Text>
        <Text numberOfLines={1} style={[typography.caption, { color: theme.colors.textMuted }]}>
          {transaction.categoryName} · {transaction.date}
          {stateLabel ? ` · ${stateLabel}` : ""}
        </Text>
      </View>
      <MoneyValue
        amountMinor={transaction.amountMinor}
        currency={transaction.currency}
        tone={transaction.amountMinor < 0 ? "expense" : "income"}
        style={typography.headline}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: touchTarget, paddingVertical: spacing.sm, borderRadius: radii.sm },
  category: { width: 10, height: 10, borderRadius: radii.round },
});
