import { useState } from "react";
import { StyleSheet, Text, TextInput, View, type ColorValue } from "react-native";

import { useZoptionTheme } from "@/ui/theme-provider";
import { radii, spacing, typography } from "@/ui/tokens";

import type { TransactionFormKind } from "./transaction-form";

/** The entry form's headline field: a large amount input tinted by the entry's type. */
export function AmountHero({
  kind,
  value,
  currency,
  error,
  editable,
  autoFocus,
  onChangeText,
}: {
  kind: TransactionFormKind;
  value: string;
  currency: string;
  error?: string;
  editable: boolean;
  autoFocus: boolean;
  onChangeText: (value: string) => void;
}) {
  const theme = useZoptionTheme();
  const [focused, setFocused] = useState(false);
  const tint: ColorValue =
    kind === "expense"
      ? theme.colors.expense
      : kind === "income"
        ? theme.colors.income
        : theme.colors.info;
  return (
    <View
      style={[
        styles.box,
        {
          backgroundColor: theme.colors.surface,
          borderColor: error
            ? theme.colors.danger
            : focused
              ? theme.colors.brand
              : theme.colors.border,
        },
      ]}
    >
      <Text style={[typography.label, { color: theme.colors.textMuted }]}>Amount</Text>
      <View style={styles.row}>
        <Text style={[styles.currency, { color: theme.colors.textMuted }]}>{currency}</Text>
        <TextInput
          accessibilityHint={error}
          accessibilityLabel="Amount"
          autoFocus={autoFocus}
          editable={editable}
          keyboardType="decimal-pad"
          maxLength={18}
          onBlur={() => setFocused(false)}
          onChangeText={onChangeText}
          onFocus={() => setFocused(true)}
          placeholder="0.00"
          placeholderTextColor={theme.colors.textMuted}
          style={[styles.input, { color: tint }]}
          value={value}
        />
      </View>
      {error ? (
        <Text
          accessibilityRole="alert"
          style={[typography.caption, { color: theme.colors.danger }]}
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderWidth: 1,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.xxs,
  },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  currency: { ...typography.headline },
  input: {
    flex: 1,
    // Money stays on the system face for true tabular figures, as everywhere else.
    fontSize: 40,
    fontWeight: "700",
    lineHeight: 48,
    paddingVertical: 0,
    fontVariant: ["tabular-nums"],
  },
});
