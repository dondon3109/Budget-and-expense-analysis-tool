import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View, type DimensionValue } from "react-native";

import { useGoals, useLocalWorkspace } from "@/db/local-workspace-state";
import type { LocalGoalItem } from "@/db/repository";
import { Button, Card, EmptyState, ErrorState, MoneyValue, Skeleton } from "@/ui/components";
import { Screen } from "@/ui/screen";
import { useZoptionTheme } from "@/ui/theme-provider";
import { radii, spacing, typography } from "@/ui/tokens";
import { goalStatusLabel } from "./goal-form";

export function GoalsScreen() {
  const local = useLocalWorkspace();
  const state = useGoals();

  const addGoal = (): void => {
    router.push("/(app)/goal");
  };

  return (
    <Screen
      action={
        <Button disabled={!local.workspace} onPress={addGoal} variant="primary">
          Add goal
        </Button>
      }
      description="Save toward a target. Changes sync when you reconnect."
      title="Goals"
    >
      {state.error ? (
        <ErrorState message={state.error} onRetry={state.retry} title="Goals unavailable" />
      ) : state.loading ? (
        <View accessibilityLabel="Loading goals" style={{ gap: spacing.sm }}>
          <Skeleton height={88} />
          <Skeleton height={88} />
        </View>
      ) : state.goals.length === 0 ? (
        <EmptyState
          icon="target"
          title="No goals yet"
          description="Add a savings goal like an emergency fund or a big purchase to track your progress."
          action={
            <Button disabled={!local.workspace} onPress={addGoal} variant="secondary">
              Create your first goal
            </Button>
          }
        />
      ) : (
        <View style={{ gap: spacing.md }}>
          {state.goals.map((goal) => (
            <GoalRow
              key={goal.id}
              goal={goal}
              onPress={() => router.push({ pathname: "/(app)/goal", params: { id: goal.id } })}
            />
          ))}
        </View>
      )}
    </Screen>
  );
}

function GoalRow({ goal, onPress }: { goal: LocalGoalItem; onPress: () => void }) {
  const theme = useZoptionTheme();
  const percent =
    goal.targetAmountMinor > 0
      ? Math.min(100, Math.round((goal.currentAmountMinor / goal.targetAmountMinor) * 100))
      : 0;
  const conflicted = goal.syncState === "conflicted";
  const failed = goal.syncState === "failed";
  return (
    <Pressable
      accessibilityRole="button"
      android_ripple={{ color: "rgba(15, 107, 91, 0.12)", borderless: false }}
      onPress={onPress}
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
          <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
            {goalStatusLabel(goal.status)}
          </Text>
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: spacing.sm }}>
          <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
            <MoneyValue amountMinor={goal.currentAmountMinor} /> of{" "}
            <MoneyValue amountMinor={goal.targetAmountMinor} />
          </Text>
          <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
            {percent}%
          </Text>
        </View>
        <View style={[styles.track, { backgroundColor: theme.colors.border }]}>
          <View
            style={[
              styles.fill,
              {
                width: (`${percent}%` as DimensionValue),
                backgroundColor: theme.colors.brand,
              },
            ]}
          />
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: spacing.sm }}>
          <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
            Target {goal.targetDate}
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
          <Text style={[typography.caption, { color: conflicted ? theme.colors.warning : theme.colors.danger }]}>
            {conflicted ? "Conflict preserved" : "Sync needs repair"}
          </Text>
        ) : null}
      </View>
    </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: { height: 6, borderRadius: radii.round, overflow: "hidden", marginTop: spacing.xxs },
  fill: { height: 6, borderRadius: radii.round },
});
