import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import * as SecureStore from "expo-secure-store";
import {
  openPreferenceSuggestions,
  preferenceSuggestions,
  type Currency,
  type MoneyPreferences,
} from "@zoption/shared";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useSessionSnapshot } from "@/auth/session-state";
import { useGoals, useSubscriptions } from "@/db/local-workspace-state";
import { withTapSound } from "@/features/sounds/sound-effects";
import { useGoalProfileStore } from "@/stores/goal-profile-store";
import { useWorkspaceCurrency } from "@/stores/workspace-currency-store";
import { Card } from "@/ui/components";
import { useZoptionTheme } from "@/ui/theme-provider";
import { radii, spacing, touchTarget, typography } from "@/ui/tokens";

import { openGoalTarget } from "./goal-personalization";

function dismissStorageKey(subject: string | null): string {
  return `zoption.preference-suggestions.dismissed.${subject ?? "default"}`;
}

/**
 * Next steps tailored to the money habits from setup. Each hides once the workspace already has
 * what it asks for, read from the local workspace; the card hides when none are left, while the
 * local reads load, before the Worker answered, or once dismissed (persisted per account).
 */
export function PreferenceSuggestionsCard({
  hasBudget,
  hasSubscription,
  subscriptionsLoading,
}: {
  hasBudget: boolean;
  /** Reuse the parent screen's subscription query when available to avoid a duplicate read. */
  hasSubscription?: boolean;
  subscriptionsLoading?: boolean;
}) {
  const preferences = useGoalProfileStore((state) => state.preferences);
  const currency = useWorkspaceCurrency();
  // No local reads at all until the habits call for a suggestion.
  if (preferenceSuggestions(preferences, currency).length === 0) return null;
  if (hasSubscription !== undefined) {
    return (
      <Suggestions
        preferences={preferences}
        currency={currency}
        hasBudget={hasBudget}
        hasSubscription={hasSubscription}
        subscriptionsLoading={subscriptionsLoading ?? false}
      />
    );
  }
  return (
    <SuggestionsWithSubscriptions
      preferences={preferences}
      currency={currency}
      hasBudget={hasBudget}
    />
  );
}

function SuggestionsWithSubscriptions({
  preferences,
  currency,
  hasBudget,
}: {
  preferences: MoneyPreferences | null;
  currency: Currency;
  hasBudget: boolean;
}) {
  const subscriptions = useSubscriptions();
  return (
    <Suggestions
      preferences={preferences}
      currency={currency}
      hasBudget={hasBudget}
      hasSubscription={subscriptions.subscriptions.length > 0}
      subscriptionsLoading={subscriptions.loading}
    />
  );
}

function Suggestions({
  preferences,
  currency,
  hasBudget,
  hasSubscription,
  subscriptionsLoading,
}: {
  preferences: MoneyPreferences | null;
  currency: Currency;
  hasBudget: boolean;
  hasSubscription: boolean;
  subscriptionsLoading: boolean;
}) {
  const theme = useZoptionTheme();
  const { subject } = useSessionSnapshot();
  const goals = useGoals();
  const storageKey = dismissStorageKey(subject);
  const [loaded, setLoaded] = useState(false);
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    let active = true;
    setLoaded(false);
    setClosed(false);
    void SecureStore.getItemAsync(storageKey)
      .then((value) => {
        if (!active) return;
        if (value === "true") setClosed(true);
        setLoaded(true);
      })
      .catch(() => {
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [storageKey]);

  const handleDismiss = () => {
    setClosed(true);
    void SecureStore.setItemAsync(storageKey, "true").catch(() => undefined);
  };

  if (!loaded || closed || goals.loading || subscriptionsLoading) return null;
  const open = openPreferenceSuggestions(
    preferences,
    {
      has_budget: hasBudget,
      has_savings_goal: goals.goals.length > 0,
      has_subscription: hasSubscription,
    },
    currency,
  );
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
          onPress={withTapSound(handleDismiss)}
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
