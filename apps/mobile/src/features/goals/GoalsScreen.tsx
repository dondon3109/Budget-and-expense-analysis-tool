import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { router } from "expo-router";
import { useCallback } from "react";
import { Pressable, StyleSheet, Text, View, type DimensionValue } from "react-native";

import { useGoals, useLocalWorkspace } from "@/db/local-workspace-state";
import type { LocalGoalItem } from "@/db/view-models";
import { useSyncState } from "@/sync/sync-state";
import { Button, Card, EmptyState, ErrorState, MoneyValue, Skeleton } from "@/ui/components";
import { Screen } from "@/ui/screen";
import { useZoptionTheme } from "@/ui/theme-provider";
import { radii, spacing, typography } from "@/ui/tokens";
import { goalStatusLabel } from "./goal-form";
import { withTapSound } from "@/features/sounds/sound-effects";

export function GoalsScreen() {
  const local = useLocalWorkspace();
  const sync = useSyncState();
  const state = useGoals();

  const handleRefresh = useCallback(async () => {
    sync.retry();
    state.retry();
    await new Promise((resolve) => setTimeout(resolve, 650));
  }, [state, sync]);

  const addGoal = (): void => {
    router.push("/(app)/goal");
  };

  const goals = state.goals;
  const hasGoals = !state.error && !state.loading && goals.length > 0;

  return (
    <Screen
      hasHeader
      onRefresh={handleRefresh}
      overlay={
        hasGoals ? (
          <View pointerEvents="box-none" style={styles.fab}>
            <Button disabled={!local.workspace} icon="plus" onPress={addGoal} variant="primary">
              Goal
            </Button>
          </View>
        ) : null
      }
      refreshing={sync.status === "syncing"}
      title="Goals"
    >
      {state.error ? (
        <ErrorState message={state.error} onRetry={state.retry} title="Goals unavailable" />
      ) : state.loading ? (
        <View accessibilityLabel="Loading goals" style={{ gap: spacing.sm }}>
          <Skeleton height={88} />
          <Skeleton height={88} />
        </View>
      ) : goals.length === 0 ? (
        <EmptyState
          icon="target"
          title="No goals yet"
          description="Save toward an emergency fund or a big purchase and watch it grow."
          action={
            <Button disabled={!local.workspace} onPress={addGoal} variant="primary">
              Add goal
            </Button>
          }
        />
      ) : (
        <View style={{ gap: spacing.sm }}>
          <GoalsSummary goals={goals} />
          {goals.map((goal) => (
            <GoalRow
              key={goal.id}
              goal={goal}
              onPress={() => router.push({ pathname: "/(app)/goal", params: { id: goal.id } })}
            />
          ))}
          <View style={styles.fabClearance} />
        </View>
      )}
    </Screen>
  );
}

function GoalsSummary({ goals }: { goals: LocalGoalItem[] }) {
  const theme = useZoptionTheme();
  const saved = goals.reduce((sum, goal) => sum + goal.currentAmountMinor, 0);
  const target = goals.reduce((sum, goal) => sum + goal.targetAmountMinor, 0);
  return (
    <Card>
      <Text style={[typography.caption, { color: theme.colors.textMuted }]}>Saved so far</Text>
      <Text style={[typography.title, { color: theme.colors.text }]}>
        <MoneyValue amountMinor={saved} style={typography.title} /> of{" "}
        <MoneyValue amountMinor={target} style={typography.title} />
      </Text>
    </Card>
  );
}

function GoalRow({ goal, onPress }: { goal: LocalGoalItem; onPress: () => void }) {
  const theme = useZoptionTheme();
  const percent =
    goal.targetAmountMinor > 0
      ? Math.min(100, Math.round((goal.currentAmountMinor / goal.targetAmountMinor) * 100))
      : 0;
  const remainingMinor = Math.max(0, goal.targetAmountMinor - goal.currentAmountMinor);
  const conflicted = goal.syncState === "conflicted";
  const failed = goal.syncState === "failed";
  return (
    <Pressable
      accessibilityRole="button"
      android_ripple={{ color: "rgba(10, 117, 86, 0.12)", borderless: false }}
      onPress={withTapSound(onPress)}
    >
      <Card
        accessibilityLabel={`Goal ${goal.name}, ${percent}% funded`}
        style={{
          borderColor: conflicted ? theme.colors.warning : failed ? theme.colors.danger : undefined,
        }}
      >
        <View style={{ gap: spacing.xs }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs }}>
            <MaterialCommunityIcons
              accessibilityElementsHidden
              color={theme.colors.brand}
              name="target"
              size={20}
            />
            <Text
              numberOfLines={1}
              style={[typography.headline, { color: theme.colors.text, flex: 1 }]}
            >
              {goal.name}
            </Text>
            <View style={[styles.chip, { backgroundColor: theme.colors.brandSoft }]}>
              <Text style={[typography.caption, { color: theme.colors.brand }]}>
                {goalStatusLabel(goal.status)}
              </Text>
            </View>
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between", gap: spacing.sm }}>
            <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
              <MoneyValue amountMinor={goal.currentAmountMinor} /> of{" "}
              <MoneyValue amountMinor={goal.targetAmountMinor} />
            </Text>
            <Text style={[typography.caption, { color: theme.colors.textMuted }]}>{percent}%</Text>
          </View>
          <View style={[styles.track, { backgroundColor: theme.colors.border }]}>
            <View
              style={[
                styles.fill,
                {
                  width: `${percent}%` as DimensionValue,
                  backgroundColor: theme.colors.brand,
                },
              ]}
            />
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between", gap: spacing.sm }}>
            <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
              {remainingMinor > 0 ? (
                <>
                  <MoneyValue
                    amountMinor={remainingMinor}
                    style={[typography.caption, { color: theme.colors.textMuted }]}
                  />{" "}
                  to go
                </>
              ) : (
                "Goal reached"
              )}
              {" · by "}
              {goal.targetDate}
            </Text>
            {conflicted ? (
              <Button
                accessibilityLabel={`Review conflict for ${goal.name}`}
                onPress={() =>
                  router.push({ pathname: "/(app)/goal-conflict", params: { id: goal.id } })
                }
                variant="secondary"
              >
                Review
              </Button>
            ) : failed ? (
              <MaterialCommunityIcons
                accessibilityElementsHidden
                color={theme.colors.danger}
                name="cloud-alert-outline"
                size={18}
              />
            ) : goal.syncState === "pending" ? (
              <MaterialCommunityIcons
                accessibilityElementsHidden
                color={theme.colors.warning}
                name="cloud-upload-outline"
                size={18}
              />
            ) : null}
          </View>
          {conflicted || failed ? (
            <Text
              style={[
                typography.caption,
                { color: conflicted ? theme.colors.warning : theme.colors.danger },
              ]}
            >
              {conflicted ? "Conflict preserved" : "Sync needs repair"}
            </Text>
          ) : null}
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: { height: 8, borderRadius: radii.round, overflow: "hidden" },
  fill: { height: 8, borderRadius: radii.round },
  chip: { borderRadius: radii.round, paddingHorizontal: spacing.xs, paddingVertical: spacing.xxs },
  fab: { position: "absolute", right: spacing.md, bottom: spacing.md },
  fabClearance: { height: 48 },
});
