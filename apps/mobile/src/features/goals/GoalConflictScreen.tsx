import { Stack, router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useGoalConflict, useLocalWorkspace } from "@/db/local-workspace-state";
import type { LocalGoalConflictVersion } from "@/db/transaction-mutation-repository";
import { useSyncState } from "@/sync/sync-state";
import {
  Button,
  Card,
  ConfirmationDialog,
  ErrorState,
  MoneyValue,
  Skeleton,
} from "@/ui/components";
import { spacing, typography } from "@/ui/tokens";
import { useZoptionTheme } from "@/ui/theme-provider";
import { goalStatusLabel } from "./goal-form";

function singleParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function VersionCard({
  title,
  version,
}: {
  title: string;
  version: LocalGoalConflictVersion | null;
}) {
  const theme = useZoptionTheme();
  return (
    <Card accessibilityLabel={title}>
      <Text accessibilityRole="header" style={[typography.headline, { color: theme.colors.text }]}>
        {title}
      </Text>
      {!version ? (
        <Text style={[typography.body, { color: theme.colors.textMuted }]}>No goal</Text>
      ) : (
        <>
          <Text style={[typography.body, { color: theme.colors.text }]}>{version.name}</Text>
          <Text style={[typography.callout, { color: theme.colors.textMuted }]}>
            {goalStatusLabel(version.status)} · target {version.targetDate}
          </Text>
          <View style={styles.amountRow}>
            <Text style={[typography.callout, { color: theme.colors.textMuted }]}>Saved</Text>
            <MoneyValue amountMinor={version.currentAmountMinor} />
          </View>
          <View style={styles.amountRow}>
            <Text style={[typography.callout, { color: theme.colors.textMuted }]}>Target</Text>
            <MoneyValue amountMinor={version.targetAmountMinor} />
          </View>
        </>
      )}
    </Card>
  );
}

export function GoalConflictScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = singleParam(params.id);
  const local = useLocalWorkspace();
  const sync = useSyncState();
  const state = useGoalConflict(id);
  const theme = useZoptionTheme();
  const [choice, setChoice] = useState<"keep_local" | "keep_server" | null>(null);
  const [resolving, setResolving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const resolve = async (): Promise<void> => {
    if (!choice || !id || !local.workspace || resolving) return;
    setResolving(true);
    setMessage(null);
    try {
      await local.workspace.transactionMutations.resolveGoalConflict(id, choice);
      setChoice(null);
      router.back();
      sync.retry();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The preserved goal conflict could not be resolved safely.",
      );
      setChoice(null);
    } finally {
      setResolving(false);
    }
  };

  return (
    <SafeAreaView
      edges={["bottom", "left", "right"]}
      style={[styles.safe, { backgroundColor: theme.colors.canvas }]}
    >
      <Stack.Screen options={{ title: "Review goal conflict" }} />
      {state.error ? (
        <View style={styles.centered}>
          <ErrorState title="Conflict unavailable" message={state.error} onRetry={state.retry} />
        </View>
      ) : state.loading ? (
        <View accessibilityLabel="Loading conflict" style={styles.centered}>
          <Skeleton height={128} />
        </View>
      ) : !state.conflict ? (
        <View style={styles.centered}>
          <ErrorState
            title="Conflict already resolved"
            message="There is no unresolved conflict for this goal."
          />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          contentInsetAdjustmentBehavior="automatic"
        >
          <View style={styles.intro}>
            <Text
              accessibilityRole="header"
              style={[typography.title, { color: theme.colors.text }]}
            >
              Choose the goal to keep
            </Text>
            <Text style={[typography.callout, { color: theme.colors.textMuted }]}>
              Zoption preserved both versions. No device timestamp decides this choice.
            </Text>
          </View>
          <VersionCard title="On this device" version={state.conflict.local} />
          <VersionCard title="On the server" version={state.conflict.server} />
          {message ? (
            <Text
              accessibilityRole="alert"
              style={[typography.callout, { color: theme.colors.danger }]}
            >
              {message}
            </Text>
          ) : null}
          <Button disabled={resolving} onPress={() => setChoice("keep_local")}>
            Keep this device goal
          </Button>
          <Button disabled={resolving} onPress={() => setChoice("keep_server")} variant="secondary">
            Use server goal
          </Button>
        </ScrollView>
      )}
      <ConfirmationDialog
        confirmLabel={choice === "keep_local" ? "Keep mine" : "Use server"}
        message={
          choice === "keep_local"
            ? "Zoption will create a new operation based on the latest server revision. It may conflict again if the server changes first."
            : "Zoption will discard this device's proposed goal and replace it with the preserved server goal."
        }
        onCancel={() => setChoice(null)}
        onConfirm={() => void resolve()}
        title={choice === "keep_local" ? "Keep this device goal?" : "Use server goal?"}
        visible={choice !== null}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  centered: { flex: 1, justifyContent: "center", padding: spacing.md },
  content: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    gap: spacing.lg,
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  intro: { gap: spacing.xs },
  amountRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
});
