import {
  accountSplitBalance,
  allocateBudget,
  BUDGET_AND_SUBSCRIPTION_MAX_MINOR,
  currencyMetadata,
  DEFAULT_BUDGET_RULE_PERCENTAGES,
  distributeBucketLimits,
  MoneyParseError,
  parseAmountToMinor,
  type BudgetQuery,
  type BudgetRuleBucket,
  type BudgetRulePercentages,
} from "@zoption/shared";
import { useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { useAccountBalances, useBudgetPlan, useLocalWorkspace } from "@/db/local-workspace-state";
import { useActiveWorkspace } from "@/features/family/active-workspace";
import { withTapSound } from "@/features/sounds/sound-effects";
import { useWorkspaceCurrency } from "@/stores/workspace-currency-store";
import { useSyncState } from "@/sync/sync-state";
import { Button, Card, FormField } from "@/ui/components";
import { formatMoneyMinor, useMoneyFormat } from "@/ui/components/MoneyValue";
import { Screen } from "@/ui/screen";
import { useZoptionTheme } from "@/ui/theme-provider";
import { radii, spacing, touchTarget, typography } from "@/ui/tokens";

import { currentMonthStart, formatMinorForInput, monthLabel } from "./budget-form";
import { buildBudgetMonthView } from "./budget-month-view";

type CalculatorScope = "month" | "every-month";

const BUCKETS = [
  { key: "needs", label: "Needs", short: "Needs", hint: "Rent, utilities, groceries, transport" },
  { key: "wants", label: "Wants", short: "Wants", hint: "Eating out, subscriptions, shopping" },
  {
    key: "savings",
    label: "Savings & debt payoff",
    short: "Savings",
    hint: "Emergency fund, goals, extra debt",
  },
] as const satisfies ReadonlyArray<{
  key: BudgetRuleBucket;
  label: string;
  short: string;
  hint: string;
}>;

function parseIncome(input: string): { incomeMinor: number } | { error: string } | null {
  if (!input.trim()) return null;
  try {
    const incomeMinor = parseAmountToMinor(input);
    // allocateBudget throws on a negative amount, and it runs during render.
    if (incomeMinor < 0) return { error: "Enter an amount of zero or more." };
    return { incomeMinor };
  } catch (error) {
    return { error: error instanceof MoneyParseError ? error.message : "Enter a valid amount." };
  }
}

function isMonthStart(value: string | undefined): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-01$/.test(value);
}

/**
 * Offline-first 50/30/20 calculator for mobile: auto-splits a selected workspace account balance
 * (or a manually entered take-home amount) and can apply the split across existing expense
 * categories in one SQLite transaction without creating new categories.
 */
export function BudgetCalculatorScreen() {
  const theme = useZoptionTheme();
  const local = useLocalWorkspace();
  const sync = useSyncState();
  const { writable } = useActiveWorkspace();
  const workspaceCurrency = useWorkspaceCurrency();
  const money = useMoneyFormat();
  const params = useLocalSearchParams<{ scope?: string | string[]; month?: string | string[] }>();

  const requestedScope = Array.isArray(params.scope) ? params.scope[0] : params.scope;
  const requestedMonth = Array.isArray(params.month) ? params.month[0] : params.month;
  const month = isMonthStart(requestedMonth) ? requestedMonth : currentMonthStart();

  const [scope, setScope] = useState<CalculatorScope>(
    requestedScope === "every-month" ? "every-month" : "month",
  );
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [manualAmount, setManualAmount] = useState("");
  const [percentages, setPercentages] = useState<BudgetRulePercentages>(
    DEFAULT_BUDGET_RULE_PERCENTAGES,
  );
  const [assignments, setAssignments] = useState<Record<string, BudgetRuleBucket>>({});
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ kind: "success" | "error"; message: string } | null>(null);

  const period: BudgetQuery =
    scope === "every-month" ? { scope: "every-month" } : { scope: "month", month };
  const targetLabel = scope === "every-month" ? "Every month" : monthLabel(month);

  const { accounts } = useAccountBalances();
  const plan = useBudgetPlan(period);
  const planView = useMemo(() => (plan.data ? buildBudgetMonthView(plan.data) : null), [plan.data]);

  const activeAccounts = useMemo(() => accounts.filter((account) => !account.archived), [accounts]);
  const selectedAccount =
    activeAccounts.find((account) => account.id === selectedAccountId) ?? null;
  const selectedBalance = selectedAccount ? accountSplitBalance(selectedAccount) : null;
  const activeCurrency = selectedBalance ? selectedBalance.currency : workspaceCurrency;

  const displayedAmount = selectedBalance
    ? selectedBalance.balanceMinor > 0
      ? formatMinorForInput(selectedBalance.balanceMinor)
      : ""
    : manualAmount;

  const income = selectedBalance
    ? selectedBalance.balanceMinor > 0
      ? { incomeMinor: selectedBalance.balanceMinor }
      : {
          error: `${selectedAccount!.name} has a ${selectedBalance.balanceMinor < 0 ? "negative" : "zero"} balance (${money.format(selectedBalance.balanceMinor, selectedBalance.currency)}). Pick an account with a positive balance or enter an amount manually.`,
        }
    : parseIncome(manualAmount);

  const percentageTotal = percentages.needs + percentages.wants + percentages.savings;
  const allocation =
    income && "incomeMinor" in income && percentageTotal === 100
      ? allocateBudget(income.incomeMinor, percentages)
      : null;
  const isDefault =
    percentages.needs === DEFAULT_BUDGET_RULE_PERCENTAGES.needs &&
    percentages.wants === DEFAULT_BUDGET_RULE_PERCENTAGES.wants &&
    percentages.savings === DEFAULT_BUDGET_RULE_PERCENTAGES.savings;

  const categories = useMemo(() => plan.data?.categories ?? [], [plan.data]);
  const bucketAssignments = useMemo(() => {
    const grouped: Record<BudgetRuleBucket, string[]> = { needs: [], wants: [], savings: [] };
    for (const category of categories) {
      const bucket = assignments[category.id];
      if (bucket) grouped[bucket].push(category.id);
    }
    return grouped;
  }, [assignments, categories]);
  const assignedCount =
    bucketAssignments.needs.length +
    bucketAssignments.wants.length +
    bucketAssignments.savings.length;

  const plannedLimits = useMemo(
    () => (allocation ? distributeBucketLimits(allocation, bucketAssignments) : []),
    [allocation, bucketAssignments],
  );
  const previewByCategoryId = useMemo(
    () => new Map(plannedLimits.map((item) => [item.categoryId, item.limitMinor])),
    [plannedLimits],
  );

  const currencyMismatch = activeCurrency !== workspaceCurrency;
  const canApply =
    writable &&
    Boolean(local.workspace) &&
    Boolean(allocation) &&
    plannedLimits.length > 0 &&
    !currencyMismatch &&
    !saving;

  const updatePercentage = (key: BudgetRuleBucket, raw: string) => {
    const parsed = Number.parseInt(raw.replace(/[^0-9]/g, ""), 10);
    setPercentages((current) => ({ ...current, [key]: Number.isNaN(parsed) ? 0 : parsed }));
    setStatus(null);
  };

  const toggleCategoryBucket = (categoryId: string, bucket: BudgetRuleBucket) => {
    setAssignments((current) => {
      if (current[categoryId] === bucket) {
        const next = { ...current };
        delete next[categoryId];
        return next;
      }
      return { ...current, [categoryId]: bucket };
    });
    setStatus(null);
  };

  const applyToBudgets = async () => {
    if (!local.workspace || !canApply) return;
    if (plannedLimits.some(({ limitMinor }) => limitMinor > BUDGET_AND_SUBSCRIPTION_MAX_MINOR)) {
      setStatus({
        kind: "error",
        message:
          "A category limit is above the supported limit. Spread the bucket across more categories or lower the amount.",
      });
      return;
    }
    setSaving(true);
    setStatus(null);
    try {
      await local.workspace.transactionMutations.setBudgetLimits(
        period,
        plannedLimits.map(({ categoryId, limitMinor }) => ({ categoryId, limitMinor })),
      );
      sync.retry();
      setStatus({
        kind: "success",
        message: `Applied ${plannedLimits.length} category ${plannedLimits.length === 1 ? "limit" : "limits"} to ${targetLabel}.`,
      });
    } catch (error) {
      setStatus({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "The budget limits could not be saved to encrypted local storage.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen hasHeader showHeading={false} title="50/30/20 calculator">
      <View style={styles.container}>
        <Text style={[typography.body, { color: theme.colors.textMuted }]}>
          Split take-home pay or an account balance into needs, wants, and savings, then apply the
          split to your existing expense categories.
        </Text>

        <View
          accessibilityLabel="Apply target"
          accessibilityRole="tablist"
          style={[styles.scopeRow, { borderColor: theme.colors.border }]}
        >
          {(
            [
              { id: "month", label: monthLabel(month) },
              { id: "every-month", label: "Every month" },
            ] as const
          ).map((option) => {
            const active = scope === option.id;
            return (
              <Pressable
                key={option.id}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                onPress={withTapSound(() => {
                  setScope(option.id);
                  setStatus(null);
                })}
                style={[
                  styles.scopeTab,
                  {
                    borderBottomColor: active ? theme.colors.brand : "transparent",
                  },
                ]}
              >
                <Text
                  style={[
                    typography.caption,
                    {
                      color: active ? theme.colors.text : theme.colors.textMuted,
                      fontWeight: active ? "700" : "500",
                    },
                  ]}
                >
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {activeAccounts.length > 0 ? (
          <View style={styles.section}>
            <Text style={[typography.caption, { color: theme.colors.textMuted }]}>SPLIT FROM</Text>
            <View accessibilityLabel="Split from" style={styles.chipRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: selectedAccount === null }}
                onPress={withTapSound(() => {
                  if (selectedBalance && selectedBalance.balanceMinor > 0) {
                    setManualAmount(formatMinorForInput(selectedBalance.balanceMinor));
                  }
                  setSelectedAccountId(null);
                  setStatus(null);
                })}
                style={[
                  styles.chip,
                  {
                    backgroundColor:
                      selectedAccount === null ? theme.colors.brand : theme.colors.surface,
                    borderColor:
                      selectedAccount === null ? theme.colors.brand : theme.colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    typography.caption,
                    {
                      color: selectedAccount === null ? theme.colors.onBrand : theme.colors.text,
                      fontWeight: selectedAccount === null ? "700" : "500",
                    },
                  ]}
                >
                  Manual amount
                </Text>
              </Pressable>
              {activeAccounts.map((account) => {
                const { balanceMinor, currency } = accountSplitBalance(account);
                const selected = selectedAccount?.id === account.id;
                return (
                  <Pressable
                    key={account.id}
                    accessibilityLabel={`${account.name}, ${money.format(balanceMinor, currency)}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={withTapSound(() => {
                      setSelectedAccountId(account.id);
                      setStatus(null);
                    })}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: selected ? theme.colors.brand : theme.colors.surface,
                        borderColor: selected ? theme.colors.brand : theme.colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        typography.caption,
                        {
                          color: selected ? theme.colors.onBrand : theme.colors.text,
                          fontWeight: selected ? "700" : "500",
                        },
                      ]}
                    >
                      {account.name} · {money.format(balanceMinor, currency)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}

        <FormField
          keyboardType="decimal-pad"
          label={
            selectedAccount
              ? `${selectedAccount.name} balance (${currencyMetadata[activeCurrency].symbol})`
              : `Monthly take-home pay (${currencyMetadata[activeCurrency].symbol})`
          }
          onChangeText={(value) => {
            setSelectedAccountId(null);
            setManualAmount(value);
            setStatus(null);
          }}
          placeholder="30000"
          value={displayedAmount}
        />

        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={[typography.caption, { color: theme.colors.textMuted }]}>SPLIT (%)</Text>
            {!isDefault ? (
              <Pressable
                accessibilityRole="button"
                onPress={withTapSound(() => setPercentages(DEFAULT_BUDGET_RULE_PERCENTAGES))}
              >
                <Text
                  style={[typography.caption, { color: theme.colors.brand, fontWeight: "600" }]}
                >
                  Reset to 50 / 30 / 20
                </Text>
              </Pressable>
            ) : null}
          </View>
          <View style={styles.splitRow}>
            {BUCKETS.map((bucket) => (
              <View key={bucket.key} style={styles.splitField}>
                <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
                  {bucket.short}
                </Text>
                <TextInput
                  accessibilityLabel={`${bucket.label} percentage`}
                  keyboardType="number-pad"
                  onChangeText={(value) => updatePercentage(bucket.key, value)}
                  style={[
                    styles.splitInput,
                    {
                      backgroundColor: theme.colors.surface,
                      borderColor: theme.colors.border,
                      color: theme.colors.text,
                    },
                  ]}
                  value={String(percentages[bucket.key])}
                />
              </View>
            ))}
          </View>
        </View>

        {income && "error" in income ? (
          <Text
            accessibilityRole="alert"
            style={[typography.caption, { color: theme.colors.danger }]}
          >
            {income.error}
          </Text>
        ) : null}
        {percentageTotal !== 100 ? (
          <Text
            accessibilityRole="alert"
            style={[typography.caption, { color: theme.colors.danger }]}
          >
            The three percentages must add up to 100. They currently add up to {percentageTotal}.
          </Text>
        ) : null}

        <Card accessibilityLabel="50/30/20 results">
          {BUCKETS.map((bucket, index) => (
            <View
              key={bucket.key}
              style={[
                styles.resultRow,
                index > 0
                  ? {
                      borderTopWidth: StyleSheet.hairlineWidth,
                      borderTopColor: theme.colors.border,
                    }
                  : null,
              ]}
            >
              <View style={styles.resultCopy}>
                <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
                  {bucket.label} · {percentages[bucket.key]}%
                </Text>
                <Text style={[typography.headline, { color: theme.colors.text }]}>
                  {allocation ? formatMoneyMinor(allocation[bucket.key], activeCurrency) : "—"}
                </Text>
                <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
                  {bucket.hint}
                </Text>
              </View>
            </View>
          ))}
        </Card>

        {allocation && planView && !currencyMismatch ? (
          <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
            Current {targetLabel} plan: {money.format(planView.totalLimitMinor, workspaceCurrency)}{" "}
            · Needs + Wants target:{" "}
            {formatMoneyMinor(allocation.needs + allocation.wants, workspaceCurrency)}
          </Text>
        ) : null}

        {writable && categories.length > 0 ? (
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Text style={[typography.headline, { color: theme.colors.text }]}>
                Apply to existing categories
              </Text>
              {assignedCount > 0 ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={withTapSound(() => {
                    setAssignments({});
                    setStatus(null);
                  })}
                >
                  <Text
                    style={[typography.caption, { color: theme.colors.brand, fontWeight: "600" }]}
                  >
                    Clear
                  </Text>
                </Pressable>
              ) : null}
            </View>
            <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
              Each bucket divides evenly across its chosen categories. Unassigned categories stay
              unchanged.
            </Text>

            {categories.map((category) => {
              const assigned = assignments[category.id];
              const previewMinor = previewByCategoryId.get(category.id);
              return (
                <View
                  key={category.id}
                  style={[styles.categoryRow, { borderBottomColor: theme.colors.border }]}
                >
                  <View style={styles.categoryTop}>
                    <View style={styles.categoryTitle}>
                      <View style={[styles.dot, { backgroundColor: category.color }]} />
                      <Text
                        numberOfLines={1}
                        style={[typography.body, { color: theme.colors.text, fontWeight: "500" }]}
                      >
                        {category.name}
                      </Text>
                    </View>
                    <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
                      {assigned
                        ? previewMinor !== undefined
                          ? formatMoneyMinor(previewMinor, activeCurrency)
                          : "—"
                        : "Unchanged"}
                    </Text>
                  </View>
                  <View style={styles.bucketPillRow}>
                    {BUCKETS.map((bucket) => {
                      const active = assigned === bucket.key;
                      return (
                        <Pressable
                          key={bucket.key}
                          accessibilityLabel={`${category.name}: ${bucket.short}`}
                          accessibilityRole="button"
                          accessibilityState={{ selected: active }}
                          onPress={withTapSound(() =>
                            toggleCategoryBucket(category.id, bucket.key),
                          )}
                          style={[
                            styles.bucketPill,
                            {
                              backgroundColor: active ? theme.colors.brand : theme.colors.surface,
                              borderColor: active ? theme.colors.brand : theme.colors.border,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              typography.caption,
                              {
                                color: active ? theme.colors.onBrand : theme.colors.text,
                                fontWeight: active ? "700" : "500",
                              },
                            ]}
                          >
                            {bucket.short}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              );
            })}

            {currencyMismatch ? (
              <Text
                accessibilityRole="alert"
                style={[typography.caption, { color: theme.colors.danger }]}
              >
                Budgets use {workspaceCurrency}. Choose a {workspaceCurrency} account or enter a
                manual amount to apply these limits.
              </Text>
            ) : null}

            <Button
              disabled={!canApply}
              loading={saving}
              onPress={applyToBudgets}
              variant="primary"
            >
              Apply to {targetLabel}
            </Button>

            {status ? (
              <Text
                accessibilityRole={status.kind === "error" ? "alert" : "text"}
                style={[
                  typography.caption,
                  {
                    color: status.kind === "error" ? theme.colors.danger : theme.colors.brand,
                  },
                ]}
              >
                {status.message}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.md, paddingBottom: spacing.xl },
  section: { gap: spacing.xs },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  scopeRow: {
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: spacing.md,
  },
  scopeTab: {
    paddingVertical: spacing.xs,
    borderBottomWidth: 2,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  chip: {
    minHeight: 36,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radii.md,
    borderWidth: 1,
    justifyContent: "center",
  },
  splitRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  splitField: {
    flex: 1,
    gap: 4,
  },
  splitInput: {
    minHeight: touchTarget,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    fontSize: 16,
  },
  resultRow: {
    paddingVertical: spacing.sm,
  },
  resultCopy: { gap: 2 },
  categoryRow: {
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: spacing.xs,
  },
  categoryTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  categoryTitle: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  bucketPillRow: {
    flexDirection: "row",
    gap: spacing.xs,
  },
  bucketPill: {
    minHeight: 32,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.sm,
    borderWidth: 1,
    justifyContent: "center",
  },
});
