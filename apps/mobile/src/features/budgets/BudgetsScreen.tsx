import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View, type DimensionValue } from "react-native";

import { resolveCategoryEmoji } from "@zoption/shared";
import { useBudgetMonth, useLocalWorkspace } from "@/db/local-workspace-state";
import type { BudgetMonthItem, LocalCategoryOption } from "@/db/repository";
import { useSyncState } from "@/sync/sync-state";
import { telemetry } from "@/telemetry/telemetry";
import {
  BottomSheet,
  Button,
  Card,
  ErrorState,
  FormField,
  MoneyValue,
  SelectionField,
  Skeleton,
} from "@/ui/components";
import { Screen } from "@/ui/screen";
import { useZoptionTheme } from "@/ui/theme-provider";
import { elevation, radii, spacing, touchTarget, typography } from "@/ui/tokens";
import {
  currentMonthStart,
  formatMinorForInput,
  monthLabel,
  parseBudgetForm,
  shiftMonth,
  type BudgetFormErrors,
  type BudgetFormValues,
} from "./budget-form";
import { buildBudgetMonthView, type BudgetMonthRow } from "./budget-month-view";

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
  const isCurrentMonth = month === currentMonthStart();

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

  const budgetedCategoryIds = useMemo(
    () => new Set((budgetMonth.data?.budgets ?? []).map((budget) => budget.categoryId)),
    [budgetMonth.data],
  );

  const availableCategories = useMemo(
    () =>
      (budgetMonth.data?.categories ?? []).filter(
        (category) => !budgetedCategoryIds.has(category.id),
      ),
    [budgetMonth.data, budgetedCategoryIds],
  );

  const addOptions = useMemo(
    () =>
      availableCategories.map((category) => {
        const emoji = resolveCategoryEmoji(category);
        return {
          id: category.id,
          label: emoji ? `${emoji} ${category.name}` : category.name,
          color: category.color,
          detail: category.pending ? "Pending setup" : undefined,
        };
      }),
    [availableCategories],
  );

  const openAdd = (presetCategoryId?: string): void => {
    const targetId = presetCategoryId ?? availableCategories[0]?.id ?? budgetMonth.data?.categories[0]?.id ?? null;
    setEditor({ open: true, categoryId: targetId, amount: "" });
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
      void telemetry.capture("budget_limit_set", { action: isEditing ? "updated" : "created" });
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
      void telemetry.capture("budget_removed");
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

  const editingBudget = budgetMonth.data?.budgets.find(
    (budget) => budget.categoryId === editor.categoryId,
  );
  const editingCategoryOption = budgetMonth.data?.categories.find(
    (cat) => cat.id === editor.categoryId,
  );
  const isEditing = Boolean(editingBudget);

  const theme = useZoptionTheme();

  return (
    <Screen
      action={
        <Button disabled={!local.workspace} onPress={() => openAdd()} variant="primary">
          Add budget
        </Button>
      }
      title="Budgets"
    >
      <MonthNavigator
        isCurrentMonth={isCurrentMonth}
        month={month}
        onChange={setMonth}
        onResetToCurrentMonth={() => setMonth(currentMonthStart())}
      />

      {budgetMonth.error ? (
        <ErrorState
          message={budgetMonth.error}
          onRetry={budgetMonth.retry}
          title="Budgets unavailable"
        />
      ) : !view ? (
        <View accessibilityLabel="Loading budgets" style={{ gap: spacing.md }}>
          <Skeleton height={140} />
          <Skeleton height={80} />
          <Skeleton height={80} />
        </View>
      ) : view.rows.length === 0 ? (
        <ZeroBudgetsView
          categories={availableCategories}
          disabled={!local.workspace}
          isCurrentMonth={isCurrentMonth}
          monthLabel={monthLabel(month)}
          onAddCategory={() => router.push("/(app)/categories")}
          onCreateBudget={() => openAdd()}
          onResetToCurrentMonth={() => setMonth(currentMonthStart())}
          onSelectCategory={(categoryId) => openAdd(categoryId)}
        />
      ) : (
        <View style={{ gap: spacing.lg }}>
          <SummaryCard
            limitMinor={view.totalLimitMinor}
            monthLabel={monthLabel(month)}
            remainingMinor={view.totalRemainingMinor}
            spentMinor={view.totalSpentMinor}
            usedPercent={view.totalUsedPercent}
          />

          <View style={{ gap: spacing.sm }}>
            <View style={styles.sectionHeaderRow}>
              <Text style={[typography.headline, { color: theme.colors.text }]}>
                Category limits
              </Text>
              <View
                style={[
                  styles.countPill,
                  {
                    backgroundColor: theme.colors.surfaceRaised,
                    borderColor: theme.colors.border,
                  },
                ]}
              >
                <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
                  {view.rows.length} {view.rows.length === 1 ? "category" : "categories"}
                </Text>
              </View>
            </View>

            {view.rows.map((row) => (
              <BudgetRowCard
                key={row.categoryId}
                onPress={() => openEdit(row.categoryId, row.limitMinor)}
                row={row}
              />
            ))}
          </View>
        </View>
      )}

      <BudgetEditorSheet
        addOptions={addOptions}
        editingBudget={editingBudget}
        editingCategoryOption={editingCategoryOption}
        errors={errors}
        isEditing={isEditing}
        message={message}
        monthLabel={monthLabel(month)}
        onAmountChange={(amount) => {
          setEditor((current) => ({ ...current, amount }));
          setErrors((current) => ({ ...current, amount: undefined }));
          setMessage(null);
        }}
        onCategoryChange={(categoryId) => {
          setEditor((current) => ({ ...current, categoryId }));
          setErrors((current) => ({ ...current, categoryId: undefined }));
          setMessage(null);
        }}
        onDismiss={closeEditor}
        onRemove={() => void remove()}
        onSave={() => void save()}
        saving={saving}
        value={editor}
        visible={editor.open}
      />
    </Screen>
  );
}

function MonthNavigator({
  month,
  isCurrentMonth,
  onChange,
  onResetToCurrentMonth,
}: {
  month: string;
  isCurrentMonth: boolean;
  onChange: (month: string) => void;
  onResetToCurrentMonth: () => void;
}) {
  const theme = useZoptionTheme();
  return (
    <View
      accessibilityLabel={`Budget month, ${monthLabel(month)}`}
      accessibilityRole="adjustable"
      style={styles.monthNav}
    >
      <Pressable
        accessibilityLabel="Previous month"
        accessibilityRole="button"
        android_ripple={{ color: "rgba(15, 107, 91, 0.12)", borderless: true }}
        hitSlop={4}
        onPress={() => onChange(shiftMonth(month, -1))}
        style={styles.iconButton}
      >
        <MaterialCommunityIcons
          accessibilityElementsHidden
          color={theme.colors.text}
          name="chevron-left"
          size={26}
        />
      </Pressable>

      <View style={styles.monthCenterBlock}>
        <Text accessibilityRole="header" style={[styles.monthTitle, { color: theme.colors.text }]}>
          {monthLabel(month)}
        </Text>
        {!isCurrentMonth ? (
          <Pressable
            accessibilityHint="Jumps back to current month"
            accessibilityLabel="Go to this month"
            accessibilityRole="button"
            hitSlop={6}
            onPress={onResetToCurrentMonth}
            style={[styles.currentMonthPill, { backgroundColor: theme.colors.brandSoft }]}
          >
            <Text style={[styles.currentMonthText, { color: theme.colors.brand }]}>This month</Text>
          </Pressable>
        ) : null}
      </View>

      <Pressable
        accessibilityLabel="Next month"
        accessibilityRole="button"
        android_ripple={{ color: "rgba(15, 107, 91, 0.12)", borderless: true }}
        hitSlop={4}
        onPress={() => onChange(shiftMonth(month, 1))}
        style={styles.iconButton}
      >
        <MaterialCommunityIcons
          accessibilityElementsHidden
          color={theme.colors.text}
          name="chevron-right"
          size={26}
        />
      </Pressable>
    </View>
  );
}

function ZeroBudgetsView({
  categories,
  disabled,
  isCurrentMonth,
  monthLabel: label,
  onAddCategory,
  onCreateBudget,
  onResetToCurrentMonth,
  onSelectCategory,
}: {
  categories: LocalCategoryOption[];
  disabled?: boolean;
  isCurrentMonth: boolean;
  monthLabel: string;
  onAddCategory: () => void;
  onCreateBudget: () => void;
  onResetToCurrentMonth: () => void;
  onSelectCategory: (categoryId: string) => void;
}) {
  const theme = useZoptionTheme();
  const suggestedCategories = categories.slice(0, 5);

  return (
    <View style={styles.zeroStateContainer}>
      <Card accessibilityLabel="No budgets setup" style={styles.zeroHeroCard}>
        <View
          accessibilityElementsHidden
          style={[
            styles.zeroIconWrap,
            {
              backgroundColor: theme.colors.brandSoft,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <MaterialCommunityIcons name="chart-arc" size={28} color={theme.colors.brand} />
        </View>

        <View style={styles.zeroTextWrap}>
          <Text
            accessibilityRole="header"
            style={[typography.title, { color: theme.colors.text, textAlign: "center" }]}
          >
            No budgets for {label}
          </Text>
          <Text
            style={[
              typography.body,
              { color: theme.colors.textMuted, textAlign: "center", maxWidth: 320 },
            ]}
          >
            Set spending targets per category to monitor expenses in real time and prevent overspending.
          </Text>
        </View>

        <View style={styles.zeroActionsWrap}>
          <Button disabled={disabled} onPress={onCreateBudget} variant="primary">
            Add a category budget
          </Button>

          {!isCurrentMonth ? (
            <Button onPress={onResetToCurrentMonth} variant="quiet">
              Return to current month
            </Button>
          ) : null}
        </View>
      </Card>

      {suggestedCategories.length > 0 ? (
        <View style={styles.suggestedSection}>
          <View style={styles.suggestedHeader}>
            <Text style={[typography.headline, { color: theme.colors.text }]}>
              Quick start with your categories
            </Text>
            <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
              Tap any category to set its limit for {label}
            </Text>
          </View>

          <View style={styles.suggestedList}>
            {suggestedCategories.map((category) => {
              const emoji = resolveCategoryEmoji(category);
              return (
                <Pressable
                  key={category.id}
                  accessibilityHint={`Sets a monthly budget limit for ${category.name}`}
                  accessibilityLabel={`Set budget for ${category.name}`}
                  accessibilityRole="button"
                  android_ripple={{ color: "rgba(15, 107, 91, 0.12)", borderless: false }}
                  disabled={disabled}
                  onPress={() => onSelectCategory(category.id)}
                  style={({ pressed }) => [
                    styles.suggestedCard,
                    elevation.card,
                    {
                      backgroundColor: theme.colors.surfaceRaised,
                      borderColor: theme.colors.border,
                      opacity: pressed ? 0.75 : 1,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.suggestedAvatar,
                      {
                        backgroundColor: category.color + "18",
                        borderColor: category.color + "33",
                      },
                    ]}
                  >
                    {emoji ? (
                      <Text accessibilityElementsHidden style={styles.suggestedEmoji}>
                        {emoji}
                      </Text>
                    ) : (
                      <View
                        style={[styles.avatarDot, { backgroundColor: category.color }]}
                      />
                    )}
                  </View>

                  <Text
                    numberOfLines={1}
                    style={[
                      typography.headline,
                      { color: theme.colors.text, fontSize: 15, flex: 1 },
                    ]}
                  >
                    {category.name}
                  </Text>

                  <View
                    style={[
                      styles.quickAddPill,
                      { backgroundColor: theme.colors.brandSoft },
                    ]}
                  >
                    <Text
                      style={[
                        styles.quickAddPillText,
                        { color: theme.colors.brand },
                      ]}
                    >
                      + Set limit
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : (
        <Card style={styles.noCategoriesCard}>
          <Text style={[typography.body, { color: theme.colors.textMuted, textAlign: "center" }]}>
            No expense categories found yet.
          </Text>
          <Button onPress={onAddCategory} variant="secondary">
            Manage expense categories
          </Button>
        </Card>
      )}

      <View
        style={[
          styles.benefitsCard,
          elevation.card,
          {
            backgroundColor: theme.colors.surfaceRaised,
            borderColor: theme.colors.border,
          },
        ]}
      >
        <View style={styles.benefitRow}>
          <View
            style={[
              styles.benefitIconWrap,
              { backgroundColor: theme.colors.brandSoft },
            ]}
          >
            <MaterialCommunityIcons
              color={theme.colors.income}
              name="target"
              size={18}
            />
          </View>
          <View style={styles.benefitTextWrap}>
            <Text style={[typography.label, { color: theme.colors.text }]}>
              Stay within spending targets
            </Text>
            <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
              See at a glance how much money is remaining before the month ends.
            </Text>
          </View>
        </View>

        <View style={styles.benefitRow}>
          <View
            style={[
              styles.benefitIconWrap,
              { backgroundColor: theme.colors.warningSoft },
            ]}
          >
            <MaterialCommunityIcons
              color={theme.colors.warning}
              name="alert-outline"
              size={18}
            />
          </View>
          <View style={styles.benefitTextWrap}>
            <Text style={[typography.label, { color: theme.colors.text }]}>
              Early warning indicators
            </Text>
            <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
              Color-coded progress tracks highlight categories nearing their limits.
            </Text>
          </View>
        </View>
      </View>
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
  monthLabel: string;
}) {
  const theme = useZoptionTheme();
  const overBudget = remainingMinor < 0;
  const nearingLimit = !overBudget && usedPercent >= 85;

  const statusBadge = overBudget ? (
    <View style={[styles.statusBadge, { backgroundColor: theme.colors.dangerSoft }]}>
      <MaterialCommunityIcons
        accessibilityElementsHidden
        color={theme.colors.danger}
        name="alert-circle-outline"
        size={14}
      />
      <Text style={[styles.statusBadgeText, { color: theme.colors.danger }]}>Over budget</Text>
    </View>
  ) : nearingLimit ? (
    <View style={[styles.statusBadge, { backgroundColor: theme.colors.warningSoft }]}>
      <MaterialCommunityIcons
        accessibilityElementsHidden
        color={theme.colors.warning}
        name="alert-outline"
        size={14}
      />
      <Text style={[styles.statusBadgeText, { color: theme.colors.warning }]}>
        {usedPercent}% used
      </Text>
    </View>
  ) : (
    <View style={[styles.statusBadge, { backgroundColor: theme.colors.brandSoft }]}>
      <MaterialCommunityIcons
        accessibilityElementsHidden
        color={theme.colors.income}
        name="check-circle-outline"
        size={14}
      />
      <Text style={[styles.statusBadgeText, { color: theme.colors.income }]}>On track</Text>
    </View>
  );

  const fillColor = overBudget
    ? theme.colors.danger
    : nearingLimit
      ? theme.colors.warning
      : theme.colors.brand;

  return (
    <Card accessibilityLabel="Monthly budget summary" style={styles.summaryCard}>
      <View style={styles.summaryHeaderRow}>
        <Text style={[typography.headline, { color: theme.colors.text, fontWeight: "700" }]}>
          Monthly Budget
        </Text>
        {statusBadge}
      </View>

      <View style={styles.summaryHeroSection}>
        <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
          {overBudget ? "Total over budget" : "Remaining to spend"}
        </Text>
        <MoneyValue
          amountMinor={Math.abs(remainingMinor)}
          maxFontSizeMultiplier={1.2}
          style={styles.summaryHeroAmount}
          tone={remainingMinor >= 0 ? "income" : "expense"}
        />
      </View>

      <View style={[styles.summaryTrack, { backgroundColor: theme.colors.border }]}>
        <View
          style={[
            styles.summaryFill,
            {
              width: `${Math.min(100, Math.max(0, usedPercent))}%` as DimensionValue,
              backgroundColor: fillColor,
            },
          ]}
        />
      </View>

      <View style={[styles.statsGrid, { borderTopColor: theme.colors.border }]}>
        <View style={styles.statColumn}>
          <Text style={[typography.caption, { color: theme.colors.textMuted }]}>Budgeted</Text>
          <MoneyValue
            amountMinor={limitMinor}
            maxFontSizeMultiplier={1.2}
            numberOfLines={1}
            style={styles.statValue}
          />
        </View>
        <View style={styles.statColumn}>
          <Text style={[typography.caption, { color: theme.colors.textMuted }]}>Spent</Text>
          <MoneyValue
            amountMinor={spentMinor}
            maxFontSizeMultiplier={1.2}
            numberOfLines={1}
            style={styles.statValue}
            tone="expense"
          />
        </View>
        <View style={styles.statColumn}>
          <Text style={[typography.caption, { color: theme.colors.textMuted }]}>Used</Text>
          <Text
            maxFontSizeMultiplier={1.2}
            style={[
              styles.statValue,
              { color: overBudget ? theme.colors.danger : theme.colors.text },
            ]}
          >
            {usedPercent}%
          </Text>
        </View>
      </View>
    </Card>
  );
}

function BudgetRowCard({ row, onPress }: { row: BudgetMonthRow; onPress: () => void }) {
  const theme = useZoptionTheme();
  const emoji =
    row.categoryIconEmoji ??
    resolveCategoryEmoji({ name: row.categoryName, kind: "expense" });

  return (
    <View
      accessibilityHint={
        row.syncState === "conflicted"
          ? "Review this budget conflict"
          : `Edit ${row.categoryName} budget`
      }
      accessibilityLabel={`${row.categoryName} budget: spent ${row.spentMinor} of ${row.limitMinor}, ${row.remainingMinor >= 0 ? `${row.remainingMinor} remaining` : `${Math.abs(row.remainingMinor)} over budget`}`}
      accessible
      style={[
        styles.budgetCard,
        elevation.card,
        {
          backgroundColor: theme.colors.surfaceRaised,
          borderColor: row.syncState === "conflicted" ? theme.colors.warning : theme.colors.border,
        },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        android_ripple={{ color: "rgba(15, 107, 91, 0.12)", borderless: false }}
        disabled={row.syncState === "conflicted" || row.syncState === "failed"}
        onPress={onPress}
        style={({ pressed }) => [{ opacity: pressed ? 0.75 : 1 }]}
      >
        <View style={styles.budgetCardTopRow}>
          <View
            style={[
              styles.categoryAvatar,
              {
                backgroundColor: row.categoryColor + "18",
                borderColor: row.categoryColor + "33",
              },
            ]}
          >
            {emoji ? (
              <Text accessibilityElementsHidden style={styles.avatarEmoji}>
                {emoji}
              </Text>
            ) : (
              <View style={[styles.avatarDot, { backgroundColor: row.categoryColor }]} />
            )}
          </View>

          <View style={styles.categoryInfo}>
            <Text
              numberOfLines={1}
              style={[typography.headline, { color: theme.colors.text, fontSize: 16 }]}
            >
              {row.categoryName}
            </Text>
            <Text
              numberOfLines={1}
              style={[typography.caption, { color: theme.colors.textMuted }]}
            >
              <MoneyValue amountMinor={row.spentMinor} tone="expense" /> of{" "}
              <MoneyValue amountMinor={row.limitMinor} />
            </Text>
          </View>

          <View style={styles.budgetCardRight}>
            <MoneyValue
              amountMinor={row.remainingMinor}
              maxFontSizeMultiplier={1.2}
              style={styles.remainingAmount}
              tone={row.overBudget ? "expense" : "income"}
            />
            {row.overBudget ? (
              <View style={[styles.miniDangerPill, { backgroundColor: theme.colors.dangerSoft }]}>
                <Text style={[styles.miniDangerText, { color: theme.colors.danger }]}>
                  {row.usedPercent}% (over)
                </Text>
              </View>
            ) : (
              <Text
                style={[
                  typography.caption,
                  { color: theme.colors.textMuted, textAlign: "right" },
                ]}
              >
                {row.usedPercent}% used
              </Text>
            )}
          </View>
        </View>

        <View style={[styles.rowTrack, { backgroundColor: theme.colors.border }]}>
          <View
            style={[
              styles.rowFill,
              {
                width: `${Math.min(100, Math.max(0, row.usedPercent))}%` as DimensionValue,
                backgroundColor: row.overBudget ? theme.colors.danger : row.categoryColor,
              },
            ]}
          />
        </View>
      </Pressable>

      {row.syncState === "conflicted" ? (
        <View
          style={[
            styles.syncBanner,
            { backgroundColor: theme.colors.warningSoft, borderColor: theme.colors.warning },
          ]}
        >
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
            accessibilityLabel={`Review conflict for ${row.categoryName}`}
            onPress={() =>
              router.push({ pathname: "/(app)/budget-conflict", params: { id: row.id } })
            }
            variant="secondary"
          >
            Review
          </Button>
        </View>
      ) : row.syncState === "failed" ? (
        <View
          style={[
            styles.syncBanner,
            { backgroundColor: theme.colors.dangerSoft, borderColor: theme.colors.danger },
          ]}
        >
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
      ) : row.syncState === "pending" ? (
        <View style={styles.syncStatusRow}>
          <MaterialCommunityIcons
            accessibilityElementsHidden
            color={theme.colors.warning}
            name="cloud-upload-outline"
            size={14}
          />
          <Text style={[typography.caption, { color: theme.colors.warning }]}>Pending sync</Text>
        </View>
      ) : null}
    </View>
  );
}

function BudgetEditorSheet({
  addOptions,
  editingBudget,
  editingCategoryOption,
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
  editingBudget: BudgetMonthItem | undefined;
  editingCategoryOption: { id: string; name: string; color: string; iconEmoji?: string | null } | undefined;
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
  const emoji = editingCategoryOption
    ? resolveCategoryEmoji(editingCategoryOption)
    : editingBudget
      ? resolveCategoryEmoji({ name: editingBudget.categoryName, kind: "expense" })
      : null;

  return (
    <BottomSheet
      onDismiss={onDismiss}
      title={isEditing ? "Edit budget" : "Add budget"}
      visible={visible}
    >
      <View style={styles.sheetMonthTag}>
        <MaterialCommunityIcons
          accessibilityElementsHidden
          color={theme.colors.textMuted}
          name="calendar-month-outline"
          size={14}
        />
        <Text style={[typography.caption, { color: theme.colors.textMuted }]}>{label}</Text>
      </View>

      {isEditing && editingBudget ? (
        <View
          style={[
            styles.editingCategoryBanner,
            {
              backgroundColor: theme.colors.surfaceRaised,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <View
            style={[
              styles.categoryAvatar,
              {
                backgroundColor: editingBudget.categoryColor + "18",
                borderColor: editingBudget.categoryColor + "33",
              },
            ]}
          >
            {emoji ? (
              <Text accessibilityElementsHidden style={styles.avatarEmoji}>
                {emoji}
              </Text>
            ) : (
              <View style={[styles.avatarDot, { backgroundColor: editingBudget.categoryColor }]} />
            )}
          </View>

          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[typography.headline, { color: theme.colors.text, fontSize: 16 }]}>
              {editingBudget.categoryName}
            </Text>
            <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
              Spent so far this month:{" "}
              <MoneyValue amountMinor={editingBudget.spentMinor} tone="expense" />
            </Text>
          </View>
        </View>
      ) : (
        <SelectionField
          error={errors.categoryId}
          label="Expense Category"
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
        label="Monthly spending limit"
        maxLength={18}
        onChangeText={onAmountChange}
        placeholder="0.00"
        trailing={<Text style={[typography.label, { color: theme.colors.textMuted }]}>PHP</Text>}
        value={value.amount}
      />

      {message ? (
        <Text
          accessibilityRole="alert"
          style={[typography.callout, { color: theme.colors.danger }]}
        >
          {message}
        </Text>
      ) : null}

      <View style={{ gap: spacing.sm, marginTop: spacing.xs }}>
        <Button
          accessibilityLabel={isEditing ? "Save budget changes" : "Save new budget"}
          disabled={!value.categoryId && !isEditing}
          loading={saving}
          onPress={onSave}
          variant="primary"
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
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  iconButton: {
    width: touchTarget,
    height: touchTarget,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.round,
  },
  monthNav: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.xs,
  },
  monthTitle: {
    ...typography.headline,
    textAlign: "center",
  },
  monthCenterBlock: {
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  currentMonthPill: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radii.round,
  },
  currentMonthText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "700",
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.xxs,
    marginBottom: spacing.xxs,
  },
  countPill: {
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xxs,
    borderRadius: radii.round,
    borderWidth: 1,
  },
  summaryCard: {
    gap: spacing.md,
  },
  summaryHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
    paddingHorizontal: spacing.xs,
    paddingVertical: 3,
    borderRadius: radii.round,
  },
  statusBadgeText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
  },
  summaryHeroSection: {
    gap: 2,
  },
  summaryHeroAmount: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "700",
  },
  summaryTrack: {
    height: 8,
    borderRadius: radii.round,
    overflow: "hidden",
  },
  summaryFill: {
    height: 8,
    borderRadius: radii.round,
  },
  statsGrid: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.sm,
  },
  statColumn: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  statValue: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "700",
  },
  budgetCard: {
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.xs,
  },
  budgetCardTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  categoryAvatar: {
    width: 42,
    height: 42,
    borderRadius: radii.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarEmoji: {
    fontSize: 20,
    lineHeight: 24,
  },
  avatarDot: {
    width: 14,
    height: 14,
    borderRadius: radii.round,
  },
  categoryInfo: {
    flex: 1,
    gap: 2,
  },
  budgetCardRight: {
    alignItems: "flex-end",
    gap: 2,
  },
  remainingAmount: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "700",
  },
  miniDangerPill: {
    paddingHorizontal: spacing.xxs,
    paddingVertical: 1,
    borderRadius: radii.sm,
  },
  miniDangerText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "700",
  },
  rowTrack: {
    height: 6,
    borderRadius: radii.round,
    overflow: "hidden",
    marginTop: spacing.sm,
  },
  rowFill: {
    height: 6,
    borderRadius: radii.round,
  },
  syncBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    padding: spacing.xs,
    borderRadius: radii.md,
    borderWidth: 1,
    marginTop: spacing.xs,
  },
  syncStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
    marginTop: spacing.xs,
  },
  sheetMonthTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
  },
  editingCategoryBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
  },
  zeroStateContainer: {
    gap: spacing.lg,
  },
  zeroHeroCard: {
    alignItems: "center",
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    gap: spacing.md,
  },
  zeroIconWrap: {
    width: 56,
    height: 56,
    borderRadius: radii.lg,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  zeroTextWrap: {
    alignItems: "center",
    gap: spacing.xxs,
  },
  zeroActionsWrap: {
    width: "100%",
    maxWidth: 280,
    gap: spacing.xs,
    marginTop: spacing.xxs,
  },
  suggestedSection: {
    gap: spacing.xs,
  },
  suggestedHeader: {
    gap: 2,
    paddingHorizontal: spacing.xxs,
  },
  suggestedList: {
    gap: spacing.xs,
  },
  suggestedCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: spacing.sm,
    gap: spacing.sm,
  },
  suggestedAvatar: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  suggestedEmoji: {
    fontSize: 20,
    lineHeight: 24,
  },
  quickAddPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs + 2,
    borderRadius: radii.round,
  },
  quickAddPillText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
  },
  noCategoriesCard: {
    alignItems: "center",
    padding: spacing.lg,
    gap: spacing.md,
  },
  benefitsCard: {
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.md,
  },
  benefitRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  benefitIconWrap: {
    width: 32,
    height: 32,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
  },
  benefitTextWrap: {
    flex: 1,
    gap: 2,
  },
});
