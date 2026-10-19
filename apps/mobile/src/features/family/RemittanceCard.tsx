import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useRemittanceOverview } from "@/db/local-workspace-state";
import type { LocalRemittance } from "@/db/remittance-queries";
import { Button, Card, formatMoneyMinor } from "@/ui/components";
import { useZoptionTheme } from "@/ui/theme-provider";
import { spacing, typography } from "@/ui/tokens";

import { useActiveWorkspace } from "./active-workspace";

const RECENT_SHOWN = 3;

function open(id?: string): void {
  router.push(id ? { pathname: "/(app)/remittance", params: { id } } : "/(app)/remittance");
}

/**
 * Home in a family: money sent home this month, what the family spent, and what is left, with
 * sends still on the way. Until the family records a remittance it is a single prompt.
 */
export function RemittanceCard({ month }: { month: string }) {
  const theme = useZoptionTheme();
  const role = useActiveWorkspace().family?.role;
  const { overview } = useRemittanceOverview(month);
  if (!overview || !role) return null;
  const canWrite = role !== "viewer";
  const muted = { color: theme.colors.textMuted };
  const money = (amountMinor: number) => formatMoneyMinor(amountMinor, overview.currency);

  if (!overview.hasRemittances) {
    if (!canWrite) return null;
    return (
      <Card style={{ gap: spacing.xs }}>
        <Text style={[typography.callout, muted]}>
          Sending money home? Record it here, and the family sees what arrived and what is left.
        </Text>
        <Button onPress={() => open()} variant="secondary">
          Record a remittance
        </Button>
      </Card>
    );
  }

  const row = (item: LocalRemittance, title: string, detail: string) => (
    <Pressable
      accessibilityRole="button"
      key={item.id}
      onPress={() => open(item.id)}
      style={styles.item}
    >
      <Text style={[typography.body, { color: theme.colors.text }]}>{title}</Text>
      <Text style={[typography.callout, muted]}>
        {detail}
        {item.syncState === "failed" || item.syncState === "conflicted"
          ? " · not accepted"
          : item.syncState === "pending"
            ? " · waiting to sync"
            : ""}
      </Text>
    </Pressable>
  );

  return (
    <Card style={{ gap: spacing.sm }}>
      <View style={styles.header}>
        <Text style={[typography.headline, { color: theme.colors.text }]}>Money sent home</Text>
        {canWrite ? (
          <Button onPress={() => open()} variant="quiet">
            Record
          </Button>
        ) : null}
      </View>
      <View style={styles.totals}>
        {[
          ["Sent", overview.month.sentMinor],
          ["Spent", overview.month.spentMinor],
          ["Left now", overview.leftMinor],
        ].map(([label, value]) => (
          <View key={label} style={styles.total}>
            <Text style={[typography.caption, muted]}>{label}</Text>
            <Text style={[typography.headline, { color: theme.colors.text }]}>
              {money(Number(value))}
            </Text>
          </View>
        ))}
      </View>
      {overview.pending.map((item) =>
        row(
          item,
          `${formatMoneyMinor(item.sentAmountMinor, item.sentCurrency)} on the way`,
          `Sent ${item.sentOn}${item.provider ? ` via ${item.provider}` : ""}`,
        ),
      )}
      {overview.recent
        .slice(0, RECENT_SHOWN)
        .map((item) =>
          row(
            item,
            `${formatMoneyMinor(item.received!.amountMinor, item.received!.currency)} arrived`,
            `${item.received!.date}${item.provider ? ` via ${item.provider}` : ""}`,
          ),
        )}
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  totals: { flexDirection: "row", gap: spacing.sm },
  total: { flex: 1, gap: 2 },
  item: { gap: 2, paddingVertical: spacing.xxs },
});
