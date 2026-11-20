import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import {
  budgetingStyleLabels,
  budgetingStyles,
  incomeCadenceLabels,
  incomeCadences,
  SPENDING_FOCUS_MAX,
  spendingFocusLabels,
  spendingFocuses,
  type MoneyPreferences,
} from "@zoption/shared";
import { useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { withTapSound } from "@/features/sounds/sound-effects";
import { Button } from "@/ui/components";
import { useZoptionTheme } from "@/ui/theme-provider";
import { radii, spacing, touchTarget, typography } from "@/ui/tokens";

interface PreferenceChoicesProps {
  /** The saved answers. */
  preferences: MoneyPreferences;
  disabled: boolean;
  confirmLabel: string;
  onSave: (preferences: MoneyPreferences) => void;
}

/**
 * How the user is paid, how they like to budget, and up to three spending areas to watch. Every
 * question is optional; nothing is saved until the confirm button.
 */
export function PreferenceChoices({
  preferences,
  disabled,
  confirmLabel,
  onSave,
}: PreferenceChoicesProps) {
  // Local only: answers the user has not confirmed yet.
  const [draft, setDraft] = useState<MoneyPreferences>();
  const current = draft ?? preferences;
  const focusFull = current.spendingFocus.length >= SPENDING_FOCUS_MAX;

  return (
    <View style={styles.list}>
      <Group label="How often do you get paid?">
        {incomeCadences.map((option) => (
          <Choice
            key={option}
            kind="radio"
            label={incomeCadenceLabels[option]}
            active={current.incomeCadence === option}
            disabled={disabled}
            onPress={() => setDraft({ ...current, incomeCadence: option })}
          />
        ))}
      </Group>
      <Group label="How do you like to budget?">
        {budgetingStyles.map((option) => (
          <Choice
            key={option}
            kind="radio"
            label={budgetingStyleLabels[option]}
            active={current.budgetingStyle === option}
            disabled={disabled}
            onPress={() => setDraft({ ...current, budgetingStyle: option })}
          />
        ))}
      </Group>
      <Group label={`What spending do you want to watch? Pick up to ${SPENDING_FOCUS_MAX}.`}>
        {spendingFocuses.map((option) => {
          const active = current.spendingFocus.includes(option);
          return (
            <Choice
              key={option}
              kind="checkbox"
              label={spendingFocusLabels[option]}
              active={active}
              disabled={disabled || (!active && focusFull)}
              onPress={() =>
                setDraft({
                  ...current,
                  spendingFocus: active
                    ? current.spendingFocus.filter((key) => key !== option)
                    : [...current.spendingFocus, option],
                })
              }
            />
          );
        })}
      </Group>
      <Button disabled={disabled} onPress={() => onSave(current)}>
        {confirmLabel}
      </Button>
    </View>
  );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  const theme = useZoptionTheme();
  return (
    <View style={styles.list}>
      <Text style={[typography.label, { color: theme.colors.text }]}>{label}</Text>
      {children}
    </View>
  );
}

function Choice({
  kind,
  label,
  active,
  disabled,
  onPress,
}: {
  kind: "radio" | "checkbox";
  label: string;
  active: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const theme = useZoptionTheme();
  const icon =
    kind === "radio"
      ? active
        ? "radiobox-marked"
        : "radiobox-blank"
      : active
        ? "checkbox-marked"
        : "checkbox-blank-outline";
  return (
    <Pressable
      accessibilityRole={kind}
      accessibilityLabel={label}
      accessibilityState={{ checked: active, disabled }}
      disabled={disabled}
      onPress={withTapSound(onPress)}
      style={[
        styles.card,
        {
          backgroundColor: active ? theme.colors.brandSoft : theme.colors.surface,
          borderColor: active ? theme.colors.brand : theme.colors.border,
          opacity: disabled && !active ? 0.6 : 1,
        },
      ]}
    >
      <Text style={[typography.body, styles.label, { color: theme.colors.text }]}>{label}</Text>
      <MaterialCommunityIcons
        name={icon}
        size={22}
        color={active ? theme.colors.brand : theme.colors.textMuted}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  card: {
    minHeight: touchTarget,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
  },
  label: { flex: 1 },
});
