import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useZoptionTheme } from "@/ui/theme-provider";
import { radii, spacing, touchTarget, typography } from "@/ui/tokens";
import { withTapSound } from "@/features/sounds/sound-effects";

export type ReceiptKind = "expense" | "income" | "transfer";

const OPTIONS = {
  expense: { label: "Expense", icon: "arrow-up-right" },
  income: { label: "Income", icon: "arrow-down-left" },
  transfer: { label: "Transfer", icon: "swap-horizontal" },
} as const;

export function ItemKindSelector({
  value,
  disabled,
  onChange,
}: {
  value: ReceiptKind;
  disabled?: boolean;
  onChange: (value: ReceiptKind) => void;
}) {
  const theme = useZoptionTheme();
  return (
    <View className="w-full gap-2">
      <Text style={[typography.label, { color: theme.colors.text }]}>Type</Text>
      <View
        accessibilityRole="radiogroup"
        style={[styles.kindGroup, { backgroundColor: theme.colors.canvasMuted }]}
      >
        {(["expense", "income", "transfer"] as const).map((option) => {
          const selected = value === option;
          return (
            <Pressable
              key={option}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected, disabled: Boolean(disabled) }}
              disabled={disabled}
              onPress={withTapSound(() => onChange(option), "select")}
              style={[
                styles.kindOption,
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
                name={OPTIONS[option].icon}
                size={19}
              />
              <Text
                style={[
                  typography.label,
                  { color: selected ? theme.colors.text : theme.colors.textMuted },
                ]}
              >
                {OPTIONS[option].label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  kindGroup: {
    flexDirection: "row",
    borderRadius: radii.md,
    padding: spacing.xxs,
    gap: spacing.xxs,
  },
  kindOption: {
    minHeight: touchTarget - spacing.xs,
    borderWidth: 1,
    borderRadius: radii.sm,
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
});
