import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { assistantActionSchema } from "@zoption/shared";
import { confirmAssistantAction, type AssistantWireMessage } from "@/api/assistant";
import { ApiTransportError } from "@/api/authenticated";
import { useSessionSnapshot } from "@/auth/session-state";
import { useSyncState } from "@/sync/sync-state";
import { Button } from "@/ui/components/Button";
import { useZoptionTheme } from "@/ui/theme-provider";
import { radii, spacing, typography } from "@/ui/tokens";

import { ASSISTANT_AVATAR_SIZE } from "./assistant-ui";

const DONE_LABEL: Record<string, string> = {
  create: "Added",
  update: "Changed",
  set: "Changed",
  delete: "Deleted",
  archive: "Archived",
  adjust: "Balance updated",
};

/** The newest reply that proposed a subscription, goal, or debt change; older ones are replaced. */
export function latestActionMessageId(
  messages: readonly AssistantWireMessage[],
): string | undefined {
  return messages.findLast(
    (message) => assistantActionSchema.safeParse(message.metadata?.assistantAction).success,
  )?.id;
}

/**
 * The review card for a subscription, goal, or debt change the assistant proposed. The summary
 * is written by the server from the stored proposal; Confirm applies that proposal and nothing
 * the app sends, then pulls the result into the local workspace.
 */
export function AssistantActionCard({
  message,
  superseded,
  onDone,
}: {
  message: AssistantWireMessage;
  superseded: boolean;
  onDone: (done: AssistantWireMessage) => void;
}) {
  const theme = useZoptionTheme();
  const session = useSessionSnapshot();
  const sync = useSyncState();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const parsed = assistantActionSchema.safeParse(message.metadata?.assistantAction);
  if (!parsed.success) return null;
  const action = parsed.data;
  const destructive = action.kind.startsWith("delete_");
  const done = action.status === "done";

  async function confirm() {
    setWorking(true);
    setError(null);
    try {
      const run = async (refresh: boolean) =>
        confirmAssistantAction({ accessToken: await session.getAccessToken(refresh) }, message.id);
      const result = await run(false).catch((cause: unknown) => {
        if (cause instanceof ApiTransportError && cause.code === "session_expired") {
          return run(true);
        }
        throw cause;
      });
      onDone(result);
      // The server applied the change, so pull it into the local workspace now.
      sync.retry();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The change could not be applied.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <View
      accessibilityLabel="Proposed change"
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.surfaceRaised,
          borderColor: theme.colors.border,
          borderLeftColor: destructive ? theme.colors.danger : theme.colors.border,
        },
      ]}
    >
      <Text style={[typography.body, { color: theme.colors.text }]}>{action.summary}</Text>
      {done ? (
        <Text style={[typography.body, { color: theme.colors.income }]}>
          {DONE_LABEL[action.kind.split("_")[0]!]}
        </Text>
      ) : superseded ? (
        <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
          Replaced by a newer proposal below.
        </Text>
      ) : (
        <>
          <Button
            variant={destructive ? "danger" : "primary"}
            size="compact"
            loading={working}
            onPress={() => void confirm()}
          >
            {destructive ? "Delete" : "Confirm"}
          </Button>
          <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
            Nothing changes until you confirm. Ask me to adjust anything first.
          </Text>
        </>
      )}
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
  card: {
    marginTop: spacing.sm,
    marginLeft: ASSISTANT_AVATAR_SIZE + spacing.xs,
    maxWidth: "86%",
    padding: spacing.md,
    gap: spacing.sm,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: 3,
  },
});
