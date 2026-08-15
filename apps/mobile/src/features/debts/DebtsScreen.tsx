import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { calculateDebtPayoff, type DebtPayoffStrategy } from "@zoption/shared";

import { useDebts, useLocalWorkspace } from "@/db/local-workspace-state";
import type { LocalDebtItem } from "@/db/repository";
import { Button, Card, EmptyState, ErrorState, FormField, MoneyValue, SelectionField, Skeleton } from "@/ui/components";
import { Screen } from "@/ui/screen";
import { useZoptionTheme } from "@/ui/theme-provider";
import { spacing, typography } from "@/ui/tokens";
import { debtTypeLabels, todayIso } from "./debt-form";

const strategyOptions: Array<{ id: DebtPayoffStrategy; label: string; detail: string }> = [
  { id: "avalanche", label: "Avalanche", detail: "Highest interest rate first. Saves the most interest." },
  { id: "snowball", label: "Snowball", detail: "Smallest balance first. Faster wins, more interest." },
];

export function DebtsScreen() {
  const local = useLocalWorkspace();
  const state = useDebts();

  const addDebt = (): void => {
    router.push("/(app)/debt");
  };

  return (
    <Screen
      action={
        <Button disabled={!local.workspace} onPress={addDebt} variant="primary">
          Add debt
        </Button>
      }
      description="Track balances and compare payoff strategies offline."
      title="Debts"
    >
      {state.error ? (
        <ErrorState message={state.error} onRetry={state.retry} title="Debts unavailable" />
      ) : state.loading ? (
        <View accessibilityLabel="Loading debts" style={styles.stack}>
          <Skeleton height={88} />
          <Skeleton height={88} />
        </View>
      ) : state.debts.length === 0 ? (
        <EmptyState
          title="No debts yet"
          description="Add a credit card or loan to compare avalanche and snowball payoff plans."
        />
      ) : (
        <View style={styles.stack}>
          <PayoffPlanCard debts={state.debts} />
          {state.debts.map((debt) => (
            <DebtRow
              key={debt.id}
              debt={debt}
              onPress={() => router.push({ pathname: "/(app)/debt", params: { id: debt.id } })}
            />
          ))}
        </View>
      )}
    </Screen>
  );
}

function PayoffPlanCard({ debts }: { debts: LocalDebtItem[] }) {
  const theme = useZoptionTheme();
  const [strategy, setStrategy] = useState<DebtPayoffStrategy>("avalanche");
  const [extra, setExtra] = useState("");
  const projection = useMemo(() => {
    const active = debts.filter((debt) => debt.status === "active" && debt.balanceMinor > 0);
    if (active.length === 0) return null;
    const extraMinor = parseFloat(extra) > 0 ? Math.round(parseFloat(extra) * 100) : 0;
    try {
      return calculateDebtPayoff(
        active.map((debt) => ({
          id: debt.id,
          name: debt.name,
          balanceMinor: debt.balanceMinor,
          aprBasisPoints: debt.aprBasisPoints,
          minimumPaymentMinor: debt.minimumPaymentMinor,
        })),
        strategy,
        extraMinor,
        todayIso(),
      );
    } catch {
      return null;
    }
  }, [debts, extra, strategy]);
  return (
    <Card accessibilityLabel="Debt payoff plan">
      <View style={styles.stack}>
        <Text accessibilityRole="header" style={[typography.headline, { color: theme.colors.text }]}>
          Payoff plan
        </Text>
        <SelectionField
          label="Strategy"
          onSelect={(value) => setStrategy(value as DebtPayoffStrategy)}
          options={strategyOptions}
          placeholder="Choose a strategy"
          sheetTitle="Choose a payoff strategy"
          value={strategy}
        />
        <FormField
          keyboardType="decimal-pad"
          label="Extra monthly payment"
          maxLength={16}
          onChangeText={setExtra}
          placeholder="0.00"
          trailing={<Text style={[typography.label, { color: theme.colors.textMuted }]}>PHP</Text>}
          value={extra}
        />
        {projection && projection.status === "paid_off" && projection.payoffMonths !== null ? (
          <View style={styles.projectionRow}>
            <View style={styles.projectionItem}>
              <Text style={[typography.caption, { color: theme.colors.textMuted }]}>Debt-free in</Text>
              <Text style={[typography.title, { color: theme.colors.text }]}>
                {projection.payoffMonths} mo
              </Text>
            </View>
            <View style={styles.projectionItem}>
              <Text style={[typography.caption, { color: theme.colors.textMuted }]}>Total interest</Text>
              <MoneyValue amountMinor={projection.totalInterestMinor} />
            </View>
          </View>
        ) : projection ? (
          <Text style={[typography.callout, { color: theme.colors.warning }]}>
            These payments would not pay the debts off within 50 years.
          </Text>
        ) : (
          <Text style={[typography.callout, { color: theme.colors.textMuted }]}>
            Add an active debt with a positive balance to preview a payoff plan.
          </Text>
        )}
      </View>
    </Card>
  );
}

function DebtRow({ debt, onPress }: { debt: LocalDebtItem; onPress: () => void }) {
  const theme = useZoptionTheme();
  const conflicted = debt.syncState === "conflicted";
  const failed = debt.syncState === "failed";
  return (
    <Pressable accessibilityRole="button" onPress={onPress}>
      <Card
        accessibilityLabel={debt.name + ", balance " + debt.balanceMinor}
        style={{
          borderColor: conflicted ? theme.colors.warning : failed ? theme.colors.danger : undefined,
        }}
      >
        <View style={styles.stack}>
          <View style={styles.rowBetween}>
            <Text style={[typography.headline, { color: theme.colors.text }]}>{debt.name}</Text>
            <View style={styles.rowGap}>
              {debt.syncState === "conflicted" ? (
                <MaterialCommunityIcons
                  accessibilityElementsHidden
                  color={theme.colors.warning}
                  name="alert-outline"
                  size={18}
                />
              ) : debt.syncState === "failed" ? (
                <MaterialCommunityIcons
                  accessibilityElementsHidden
                  color={theme.colors.danger}
                  name="cloud-alert-outline"
                  size={18}
                />
              ) : debt.syncState === "pending" ? (
                <MaterialCommunityIcons
                  accessibilityElementsHidden
                  color={theme.colors.warning}
                  name="cloud-upload-outline"
                  size={18}
                />
              ) : null}
            </View>
          </View>
          <View style={styles.rowBetween}>
            <Text style={[typography.body, { color: theme.colors.textMuted }]}>
              {debtTypeLabels[debt.type]} · {debt.aprBasisPoints / 100}% APR
            </Text>
            {debt.status === "paid" ? (
              <Text style={[typography.callout, { color: theme.colors.income }]}>Paid off</Text>
            ) : (
              <MoneyValue amountMinor={debt.balanceMinor} />
            )}
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
  stack: { gap: spacing.sm },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  rowGap: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  projectionRow: { flexDirection: "row", gap: spacing.md, marginTop: spacing.xxs },
  projectionItem: { flex: 1, gap: spacing.xxs },
});
