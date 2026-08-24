import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Stack, router } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList, type ListRenderItemInfo, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useCalendarMonth, useLocalWorkspace } from "@/db/local-workspace-state";
import { useSyncState } from "@/sync/sync-state";
import type { LocalCalendarDay } from "@/db/repository";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  MoneyValue,
  Skeleton,
  SyncStatus,
} from "@/ui/components";
import { radii, spacing, touchTarget, typography } from "@/ui/tokens";
import { useZoptionTheme } from "@/ui/theme-provider";
import { monthLabel, todayIso } from "./event-form";

function visibleSyncState(status: ReturnType<typeof useSyncState>["status"]) {
  if (status === "syncing") return "syncing" as const;
  if (status === "synced") return "synced" as const;
  if (status === "waiting") return "waiting" as const;
  return "failed" as const;
}

function currentMonthStart(): string {
  return todayIso().slice(0, 8) + "01";
}

function shiftMonth(month: string, delta: number): string {
  const date = new Date(month + "T00:00:00Z");
  date.setUTCMonth(date.getUTCMonth() + delta);
  return date.toISOString().slice(0, 10);
}

function dayTitle(date: string): string {
  const parsed = new Date(date + "T00:00:00Z");
  return parsed.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function DayCard({ day }: { day: LocalCalendarDay }) {
  const theme = useZoptionTheme();
  const hasContent =
    day.events.length > 0 || day.transactions.length > 0 || day.subscriptionBills.length > 0;
  if (!hasContent) return null;
  return (
    <Card accessibilityLabel={"Agenda for " + day.date}>
      <Text accessibilityRole="header" style={[typography.headline, { color: theme.colors.text }]}>
        {dayTitle(day.date)}
      </Text>
      {day.events.map((event) => (
        <Pressable
          key={event.id}
          accessibilityHint="Opens the event editor"
          accessibilityRole="button"
          accessibilityLabel={"Event " + event.title}
          android_ripple={{ color: "rgba(15, 107, 91, 0.12)", borderless: false }}
          onPress={() => router.push({ pathname: "/(app)/event", params: { id: event.id } })}
          style={styles.row}
        >
          <Text style={[typography.body, { color: theme.colors.text }]}>{event.title}</Text>
          <Text style={[typography.callout, { color: theme.colors.textMuted }]}>
            {event.startTime
              ? event.startTime + (event.endTime ? "–" + event.endTime : "")
              : "All day"}
            {event.syncState !== "synced" ? " · " + event.syncState : ""}
          </Text>
        </Pressable>
      ))}
      {day.subscriptionBills.map((bill) => (
        <View key={bill.id} style={styles.row}>
          <Text style={[typography.body, { color: theme.colors.text }]}>{bill.name}</Text>
          <View style={styles.rowRight}>
            <Text style={[typography.callout, { color: theme.colors.textMuted }]}>Billing day</Text>
            <MoneyValue amountMinor={bill.amountMinor} />
          </View>
        </View>
      ))}
      {day.transactions.map((transaction) => (
        <View key={transaction.id} style={styles.row}>
          <Text style={[typography.body, { color: theme.colors.text }]}>
            {transaction.description}
          </Text>
          <MoneyValue
            amountMinor={transaction.amountMinor}
            tone={transaction.kind === "income" ? "income" : "expense"}
          />
        </View>
      ))}
    </Card>
  );
}

const renderDay = ({ item }: ListRenderItemInfo<LocalCalendarDay>) => <DayCard day={item} />;

export function CalendarScreen() {
  const [month, setMonth] = useState(() => currentMonthStart());
  const state = useCalendarMonth(month);
  const local = useLocalWorkspace();
  const sync = useSyncState();
  const theme = useZoptionTheme();

  const content = useMemo(() => state.month?.days ?? [], [state.month]);

  return (
    <SafeAreaView
      edges={["bottom", "left", "right"]}
      style={[styles.safe, { backgroundColor: theme.colors.canvas }]}
    >
      <Stack.Screen options={{ title: "Calendar" }} />
      <View
        style={[
          styles.monthNav,
          { backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.border },
        ]}
      >
        <Pressable
          accessibilityLabel="Previous month"
          accessibilityRole="button"
          android_ripple={{ color: "rgba(15, 107, 91, 0.16)", borderless: false }}
          onPress={() => setMonth((value) => shiftMonth(value, -1))}
          style={[styles.monthButton, { borderColor: theme.colors.border }]}
        >
          <MaterialCommunityIcons
            accessibilityElementsHidden
            color={theme.colors.text}
            name="chevron-left"
            size={22}
          />
        </Pressable>
        <Text accessibilityRole="header" style={[typography.headline, { color: theme.colors.text }]}>
          {monthLabel(month)}
        </Text>
        <Pressable
          accessibilityLabel="Next month"
          accessibilityRole="button"
          android_ripple={{ color: "rgba(15, 107, 91, 0.16)", borderless: false }}
          onPress={() => setMonth((value) => shiftMonth(value, 1))}
          style={[styles.monthButton, { borderColor: theme.colors.border }]}
        >
          <MaterialCommunityIcons
            accessibilityElementsHidden
            color={theme.colors.text}
            name="chevron-right"
            size={22}
          />
        </Pressable>
      </View>
      <View style={{ paddingHorizontal: spacing.md, paddingVertical: spacing.xxs }}>
        <SyncStatus state={visibleSyncState(sync.status)} />
      </View>
      {state.error ? (
        <ErrorState title="Calendar unavailable" message={state.error} onRetry={state.retry} />
      ) : state.loading ? (
        <View accessibilityLabel="Loading calendar" style={styles.padded}>
          <Skeleton height={160} />
        </View>
      ) : (
        <FlatList
          data={content}
          keyExtractor={(day) => day.date}
          ListEmptyComponent={
            <EmptyState
              icon="calendar-month-outline"
              title="Nothing planned this month"
              description="Events, subscription bills, and transactions for this month will appear here."
            />
          }
          renderItem={renderDay}
          contentContainerStyle={styles.list}
        />
      )}
      {local.workspace ? (
        <View style={styles.addRow}>
          <Button
            accessibilityHint="Opens the event editor"
            onPress={() => router.push("/(app)/event")}
          >
            Add event
          </Button>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  padded: { padding: spacing.md },
  monthNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: radii.md,
    borderWidth: 1,
    padding: spacing.xs,
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  monthButton: {
    minWidth: touchTarget,
    minHeight: touchTarget,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.sm,
    borderWidth: 1,
  },
  list: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    gap: spacing.md,
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  addRow: { paddingHorizontal: spacing.md, paddingBottom: spacing.md },
  row: { gap: spacing.xxs },
  rowRight: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
});
