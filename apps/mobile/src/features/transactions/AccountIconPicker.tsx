import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import type { AccountType } from "@zoption/shared";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { withTapSound } from "@/features/sounds/sound-effects";
import { accountTypeIcon } from "@/features/setup/account-types";
import { useZoptionTheme } from "@/ui/theme-provider";
import { radii, spacing, typography } from "@/ui/tokens";

export interface AccountIconOption {
  id: string;
  label: string;
  detail: string;
  type: AccountType;
}

/** The entry form's account choice: a row of account tiles, each marked by its type's icon. */
export function AccountIconPicker({
  label,
  options,
  value,
  error,
  disabled,
  onSelect,
}: {
  label: string;
  options: readonly AccountIconOption[];
  value: string;
  error?: string;
  disabled?: boolean;
  onSelect: (accountId: string) => void;
}) {
  const theme = useZoptionTheme();
  return (
    <View style={styles.field}>
      <Text style={[typography.label, { color: theme.colors.text }]}>{label}</Text>
      <ScrollView
        accessibilityLabel={label}
        accessibilityRole="radiogroup"
        contentContainerStyle={styles.row}
        horizontal
        keyboardShouldPersistTaps="handled"
        showsHorizontalScrollIndicator={false}
      >
        {options.map((option) => {
          const selected = option.id === value;
          return (
            <Pressable
              key={option.id}
              accessibilityLabel={`${option.label}, ${option.detail}`}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected, disabled: Boolean(disabled) }}
              disabled={disabled}
              onPress={withTapSound(() => onSelect(option.id))}
              style={[
                styles.tile,
                {
                  backgroundColor: selected ? theme.colors.brandSoft : theme.colors.surface,
                  borderColor: selected ? theme.colors.brand : theme.colors.border,
                  opacity: disabled ? 0.55 : 1,
                },
              ]}
            >
              <View
                style={[
                  styles.icon,
                  { backgroundColor: selected ? theme.colors.solid : theme.colors.canvasMuted },
                ]}
              >
                <MaterialCommunityIcons
                  accessibilityElementsHidden
                  color={selected ? theme.colors.onSolid : theme.colors.textMuted}
                  name={accountTypeIcon(option.type)}
                  size={24}
                />
              </View>
              <Text
                numberOfLines={1}
                style={[typography.label, styles.center, { color: theme.colors.text }]}
              >
                {option.label}
              </Text>
              <Text
                numberOfLines={1}
                style={[typography.caption, styles.center, { color: theme.colors.textMuted }]}
              >
                {option.detail}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
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
  field: { gap: spacing.xs },
  row: { gap: spacing.sm, paddingRight: spacing.md },
  tile: {
    width: 104,
    borderWidth: 1,
    borderRadius: radii.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
    alignItems: "center",
    gap: spacing.xxs,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: radii.round,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xxs,
  },
  center: { textAlign: "center" },
});
