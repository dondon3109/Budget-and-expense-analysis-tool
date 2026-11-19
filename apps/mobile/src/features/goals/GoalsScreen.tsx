import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { router } from "expo-router";
import { useCallback } from "react";
import { Pressable, StyleSheet, Text, View, type DimensionValue } from "react-native";

import type { FinancialGoalStatus } from "@zoption/shared";
import { useGoals, useLocalWorkspace } from "@/db/local-workspace-state";
import type { LocalGoalItem } from "@/db/view-models";
import { SectionHeader } from "@/features/budgets/BudgetPlanView";
import { withTapSound } from "@/features/sounds/sound-effects";
import { useSyncState } from "@/sync/sync-state";
import { Button, EmptyState, ErrorState, MoneyValue, Skeleton } from "@/ui/components";
import { Screen } from "@/ui/screen";
import { useZoptionTheme } from "@/ui/theme-provider";
import { radii, spacing, typography } from "@/ui/tokens";

const SMALL_MONEY = { fontSize: 12, lineHeight: 16, fontWeight: "600" as const };

/** Active goals lead; paused and completed ones follow so they stay reachable without crowding. */
const SECTIONS: { status: FinancialGoalStatus; title: string }[] = [
  { status: "active", title: "Active" },
  { status: "paused", title: "Paused" },
  { status: "completed", title: "Completed" },
];

function percentSaved(currentMinor: number, targetMinor: number): number {
  if (targetMinor <= 0) return 0;
  return Math.min(100, Math.round((currentMinor / targetMinor) * 100));
}

function targetDateLabel(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) return date;
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function statusIcon(status: FinancialGoalStatus) {
  if (status === "completed") return "check-circle-outline" as const;
  if (status === "paused") return "pause-circle-outline" as const;
  return "target" as const;
}

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
        <View accessibilityLabel="Loading goals" style={{ gap: spacing.md }}>
          <Skeleton height={96} />
          <Skeleton height={64} />
          <Skeleton height={64} />
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
        <View style={{ gap: spacing.lg }}>
          <GoalsHero goals={goals} />
          {SECTIONS.map(({ status, title }) => {
            const items = goals.filter((goal) => goal.status === status);
            if (items.length === 0) return null;
            return (
              <View key={status}>
                <SectionHeader
                  title={title}
                  trailing={`${items.length} ${items.length === 1 ? "goal" : "goals"}`}
                />
                {items.map((goal) => (
                  <GoalRow
                    key={goal.id}
                    goal={goal}
                    onPress={() =>
                      router.push({ pathname: "/(app)/goal", params: { id: goal.id } })
                    }
                  />
                ))}
              </View>
            );
          })}
          <View style={styles.fabClearance} />
        </View>
      )}
    </Screen>
  );
}

/**
 * The headline: what active goals have saved, one bar, and the combined target. Paused and
 * completed goals stay out of it so the number reflects what is still being worked toward. When
 * nothing is active it falls back to every goal.
 */
function GoalsHero({ goals }: { goals: LocalGoalItem[] }) {
  const theme = useZoptionTheme();
  const active = goals.filter((goal) => goal.status === "active");
  const counted = active.length > 0 ? active : goals;
  const saved = counted.reduce((sum, goal) => sum + goal.currentAmountMinor, 0);
  const target = counted.reduce((sum, goal) => sum + goal.targetAmountMinor, 0);
  const percent = percentSaved(saved, target);
  return (
    <View accessible accessibilityLabel="Goals summary" style={styles.hero}>
      <Text style={[typography.caption, styles.heroLabel, { color: theme.colors.textMuted }]}>
        SAVED SO FAR
      </Text>
      <MoneyValue amountMinor={saved} maxFontSizeMultiplier={1.2} style={styles.heroAmount} />
      <ProgressLine color={String(theme.colors.brand)} height={6} percent={percent} />
      <View style={styles.heroMeta}>
        <Text style={[typography.callout, { color: theme.colors.textMuted }]}>
          of <MoneyValue amountMinor={target} style={SMALL_MONEY} />
          {active.length > 0
            ? ` across ${active.length} active ${active.length === 1 ? "goal" : "goals"}`
            : ""}
        </Text>
        <Text style={[typography.label, { color: theme.colors.textMuted }]}>{percent}%</Text>
      </View>
    </View>
  );
}

function ProgressLine({
  percent,
  color,
  height = 3,
}: {
  percent: number;
  color: string;
  height?: number;
}) {
  const theme = useZoptionTheme();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.track, { height, backgroundColor: theme.colors.border }]}
    >
      <View
        style={{
          height,
          borderRadius: radii.round,
          width: `${percent}%` as DimensionValue,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

/** One goal: a divider-separated row with an icon tile, what is left, and a thin bar. */
function GoalRow({ goal, onPress }: { goal: LocalGoalItem; onPress: () => void }) {
  const theme = useZoptionTheme();
  const percent = percentSaved(goal.currentAmountMinor, goal.targetAmountMinor);
  const remainingMinor = Math.max(0, goal.targetAmountMinor - goal.currentAmountMinor);
  const reached = remainingMinor === 0;
  const muted = goal.status !== "active";
  const accent = muted ? String(theme.colors.textMuted) : String(theme.colors.brand);
  return (
    <View style={[styles.row, { borderBottomColor: theme.colors.border }]}>
      <Pressable
        accessibilityHint="Edit this goal"
        accessibilityLabel={`Goal ${goal.name}, ${percent}% funded`}
        accessibilityRole="button"
        android_ripple={{ color: "rgba(10, 117, 86, 0.12)", borderless: false }}
        onPress={withTapSound(onPress)}
        style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
      >
        <View style={styles.rowTop}>
          <View
            style={[
              styles.iconTile,
              { backgroundColor: muted ? theme.colors.canvasMuted : theme.colors.brandSoft },
            ]}
          >
            <MaterialCommunityIcons
              accessibilityElementsHidden
              color={accent}
              name={statusIcon(goal.status)}
              size={20}
            />
          </View>
          <View style={styles.rowText}>
            <Text numberOfLines={1} style={[typography.headline, { color: theme.colors.text }]}>
              {goal.name}
            </Text>
            <Text numberOfLines={1} style={[typography.caption, { color: theme.colors.textMuted }]}>
              <MoneyValue amountMinor={goal.currentAmountMinor} style={SMALL_MONEY} /> of{" "}
              <MoneyValue amountMinor={goal.targetAmountMinor} style={SMALL_MONEY} />
              {"  ·  by "}
              {targetDateLabel(goal.targetDate)}
            </Text>
          </View>
          <View style={styles.rowRight}>
            {reached ? (
              <Text style={[typography.label, { color: theme.colors.income }]}>Goal reached</Text>
            ) : (
              <>
                <MoneyValue
                  amountMinor={remainingMinor}
                  maxFontSizeMultiplier={1.2}
                  style={styles.rowAmount}
                />
                <Text style={[typography.caption, { color: theme.colors.textMuted }]}>to go</Text>
              </>
            )}
          </View>
        </View>
        <View style={styles.rowBar}>
          <ProgressLine color={accent} percent={percent} />
        </View>
      </Pressable>

      {goal.syncState === "conflicted" ? (
        <Pressable
          accessibilityLabel={`Review conflict for ${goal.name}`}
          accessibilityRole="button"
          onPress={withTapSound(() =>
            router.push({ pathname: "/(app)/goal-conflict", params: { id: goal.id } }),
          )}
          style={styles.statusLine}
        >
          <MaterialCommunityIcons
            color={theme.colors.warning}
            name="alert-circle-outline"
            size={14}
          />
          <Text style={[typography.caption, { color: theme.colors.warning }]}>
            Conflict preserved. Review
          </Text>
        </Pressable>
      ) : goal.syncState === "failed" ? (
        <View style={styles.statusLine}>
          <MaterialCommunityIcons
            color={theme.colors.danger}
            name="cloud-alert-outline"
            size={14}
          />
          <Text style={[typography.caption, { color: theme.colors.danger }]}>
            Sync needs repair
          </Text>
        </View>
      ) : goal.syncState === "pending" ? (
        <View style={styles.statusLine}>
          <MaterialCommunityIcons
            color={theme.colors.textMuted}
            name="cloud-upload-outline"
            size={14}
          />
          <Text style={[typography.caption, { color: theme.colors.textMuted }]}>Pending sync</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { gap: spacing.xs, paddingVertical: spacing.sm },
  heroLabel: { letterSpacing: 0.8 },
  heroAmount: { fontSize: 36, lineHeight: 42, letterSpacing: -1 },
  heroMeta: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  track: { width: "100%", borderRadius: radii.round, overflow: "hidden" },
  row: { paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth },
  rowTop: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  rowText: { flex: 1, gap: 2 },
  rowRight: { alignItems: "flex-end", gap: 2 },
  rowAmount: { fontSize: 16, lineHeight: 20 },
  rowBar: { marginTop: spacing.sm },
  statusLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
    marginTop: spacing.xs,
  },
  iconTile: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
  },
  fab: { position: "absolute", right: spacing.md, bottom: spacing.md },
  fabClearance: { height: 48 },
});
