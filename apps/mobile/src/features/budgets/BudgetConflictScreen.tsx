import { Stack, router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useBudgetConflict, useLocalWorkspace } from "@/db/local-workspace-state";
import type { LocalBudgetConflictVersion } from "@/db/transaction-mutation-repository";
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
import { monthLabel } from "./budget-form";

function singleParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function VersionCard({
  title,
  version,
}: {
  title: string;
  version: LocalBudgetConflictVersion | null;
}) {
  const theme = useZoptionTheme();
  return (
    <Card accessibilityLabel={title}>
      <Text accessibilityRole="header" style={[typography.headline, { color: theme.colors.text }]}>
        {title}
      </Text>
      {!version ? (
        <Text style={[typography.body, { color: theme.colors.textMuted }]}>No budget</Text>
      ) : (
        <>
          <View style={styles.categoryRow}>
            <View style={[styles.dot, { backgroundColor: version.categoryColor }]} />
            <Text style={[typography.body, { color: theme.colors.text, flex: 1 }]}>
              {version.categoryName}
            </Text>
          </View>
          <Text style={[typography.callout, { color: theme.colors.textMuted }]}>
            {monthLabel(version.month)}
          </Text>
          <View style={styles.limitRow}>
            <Text style={[typography.callout, { color: theme.colors.textMuted }]}>Limit</Text>
            <MoneyValue amountMinor={version.limitMinor} />
          </View>
        </>
      )}
    </Card>
  );
}

export function BudgetConflictScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = singleParam(params.id);
  const local = useLocalWorkspace();
  const sync = useSyncState();
  const state = useBudgetConflict(id);
  const theme = useZoptionTheme();
  const [choice, setChoice] = useState<"keep_local" | "keep_server" | null>(null);
  const [resolving, setResolving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const resolve = async (): Promise<void> => {
    if (!choice || !id || !local.workspace || resolving) return;
    setResolving(true);
    setMessage(null);
    try {
      await local.workspace.transactionMutations.resolveBudgetConflict(id, choice);
      setChoice(null);
      router.dismissTo("/budgets");
      sync.retry();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The preserved budget conflict could not be resolved safely.",
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
      <Stack.Screen options={{ title: "Review budget conflict" }} />
      {state.error ? (
        <View className="flex-1 justify-center px-4">
          <ErrorState title="Conflict unavailable" message={state.error} onRetry={state.retry} />
        </View>
      ) : state.loading ? (
        <View accessibilityLabel="Loading conflict" className="gap-4 px-4 pt-6">
          <Skeleton height={128} />
          <Skeleton height={128} />
        </View>
      ) : !state.conflict ? (
        <View className="flex-1 justify-center px-4">
          <ErrorState
            title="Conflict already resolved"
            message="There is no unresolved conflict for this budget."
          />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          contentInsetAdjustmentBehavior="automatic"
        >
          <View className="gap-2">
            <Text
              accessibilityRole="header"
              style={[typography.title, { color: theme.colors.text }]}
            >
              Choose the limit to keep
            </Text>
            <Text style={[typography.callout, { color: theme.colors.textMuted }]}>
              Zoption preserved both limits. No device timestamp decides this choice.
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
            Keep this device limit
          </Button>
          <Button disabled={resolving} onPress={() => setChoice("keep_server")} variant="secondary">
            Use server limit
          </Button>
        </ScrollView>
      )}
      <ConfirmationDialog
        confirmLabel={choice === "keep_local" ? "Keep mine" : "Use server"}
        message={
          choice === "keep_local"
            ? "Zoption will create a new operation based on the latest server revision. It may conflict again if the server changes first."
            : "Zoption will discard this device's proposed limit and replace it with the preserved server limit."
        }
        onCancel={() => setChoice(null)}
        onConfirm={() => void resolve()}
        title={choice === "keep_local" ? "Keep this device limit?" : "Use server limit?"}
        visible={choice !== null}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    gap: spacing.lg,
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  categoryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  limitRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  dot: { width: 12, height: 12, borderRadius: 6 },
});
