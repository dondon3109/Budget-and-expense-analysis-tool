import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import {
  GOAL_OTHER_TEXT_MAX_LENGTH,
  primaryGoalLabels,
  primaryGoals,
  type PrimaryGoal,
} from "@zoption/shared";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Button, FormField } from "@/ui/components";
import { useZoptionTheme } from "@/ui/theme-provider";
import { radii, spacing, touchTarget, typography } from "@/ui/tokens";

import type { GoalChoice } from "./use-goal-actions";

interface GoalChoicesProps {
  /** The saved goals, lead goal first. */
  goals: PrimaryGoal[];
  otherText: string | null;
  disabled: boolean;
  /** Label of the button that saves the picks. */
  confirmLabel: string;
  onChoose: (choice: GoalChoice) => void;
}

/**
 * Pick any number of goal cards. The order they are tapped in is kept: the first is the lead goal.
 * Nothing is saved until the confirm button, which stays disabled until one is picked.
 */
export function GoalChoices({
  goals,
  otherText,
  disabled,
  confirmLabel,
  onChoose,
}: GoalChoicesProps) {
  const theme = useZoptionTheme();
  // Local only: the picks and note the user has not confirmed yet.
  const [picked, setPicked] = useState<PrimaryGoal[]>();
  const [note, setNote] = useState<string>();
  const selected = picked ?? goals;
  const noteValue = note ?? otherText ?? "";

  const toggle = (goal: PrimaryGoal) =>
    setPicked(
      selected.includes(goal) ? selected.filter((item) => item !== goal) : [...selected, goal],
    );

  return (
    <View style={styles.list}>
      <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
        Pick all that apply. The first one you tap is your main focus.
      </Text>
      {primaryGoals.map((option) => {
        const active = selected.includes(option);
        return (
          <Pressable
            key={option}
            accessibilityRole="checkbox"
            accessibilityLabel={primaryGoalLabels[option]}
            accessibilityState={{ checked: active, disabled }}
            disabled={disabled}
            onPress={() => toggle(option)}
            style={[
              styles.card,
              {
                backgroundColor: active ? theme.colors.brandSoft : theme.colors.surface,
                borderColor: active ? theme.colors.brand : theme.colors.border,
              },
            ]}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[typography.body, { color: theme.colors.text }]}>
                {primaryGoalLabels[option]}
              </Text>
              {selected.length > 1 && selected[0] === option ? (
                <Text style={[typography.caption, { color: theme.colors.brand }]}>Main focus</Text>
              ) : null}
            </View>
            <MaterialCommunityIcons
              name={active ? "checkbox-marked" : "checkbox-blank-outline"}
              size={22}
              color={active ? theme.colors.brand : theme.colors.textMuted}
            />
          </Pressable>
        );
      })}
      {selected.includes("other") ? (
        <FormField
          label="Tell us more (optional)"
          value={noteValue}
          maxLength={GOAL_OTHER_TEXT_MAX_LENGTH}
          editable={!disabled}
          onChangeText={setNote}
        />
      ) : null}
      <Button
        disabled={disabled || selected.length === 0}
        onPress={() => onChoose({ goals: selected, otherText: noteValue })}
      >
        {confirmLabel}
      </Button>
    </View>
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
});
