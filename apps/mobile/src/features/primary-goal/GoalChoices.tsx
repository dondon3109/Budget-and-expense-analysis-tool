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
  /** The saved goal, if any. */
  goal: PrimaryGoal | null;
  otherText: string | null;
  disabled: boolean;
  onChoose: (choice: GoalChoice) => void;
}

/**
 * Single-select goal cards. A preset goal is chosen the moment it is tapped; "Other" first reveals
 * an optional note and is chosen with its Save button.
 */
export function GoalChoices({ goal, otherText, disabled, onChoose }: GoalChoicesProps) {
  const theme = useZoptionTheme();
  // Local only: a pick or note the user has not confirmed yet.
  const [picked, setPicked] = useState<PrimaryGoal>();
  const [note, setNote] = useState<string>();
  const selected = picked ?? goal;

  const choose = (next: PrimaryGoal) => {
    setPicked(next);
    if (next !== "other") onChoose({ goal: next });
  };

  return (
    <View accessibilityRole="radiogroup" style={styles.list}>
      {primaryGoals.map((option) => {
        const active = selected === option;
        return (
          <Pressable
            key={option}
            accessibilityRole="radio"
            accessibilityLabel={primaryGoalLabels[option]}
            accessibilityState={{ selected: active, disabled }}
            disabled={disabled}
            onPress={() => choose(option)}
            style={[
              styles.card,
              {
                backgroundColor: active ? theme.colors.brandSoft : theme.colors.surface,
                borderColor: active ? theme.colors.brand : theme.colors.border,
              },
            ]}
          >
            <Text style={[typography.body, { color: theme.colors.text, flex: 1 }]}>
              {primaryGoalLabels[option]}
            </Text>
            {active ? (
              <MaterialCommunityIcons name="check-circle" size={20} color={theme.colors.brand} />
            ) : null}
          </Pressable>
        );
      })}
      {selected === "other" ? (
        <View style={styles.other}>
          <FormField
            label="Tell us more (optional)"
            value={note ?? otherText ?? ""}
            maxLength={GOAL_OTHER_TEXT_MAX_LENGTH}
            editable={!disabled}
            onChangeText={setNote}
          />
          <Button
            disabled={disabled}
            onPress={() => onChoose({ goal: "other", otherText: note ?? otherText ?? "" })}
          >
            Save
          </Button>
        </View>
      ) : null}
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
  other: { gap: spacing.sm },
});
