import { useNetInfo } from "@react-native-community/netinfo";
import { primaryGoalLabels } from "@zoption/shared";
import { Text } from "react-native";

import { useSessionSnapshot } from "@/auth/session-state";
import { isDummyDevelopmentSubject } from "@/db/demo-seed";
import { useGoalProfileStore } from "@/stores/goal-profile-store";
import { CollapsibleCard } from "@/ui/components";
import { useZoptionTheme } from "@/ui/theme-provider";
import { typography } from "@/ui/tokens";

import { GoalChoices } from "./GoalChoices";
import { useGoalActions } from "./use-goal-actions";

/** View or change the goal from More. Hidden until the Worker has answered, so offline never shows a stale choice. */
export function GoalSettingsCard() {
  const theme = useZoptionTheme();
  const session = useSessionSnapshot();
  const netInfo = useNetInfo();
  const profile = useGoalProfileStore((state) => state.profile);
  const actions = useGoalActions();

  if (!profile || isDummyDevelopmentSubject(session.subject)) return null;
  const offline = (netInfo.isInternetReachable ?? netInfo.isConnected) === false;

  return (
    <CollapsibleCard
      title="Your goal"
      summary={profile.goal ? primaryGoalLabels[profile.goal] : "Not set"}
      icon="flag-outline"
    >
      <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
        {offline
          ? "Connect to the internet to change your goal."
          : "Changes the first action we suggest and the assistant's starter question."}
      </Text>
      <GoalChoices
        goal={profile.goal}
        otherText={profile.otherText}
        disabled={actions.busy || offline}
        onChoose={(choice) => void actions.save(choice)}
      />
      {actions.error ? (
        <Text style={[typography.caption, { color: theme.colors.danger }]}>{actions.error}</Text>
      ) : null}
    </CollapsibleCard>
  );
}
