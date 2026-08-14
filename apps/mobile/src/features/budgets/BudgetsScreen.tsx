import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View, type DimensionValue } from "react-native";

import { useBudgetMonth, useLocalWorkspace } from "@/db/local-workspace-state";
import { useSyncState } from "@/sync/sync-state";
import {
  BottomSheet,
  Button,
  Card,
  EmptyState,
  ErrorState,
  FormField,
  MoneyValue,
  SelectionField,
  Skeleton,
} from "@/ui/components";
import { Screen } from "@/ui/screen";
import { useZoptionTheme } from "@/ui/theme-provider";
import { radii, spacing, touchTarget, typography } from "@/ui/tokens";
import { buildBudgetMonthView } from "./budget-month-view";
import {
  currentMonthStart,
  formatMinorForInput,
  monthLabel,
  parseBudgetForm,
  shiftMonth,
  type BudgetFormErrors,
  type BudgetFormValues,
} from "./budget-form";

interface EditorState {
  open: boolean;
  categoryId: string | null;
  amount: string;
}

export function BudgetsScreen() {
  const local = useLocalWorkspace();
  const sync = useSyncState();
  const [month, setMonth] = useState(() => currentMonthStart());
  const budgetMonth = useBudgetMonth(month);
  const [editor, setEditor] = useState<EditorState>({
    open: false,
    categoryId: null,
    amount: "",
  });
  const [errors, setErrors] = useState<BudgetFormErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const view = useMemo(
    () => (budgetMonth.data ? buildBudgetMonthView(budgetMonth.data) : null),
    [budgetMonth.data],
  );

  const openAdd = (): void => {
    const first = budgetMonth.data?.categories[0];
    setEditor({ open: true, categoryId: first?.id ?? null, amount: "" });
    setErrors({});
    setMessage(null);
  };

  const openEdit = (categoryId: string, limitMinor: number): void => {
    setEditor({ open: true, categoryId, amount: formatMinorForInput(limitMinor) });
    setErrors({});
    setMessage(null);
  };

  const closeEditor = (): void => {
    if (saving) return;
    setEditor((current) => ({ ...current, open: false }));
    setErrors({});
    setMessage(null);
  };

  const save = async (): Promise<void> => {
    if (!local.workspace || saving) return;
    const values: BudgetFormValues = {
      categoryId: editor.categoryId ?? "",
      amount: editor.amount,
    };
    const parsed = parseBudgetForm(values);
    if (!parsed.success) {
      setErrors(parsed.errors);
      setMessage("Check the highlighted details.");
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      await local.workspace.transactionMutations.setBudgetLimit(
        month,
        values.categoryId,
        parsed.limitMinor,
      );
      setEditor((current) => ({ ...current, open: false }));
      sync.retry();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The budget could not be saved to encrypted local storage.",
      );
    } finally {
      setSaving(false);
    }
  };

  const remove = async (): Promise<void> => {
    if (!local.workspace || saving || !editor.categoryId) return;
    setSaving(true);
    setMessage(null);
    try {
      await local.workspace.transactionMutations.setBudgetLimit(month, editor.categoryId, 0);
      setEditor((current) => ({ ...current, open: false }));
      sync.retry();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The budget could not be removed from encrypted local storage.",
      );
    } finally {
      setSaving(false);
    }
  };

  const budgetedCategoryIds = useMemo(
    () => new Set((budgetMonth.data?.budgets ?? []).map((budget) => budget.categoryId)),
    [budgetMonth.data],
  );
  const addOptions = useMemo(
    () =>
      (budgetMonth.data?.categories ?? [])
        .filter((category) => !budgetedCategoryIds.has(category.id))
        .map((category) => ({
          id: category.id,
          label: category.name,
          color: category.color,
          detail: category.pending ? "Pending setup" : undefined,
        })),
    [budgetMonth.data, budgetedCategoryIds],
  );
  const editingCategory = budgetMonth.data?.budgets.find(
    (budget) => budget.categoryId === editor.categoryId,
  );
  const isEditing = Boolean(editingCategory);

  return (
    <Screen
      action={
        <Button onPress={openAdd} variant="primary">
          Add budget
        </Button>
      }
      description="Set monthly limits per expense category. Changes sync when you reconnect."
      title="Budgets"
    >
      <MonthNavigator month={month} onChange={setMonth} />

      {budgetMonth.error ? (
        <ErrorState
          message={budgetMonth.error}
          onRetry={budgetMonth.retry}
          title="Budgets unavailable"
        />
      ) : !view ? (
        <View accessibilityLabel="Loading budgets" style={{ gap: spacing.sm }}>
          <Skeleton height={96} />
          <Skeleton height={96} />
        </View>
      ) : (
        <View style={{ gap: spacing.md }}>
          <SummaryCard
            limitMinor={view.totalLimitMinor}
            spentMinor={view.totalSpentMinor}
            remainingMinor={view.totalRemainingMinor}
            usedPercent={view.totalUsedPercent}
          />
          {view.rows.length === 0 ? (
            <EmptyState
              title="No budgets for this month"
              description="Add a monthly limit for an expense category to start tracking your spending against it."
            />
          ) : (
            view.rows.map((row) => (
              <BudgetRow
                key={row.categoryId}
                color={row.categoryColor}
                id={row.id}
                limitMinor={row.limitMinor}
                name={row.categoryName}
                onPress={() => openEdit(row.categoryId, row.limitMinor)}
                overBudget={row.overBudget}
                remainingMinor={row.remainingMinor}
                spentMinor={row.spentMinor}
                syncState={row.syncState}
                usedPercent={row.usedPercent}
              />
            ))
          )}
        </View>
      )}

      <BudgetEditorSheet
        addOptions={addOptions}
        editingCategory={editingCategory}
        errors={errors}
        isEditing={isEditing}
        message={message}
        monthLabel={monthLabel(month)}
        onCategoryChange={(categoryId) => {
          setEditor((current) => ({ ...current, categoryId }));
          setErrors((current) => ({ ...current, categoryId: undefined }));
          setMessage(null);
        }}
        onDismiss={closeEditor}
        onRemove={() => void remove()}
        onSave={() => void save()}
        onAmountChange={(amount) => {
          setEditor((current) => ({ ...current, amount }));
          setErrors((current) => ({ ...current, amount: undefined }));
          setMessage(null);
        }}
        saving={saving}
        value={editor}
        visible={editor.open}
      />
    </Screen>
  );
}

function MonthNavigator({ month, onChange }: { month: string; onChange: (month: string) => void }) {
  const theme = useZoptionTheme();
  return (
    <View
      accessibilityRole="adjustable"
      accessibilityLabel={`Budget month, ${monthLabel(month)}`}
      style={[styles.monthNav, { backgroundColor: theme.colors.canvasMuted }]}
    >
      <Pressable
        accessibilityLabel="Previous month"
        accessibilityRole="button"
        onPress={() => onChange(shiftMonth(month, -1))}
        style={[styles.monthButton, { borderColor: theme.colors.border }]}
      >
        <MaterialCommunityIcons
          accessibilityElementsHidden
          color={theme.colors.text}
          name="chevron-left"
          size={22}
        />
      </Pressable>
      <Text style={[typography.headline, { color: theme.colors.text }]}>{monthLabel(month)}</Text>
      <Pressable
        accessibilityLabel="Next month"
        accessibilityRole="button"
        onPress={() => onChange(shiftMonth(month, 1))}
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
  );
}

function SummaryCard({
  limitMinor,
  spentMinor,
  remainingMinor,
  usedPercent,
}: {
  limitMinor: number;
  spentMinor: number;
  remainingMinor: number;
  usedPercent: number;
}) {
  const theme = useZoptionTheme();
  return (
    <Card accessibilityLabel="Budget summary">
      <Text style={[typography.headline, { color: theme.colors.text }]}>Monthly total</Text>
      <View style={styles.summaryRow}>
        <Text style={[typography.body, { color: theme.colors.textMuted }]}>Budgeted</Text>
        <MoneyValue amountMinor={limitMinor} />
      </View>
      <View style={styles.summaryRow}>
        <Text style={[typography.body, { color: theme.colors.textMuted }]}>Spent</Text>
        <MoneyValue amountMinor={spentMinor} tone="expense" />
      </View>
      <View style={styles.summaryRow}>
        <Text style={[typography.body, { color: theme.colors.textMuted }]}>Remaining</Text>
        <MoneyValue amountMinor={remainingMinor} tone={remainingMinor >= 0 ? "income" : "expense"} />
      </View>
      <View style={[styles.track, { backgroundColor: theme.colors.border }]}>
        <View
          style={[
            styles.fill,
            {
              width: (`${Math.min(100, usedPercent)}%` as DimensionValue),
              backgroundColor: usedPercent > 100 ? theme.colors.danger : theme.colors.brand,
            },
          ]}
        />
      </View>
      <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
        {usedPercent}% used
      </Text>
    </Card>
  );
}

function BudgetRow({
  color,
  id,
  limitMinor,
  name,
  onPress,
  overBudget,
  remainingMinor,
  spentMinor,
  syncState,
  usedPercent,
}: {
  color: string;
  id: string;
  limitMinor: number;
  name: string;
  onPress: () => void;
  overBudget: boolean;
  remainingMinor: number;
  spentMinor: number;
  syncState: "synced" | "pending" | "failed" | "conflicted";
  usedPercent: number;
}) {
  const theme = useZoptionTheme();
  return (
    <View
      accessible
      accessibilityLabel={`${name}, spent ${spentMinor}, limit ${limitMinor}`}
      style={[
        styles.row,
        {
          backgroundColor: theme.colors.surface,
          borderColor: syncState === "conflicted" ? theme.colors.warning : theme.colors.border,
        },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityHint={syncState === "conflicted" ? "Review this budget conflict" : "Edit this budget"}
        disabled={syncState === "conflicted" || syncState === "failed"}
        onPress={onPress}
        style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
      >
        <View style={styles.rowHeader}>
          <View style={[styles.dot, { backgroundColor: color }]} />
          <Text numberOfLines={1} style={[typography.body, { color: theme.colors.text, flex: 1 }]}>
            {name}
          </Text>
          <MoneyValue amountMinor={remainingMinor} tone={overBudget ? "expense" : "income"} />
        </View>
        <View style={styles.rowMeta}>
          <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
            <MoneyValue amountMinor={spentMinor} tone="expense" /> of{" "}
            <MoneyValue amountMinor={limitMinor} />
          </Text>
          <Text
            style={[
              typography.caption,
              { color: overBudget ? theme.colors.danger : theme.colors.textMuted },
            ]}
          >
            {usedPercent}%
          </Text>
        </View>
        <View style={[styles.track, { backgroundColor: theme.colors.border }]}>
          <View
            style={[
              styles.fill,
              {
                width: (`${Math.min(100, usedPercent)}%` as DimensionValue),
                backgroundColor: overBudget ? theme.colors.danger : color,
              },
            ]}
          />
        </View>
      </Pressable>
      {syncState === "conflicted" ? (
        <View style={styles.stateRow}>
          <MaterialCommunityIcons
            accessibilityElementsHidden
            color={theme.colors.warning}
            name="alert-circle-outline"
            size={16}
          />
          <Text style={[typography.caption, { color: theme.colors.warning, flex: 1 }]}>
            Conflict preserved
          </Text>
          <Button
            accessibilityLabel={`Review conflict for ${name}`}
            onPress={() =>
              router.push({ pathname: "/(app)/budget-conflict", params: { id } })
            }
            variant="secondary"
          >
            Review
          </Button>
        </View>
      ) : syncState === "failed" ? (
        <View style={styles.stateRow}>
          <MaterialCommunityIcons
            accessibilityElementsHidden
            color={theme.colors.danger}
            name="cloud-alert-outline"
            size={16}
          />
          <Text style={[typography.caption, { color: theme.colors.danger }]}>
            Sync needs repair
          </Text>
        </View>
      ) : syncState === "pending" ? (
        <View style={styles.stateRow}>
          <MaterialCommunityIcons
            accessibilityElementsHidden
            color={theme.colors.warning}
            name="cloud-upload-outline"
            size={16}
          />
          <Text style={[typography.caption, { color: theme.colors.warning }]}>Pending sync</Text>
        </View>
      ) : null}
    </View>
  );
}

function BudgetEditorSheet({
  addOptions,
  editingCategory,
  errors,
  isEditing,
  message,
  monthLabel: label,
  onCategoryChange,
  onDismiss,
  onRemove,
  onSave,
  onAmountChange,
  saving,
  value,
  visible,
}: {
  addOptions: { id: string; label: string; color?: string; detail?: string }[];
  editingCategory: { categoryName: string; categoryColor: string } | undefined;
  errors: BudgetFormErrors;
  isEditing: boolean;
  message: string | null;
  monthLabel: string;
  onCategoryChange: (categoryId: string) => void;
  onDismiss: () => void;
  onRemove: () => void;
  onSave: () => void;
  onAmountChange: (amount: string) => void;
  saving: boolean;
  value: EditorState;
  visible: boolean;
}) {
  const theme = useZoptionTheme();
  return (
    <BottomSheet
      onDismiss={onDismiss}
      title={isEditing ? "Edit budget" : "Add budget"}
      visible={visible}
    >
      <Text style={[typography.caption, { color: theme.colors.textMuted }]}>{label}</Text>
      {isEditing && editingCategory ? (
        <View style={styles.fixedCategory}>
          <View style={[styles.dot, { backgroundColor: editingCategory.categoryColor }]} />
          <Text style={[typography.body, { color: theme.colors.text }]}>
            {editingCategory.categoryName}
          </Text>
        </View>
      ) : (
        <SelectionField
          error={errors.categoryId}
          label="Category"
          onSelect={onCategoryChange}
          options={addOptions}
          placeholder="Choose an expense category"
          sheetTitle="Choose an expense category"
          value={value.categoryId ?? ""}
        />
      )}
      <FormField
        editable={!saving}
        error={errors.amount}
        keyboardType="decimal-pad"
        label="Monthly limit"
        maxLength={18}
        onChangeText={onAmountChange}
        placeholder="0.00"
        trailing={
          <Text style={[typography.label, { color: theme.colors.textMuted }]}>PHP</Text>
        }
        value={value.amount}
      />
      {message ? (
        <Text accessibilityRole="alert" style={[typography.callout, { color: theme.colors.danger }]}>
          {message}
        </Text>
      ) : null}
      <Button
        accessibilityLabel={isEditing ? "Save budget changes" : "Save new budget"}
        disabled={!value.categoryId && !isEditing}
        loading={saving}
        onPress={onSave}
      >
        {isEditing ? "Save changes" : "Save budget"}
      </Button>
      {isEditing ? (
        <Button
          accessibilityLabel="Remove this budget"
          disabled={saving}
          onPress={onRemove}
          variant="quiet"
        >
          Remove budget
        </Button>
      ) : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  monthNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: radii.md,
    padding: spacing.xs,
  },
  monthButton: {
    minWidth: touchTarget,
    minHeight: touchTarget,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.sm,
    borderWidth: 1,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  row: {
    borderRadius: radii.md,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.xs,
  },
  rowHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  rowMeta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  stateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  fixedCategory: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    minHeight: touchTarget,
  },
  dot: { width: 12, height: 12, borderRadius: radii.round },
  track: {
    height: 8,
    borderRadius: radii.round,
    overflow: "hidden",
    marginTop: spacing.xxs,
  },
  fill: {
    height: 8,
    borderRadius: radii.round,
  },
});
