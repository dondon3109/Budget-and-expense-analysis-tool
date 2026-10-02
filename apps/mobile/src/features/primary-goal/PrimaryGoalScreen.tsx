import { router } from "expo-router";
import { useEffect } from "react";
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

  useEffect(() => {
    // Best effort: the server records one "shown" row per workspace.
    void session
      .getAccessToken(false)
      .then((accessToken) => markGoalShown({ accessToken }))
      .catch(() => undefined);
  }, [session]);

  const choose = async (choice: GoalChoice) => {
    if (await actions.save(choice)) router.back();
  };
  const skip = async () => {
    await actions.skip();
    router.back();
  };

  return (
    <Screen title="What brings you to Zoption?">
      <Text style={[typography.body, { color: theme.colors.textMuted }]}>
        So we can set up the right starting point for you.
      </Text>
      <GoalChoices
        goal={profile?.goal ?? null}
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
