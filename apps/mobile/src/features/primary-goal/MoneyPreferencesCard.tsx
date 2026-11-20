import { useNetInfo } from "@react-native-community/netinfo";
import {
  budgetingStyleLabels,
  hasMoneyPreferences,
  incomeCadenceLabels,
  type MoneyPreferences,
} from "@zoption/shared";
import { useState } from "react";
import { Text } from "react-native";

import { useSessionSnapshot } from "@/auth/session-state";
import { isDummyDevelopmentSubject } from "@/db/demo-seed";
import { useGoalProfileStore } from "@/stores/goal-profile-store";
import { CollapsibleCard } from "@/ui/components";
import { useZoptionTheme } from "@/ui/theme-provider";
import { typography } from "@/ui/tokens";

import { PreferenceChoices } from "./PreferenceChoices";
import { useGoalActions } from "./use-goal-actions";

function summaryOf(preferences: MoneyPreferences): string {
  if (!hasMoneyPreferences(preferences)) return "Not set";
  const parts = [
    preferences.incomeCadence ? incomeCadenceLabels[preferences.incomeCadence] : null,
    preferences.budgetingStyle ? budgetingStyleLabels[preferences.budgetingStyle] : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : "Spending focus set";
}

/** View or change the money habits from More. Hidden until the Worker has answered, like the goal. */
export function MoneyPreferencesCard() {
  const theme = useZoptionTheme();
  const session = useSessionSnapshot();
  const netInfo = useNetInfo();
  const preferences = useGoalProfileStore((state) => state.preferences);
  const actions = useGoalActions();
  const [saved, setSaved] = useState(false);

  if (!preferences || isDummyDevelopmentSubject(session.subject)) return null;
  const offline = (netInfo.isInternetReachable ?? netInfo.isConnected) === false;

  return (
    <CollapsibleCard title="Money habits" summary={summaryOf(preferences)} icon="cash-multiple">
      <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
        {offline
          ? "Connect to the internet to change your money habits."
          : "Changes the next steps we suggest on Home and the assistant's starter question."}
      </Text>
      <PreferenceChoices
        preferences={preferences}
        confirmLabel="Save money habits"
        disabled={actions.busy || offline}
        onSave={(choice) => void actions.savePreferences(choice).then(setSaved)}
      />
      {saved && !actions.busy && !actions.error ? (
        <Text accessibilityRole="alert" style={[typography.caption, { color: theme.colors.brand }]}>
          Saved. Your suggestions are updated.
        </Text>
      ) : null}
      {actions.error ? (
        <Text style={[typography.caption, { color: theme.colors.danger }]}>{actions.error}</Text>
      ) : null}
    </CollapsibleCard>
  );
}
