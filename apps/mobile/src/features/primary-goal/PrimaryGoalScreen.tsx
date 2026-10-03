import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Text } from "react-native";

import { markGoalShown } from "@/api/goal-profile";
import { useSessionSnapshot } from "@/auth/session-state";
import { useGoalProfileStore } from "@/stores/goal-profile-store";
import { Button } from "@/ui/components";
import { Screen } from "@/ui/screen";
import { useZoptionTheme } from "@/ui/theme-provider";
import { typography } from "@/ui/tokens";

import { GoalChoices } from "./GoalChoices";
import { useGoalActions, type GoalChoice } from "./use-goal-actions";

/** The one-time soft prompt. Never blocks: Skip is always visible, and a failed save keeps the app usable. */
export function PrimaryGoalScreen() {
  const theme = useZoptionTheme();
  const session = useSessionSnapshot();
  const profile = useGoalProfileStore((state) => state.profile);
  const actions = useGoalActions();
  const [thanked, setThanked] = useState(false);

  useEffect(() => {
    // Best effort: the server records one "shown" row per workspace.
    void session
      .getAccessToken(false)
      .then((accessToken) => markGoalShown({ accessToken }))
      .catch(() => undefined);
  }, [session]);

  const choose = async (choice: GoalChoice) => {
    if (await actions.save(choice)) setThanked(true);
  };
  const skip = async () => {
    await actions.skip();
    router.back();
  };

  // Only a saved answer is thanked: a failed save stays on the picker, and Skip just leaves.
  if (thanked) {
    return (
      <Screen title="Thank you!">
        <Text style={[typography.body, { color: theme.colors.textMuted }]}>
          Thanks for taking a moment to tell us. We&apos;ve set Zoption up around what matters to
          you.
        </Text>
        <Button onPress={() => router.back()}>Continue</Button>
      </Screen>
    );
  }

  return (
    <Screen title="What brings you to Zoption?">
      <Text style={[typography.body, { color: theme.colors.textMuted }]}>
        So we can set up the right starting point for you.
      </Text>
      <GoalChoices
        goals={profile?.goals ?? []}
        confirmLabel="Continue"
        otherText={profile?.otherText ?? null}
        disabled={actions.busy}
        onChoose={(choice) => void choose(choice)}
      />
      {actions.error ? (
        <Text
          accessibilityRole="alert"
          style={[typography.caption, { color: theme.colors.danger }]}
        >
          {actions.error}
        </Text>
      ) : null}
      {/* Skip always leaves the screen, even when the request fails offline; the prompt returns next launch. */}
      <Button variant="quiet" onPress={() => void skip()}>
        Skip for now
      </Button>
    </Screen>
  );
}
