import { Pressable, StyleSheet, Text, View } from "react-native";

import { resolveCategoryEmoji, type TransactionListItem } from "@zoption/shared";
import { CategoryBadge } from "./CategoryBadge";
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
  const emoji = resolveCategoryEmoji({
    name: transaction.categoryName,
    iconEmoji: transaction.categoryIconEmoji,
    kind: transaction.kind,
  });
  const stateLabel = conflicted
    ? "Conflict needs review"
    : failed
      ? "Sync needs repair"
      : pending
        ? "Saved on this device"
        : undefined;
  const statusColor = failed || conflicted ? theme.colors.danger : theme.colors.warning;

  return (
    <Pressable
      accessibilityLabel={`${transaction.description}, ${transaction.categoryName}, ${transaction.date}, ${moneyAccessibilityLabel(transaction.amountMinor, transaction.currency)}`}
      accessibilityHint={onPress ? "Opens transaction editor" : undefined}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityState={
        conflicted || failed || pending ? { busy: pending, disabled: !onPress } : undefined
      }
      android_ripple={
        onPress
          ? {
              color: "rgba(10, 117, 86, 0.12)",
              borderless: false,
            }
          : undefined
      }
      disabled={!onPress}
      onPress={onPress}
      className="w-full flex-row items-center gap-3"
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? theme.colors.canvasMuted : "transparent" },
      ]}
    >
      <CategoryBadge emoji={emoji} color={transaction.categoryColor} />
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} style={[typography.headline, { color: theme.colors.text }]}>
          {transaction.description}
        </Text>
        <View style={styles.metaRow}>
          <Text numberOfLines={1} style={[typography.callout, { color: theme.colors.textMuted }]}>
            {transaction.categoryName} · {transaction.date}
          </Text>
          {stateLabel ? (
            <Text
              numberOfLines={1}
              style={[typography.callout, { color: statusColor, fontWeight: "600" }]}
            >
              · {stateLabel}
            </Text>
          ) : null}
        </View>
      </View>
      <MoneyValue
        amountMinor={transaction.amountMinor}
        currency={transaction.currency}
        tone={
          transaction.kind === "transfer"
            ? "default"
            : transaction.amountMinor < 0
              ? "expense"
              : "income"
        }
        style={typography.headline}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: touchTarget + spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderRadius: radii.md,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
  },
});
