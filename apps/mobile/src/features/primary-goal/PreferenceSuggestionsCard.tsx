import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import {
  openPreferenceSuggestions,
  preferenceSuggestions,
  type MoneyPreferences,
} from "@zoption/shared";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useGoals, useSubscriptions } from "@/db/local-workspace-state";
import { withTapSound } from "@/features/sounds/sound-effects";
import { useGoalProfileStore } from "@/stores/goal-profile-store";
import { Card } from "@/ui/components";
import { useZoptionTheme } from "@/ui/theme-provider";
import { radii, spacing, touchTarget, typography } from "@/ui/tokens";

import { openGoalTarget } from "./goal-personalization";

/**
 * Next steps tailored to the money habits from setup. Each hides once the workspace already has
 * what it asks for, read from the local workspace; the card hides when none are left, while the
 * local reads load, before the Worker answered, or once closed for this launch.
 */
export function PreferenceSuggestionsCard({ hasBudget }: { hasBudget: boolean }) {
  const preferences = useGoalProfileStore((state) => state.preferences);
  // No local reads at all until the habits call for a suggestion.
  if (preferenceSuggestions(preferences).length === 0) return null;
  return <Suggestions preferences={preferences} hasBudget={hasBudget} />;
}

function Suggestions({
  preferences,
  hasBudget,
}: {
  preferences: MoneyPreferences | null;
  hasBudget: boolean;
}) {
  const theme = useZoptionTheme();
  const goals = useGoals();
  const subscriptions = useSubscriptions();
  const [closed, setClosed] = useState(false);

  if (closed || goals.loading || subscriptions.loading) return null;
  const open = openPreferenceSuggestions(preferences, {
    has_budget: hasBudget,
    has_savings_goal: goals.goals.length > 0,
    has_subscription: subscriptions.subscriptions.length > 0,
  });
  if (open.length === 0) return null;

  return (
    <Card accessibilityLabel="Suggested for you">
      <View style={styles.header}>
        <Text
          accessibilityRole="header"
          style={[typography.headline, { color: theme.colors.text }]}
        >
          Suggested for you
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss suggestions"
          hitSlop={8}
          onPress={withTapSound(() => setClosed(true))}
        >
          <MaterialCommunityIcons name="close" size={20} color={theme.colors.textMuted} />
        </Pressable>
      </View>
      <View style={styles.list}>
        {open.map((item) => (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            accessibilityLabel={item.title}
            accessibilityHint={item.detail}
            onPress={withTapSound(() => openGoalTarget(null, item.target))}
            style={[
              styles.row,
              { backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.border },
            ]}
          >
            <View style={styles.copy}>
              <Text style={[typography.label, { color: theme.colors.text }]}>{item.title}</Text>
              <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
                {item.detail}
              </Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={20} color={theme.colors.textMuted} />
          </Pressable>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  list: { gap: spacing.sm, marginTop: spacing.sm },
  row: {
    minHeight: touchTarget,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
  },
  copy: { flex: 1, minWidth: 0, gap: 2 },
});
