import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useZoptionTheme } from "@/ui/theme-provider";
import { radii, spacing, touchTarget, typography } from "@/ui/tokens";

import type { TransactionFormKind } from "./transaction-form";

export function KindSelector({
  value,
  kinds = ["expense", "income", "transfer"],
  disabled,
  onChange,
}: {
  value: TransactionFormKind;
  kinds?: readonly TransactionFormKind[];
  disabled?: boolean;
  onChange: (kind: TransactionFormKind) => void;
}) {
  const theme = useZoptionTheme();
  return (
    <View className="gap-2">
      <Text style={[typography.label, { color: theme.colors.text }]}>Type</Text>
      <View
        accessibilityRole="radiogroup"
        className="flex-row"
        style={[styles.segmentGroup, { backgroundColor: theme.colors.canvasMuted }]}
      >
        {kinds.map((kind) => {
          const selected = value === kind;
          const label = kind === "expense" ? "Expense" : kind === "income" ? "Income" : "Transfer";
          return (
            <Pressable
              key={kind}
              accessibilityRole="radio"
              accessibilityLabel={label}
              accessibilityState={{ checked: selected, disabled: Boolean(disabled) }}
              disabled={disabled}
              onPress={() => onChange(kind)}
              style={[
                styles.segment,
                {
                  backgroundColor: selected ? theme.colors.surfaceRaised : "transparent",
                  borderColor: selected ? theme.colors.border : "transparent",
                  opacity: disabled ? 0.55 : 1,
                },
              ]}
            >
              <MaterialCommunityIcons
                accessibilityElementsHidden
                color={selected ? theme.colors.brand : theme.colors.textMuted}
                name={
                  kind === "expense"
                    ? "arrow-up-right"
                    : kind === "income"
                      ? "arrow-down-left"
                      : "swap-horizontal"
                }
                size={19}
              />
              <Text
                style={[
                  typography.label,
                  { color: selected ? theme.colors.text : theme.colors.textMuted },
                ]}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  segmentGroup: {
    width: "100%",
    borderRadius: radii.md,
    padding: spacing.xxs,
    gap: spacing.xxs,
  },
  segment: {
    flex: 1,
    minHeight: touchTarget,
    borderRadius: radii.sm,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: spacing.xs,
  },
});
