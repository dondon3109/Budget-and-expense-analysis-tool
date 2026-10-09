import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { router } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { BudgetQuery } from "@zoption/shared";
import { useBudgetOccasions, useBudgetPlan, useLocalWorkspace } from "@/db/local-workspace-state";
import { useSyncState } from "@/sync/sync-state";
import { telemetry } from "@/telemetry/telemetry";
import { Button, ErrorState, Skeleton } from "@/ui/components";
import { Screen } from "@/ui/screen";
import { useZoptionTheme } from "@/ui/theme-provider";
import { radii, spacing, touchTarget, typography } from "@/ui/tokens";
import {
  currentMonthStart,
  formatMinorForInput,
  monthLabel,
  occasionDateLabel,
  parseBudgetForm,
  parseOccasionForm,
  shiftMonth,
  type BudgetFormErrors,
  type OccasionFormErrors,
} from "./budget-form";
import { buildBudgetMonthView } from "./budget-month-view";
import {
  BudgetEditorSheet,
  OccasionSheet,
  toCategoryOptions,
  type BudgetEditorValue,
  type OccasionEditorValue,
} from "./BudgetEditorSheet";
import { BudgetRow, DefaultsHero, OccasionRow, PlanHero, SectionHeader } from "./BudgetPlanView";
import { ShareBudgetSheet } from "./ShareBudgetSheet";

type Tab = "month" | "every-month" | "occasions";

const TABS: { id: Tab; label: string }[] = [
  { id: "month", label: "Month" },
  { id: "every-month", label: "Every month" },
  { id: "occasions", label: "Occasions" },
];

const EMPTY_EDITOR: BudgetEditorValue = { categoryId: null, amount: "", appliesTo: "month" };

function emptyOccasion(month: string): OccasionEditorValue {
  const today = new Date();
  const todayMonth = currentMonthStart(today);
  // Open on today when viewing this month, else on the first day of the month being viewed.
  const date =
    month === todayMonth
      ? `${todayMonth.slice(0, 8)}${String(today.getDate()).padStart(2, "0")}`
      : month;
  return { title: "", date, categoryId: null, amount: "" };
}

/**
 * Budgets for a month, for every month, or for an occasion such as a birthday party. Flat rows
 * and dividers carry the plan; the only raised surface is the sheet used to edit a limit.
 */
export function BudgetsScreen() {
  const local = useLocalWorkspace();
  const sync = useSyncState();
  const theme = useZoptionTheme();
  const [tab, setTab] = useState<Tab>("month");
  const [month, setMonth] = useState(() => currentMonthStart());
  const [occasionId, setOccasionId] = useState<string | null>(null);

  const period: BudgetQuery = occasionId
    ? { scope: "occasion", eventId: occasionId }
    : tab === "every-month"
      ? { scope: "every-month" }
      : { scope: "month", month };
  const plan = useBudgetPlan(period);
  const occasions = useBudgetOccasions(month);
  const view = useMemo(() => (plan.data ? buildBudgetMonthView(plan.data) : null), [plan.data]);

  const [editor, setEditor] = useState<{ open: boolean; isEditing: boolean } & BudgetEditorValue>({
    open: false,
    isEditing: false,
    ...EMPTY_EDITOR,
  });
  const [errors, setErrors] = useState<BudgetFormErrors & OccasionFormErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [occasionDraft, setOccasionDraft] = useState<{ open: boolean } & OccasionEditorValue>({
    open: false,
    ...emptyOccasion(month),
  });

  const isCurrentMonth = month === currentMonthStart();
  const inOccasion = occasionId !== null;
  const showsMonthPlan = !inOccasion && tab === "month";
  // Read from the view, not raw budgets: a removed budget stays as a zero-limit row, and
  // counting it here hid that category from both the list and the add sheet.
  const addOptions = useMemo(() => {
    const budgeted = new Set((view?.rows ?? []).map((row) => row.categoryId));
    return toCategoryOptions(
      (plan.data?.categories ?? []).filter((category) => !budgeted.has(category.id)),
    );
  }, [plan.data, view]);
  const allOptions = useMemo(
    () => toCategoryOptions(plan.data?.categories ?? []),
    [plan.data?.categories],
  );

  const targetPeriod = (appliesTo: BudgetEditorValue["appliesTo"]): BudgetQuery =>
    showsMonthPlan && appliesTo === "every-month" ? { scope: "every-month" } : period;

  const scopeLabel = inOccasion
    ? (plan.data?.event?.title ?? "Occasion")
    : tab === "every-month"
      ? "Every month"
      : monthLabel(month);

  const openAdd = (): void => {
    // No silent default: the first category alphabetically is "Debt payment", and a
    // preselected choice sent budgets there when people only typed an amount.
    setEditor({ open: true, isEditing: false, ...EMPTY_EDITOR });
    setErrors({});
    setMessage(null);
  };

  const openEdit = (categoryId: string): void => {
    const row = view?.rows.find((candidate) => candidate.categoryId === categoryId);
    if (!row) return;
    setEditor({
      open: true,
      isEditing: true,
      categoryId,
      amount: formatMinorForInput(row.limitMinor),
      appliesTo: row.source === "every-month" ? "every-month" : "month",
    });
    setErrors({});
    setMessage(null);
  };

  const closeEditor = (): void => {
    if (saving) return;
    setEditor((current) => ({ ...current, open: false }));
    setErrors({});
    setMessage(null);
  };

  const changeEditor = (patch: Partial<BudgetEditorValue>): void => {
    setEditor((current) => ({ ...current, ...patch }));
    setErrors({});
    setMessage(null);
  };

  const run = async (task: () => Promise<void>, failure: string): Promise<boolean> => {
    if (!local.workspace || saving) return false;
    setSaving(true);
    setMessage(null);
    try {
      await task();
      sync.retry();
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : failure);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const save = async (): Promise<void> => {
    const parsed = parseBudgetForm({ categoryId: editor.categoryId ?? "", amount: editor.amount });
    if (!parsed.success) {
      setErrors(parsed.errors);
      setMessage("Check the highlighted details.");
      return;
    }
    const categoryId = editor.categoryId ?? "";
    const saved = await run(
      () =>
        local.workspace!.transactionMutations.setBudgetLimit(
          targetPeriod(editor.appliesTo),
          categoryId,
          parsed.limitMinor,
        ),
      "The budget could not be saved to encrypted local storage.",
    );
    if (!saved) return;
    void telemetry.capture("budget_limit_set", {
      action: editor.isEditing ? "updated" : "created",
    });
    setEditor((current) => ({ ...current, open: false }));
  };

  const remove = async (): Promise<void> => {
    if (!editor.categoryId) return;
    const categoryId = editor.categoryId;
    const removed = await run(
      () =>
        local.workspace!.transactionMutations.setBudgetLimit(
          targetPeriod(editor.appliesTo),
          categoryId,
          0,
        ),
      "The budget could not be removed from encrypted local storage.",
    );
    if (!removed) return;
    void telemetry.capture("budget_removed");
    setEditor((current) => ({ ...current, open: false }));
  };

  const createOccasion = async (): Promise<void> => {
    const event = parseOccasionForm(occasionDraft);
    const limit = parseBudgetForm({
      categoryId: occasionDraft.categoryId ?? "",
      amount: occasionDraft.amount,
    });
    if (!event.success || !limit.success) {
      setErrors({
        ...(event.success ? {} : event.errors),
        ...(limit.success ? {} : limit.errors),
      });
      setMessage("Check the highlighted details.");
      return;
    }
    const categoryId = occasionDraft.categoryId ?? "";
    let eventId = "";
    const created = await run(async () => {
      const mutations = local.workspace!.transactionMutations;
      eventId = await mutations.createEvent(event.input);
      await mutations.setBudgetLimit({ scope: "occasion", eventId }, categoryId, limit.limitMinor);
    }, "The occasion could not be saved to encrypted local storage.");
    if (!created) return;
    void telemetry.capture("budget_occasion_created");
    setOccasionDraft((current) => ({ ...current, open: false }));
    setMonth(`${event.input.date.slice(0, 7)}-01`);
    setOccasionId(eventId);
  };

  const handleRefresh = useCallback(async () => {
    sync.retry();
    plan.retry();
    occasions.retry();
    await new Promise((resolve) => setTimeout(resolve, 650));
  }, [occasions, plan, sync]);

  const openAction = (): void => {
    if (tab === "occasions" && !inOccasion) {
      setOccasionDraft({ open: true, ...emptyOccasion(month) });
      setErrors({});
      setMessage(null);
      return;
    }
    openAdd();
  };
  const editingBudget = editor.isEditing
    ? plan.data?.budgets.find((budget) => budget.categoryId === editor.categoryId)
    : undefined;
  const hasDefault = editingBudget?.source === "every-month";
  const removeLabel = inOccasion
    ? "Remove budget"
    : tab === "every-month" || editor.appliesTo === "every-month"
      ? "Remove from every month"
      : hasDefault || editingBudget?.source === "month"
        ? "Remove for this month"
        : "Remove budget";

  return (
    <Screen
      action={
        <View style={styles.headerActions}>
          {showsMonthPlan ? (
            <Button
              accessibilityLabel="Share envelopes"
              disabled={!local.workspace || (view?.rows.length ?? 0) === 0}
              icon="share-variant-outline"
              onPress={() => setShareOpen(true)}
              size="compact"
              variant="secondary"
            />
          ) : null}
          <Button
            accessibilityLabel={tab === "occasions" && !inOccasion ? "New occasion" : "Add budget"}
            disabled={!local.workspace}
            icon="plus"
            onPress={openAction}
            size="compact"
            variant="primary"
          />
        </View>
      }
      onRefresh={handleRefresh}
      refreshing={sync.status === "syncing"}
      title="Budgets"
    >
      {inOccasion ? (
        <OccasionHeader
          date={plan.data?.event?.date}
          onBack={() => setOccasionId(null)}
          onEdit={() => router.push({ pathname: "/(app)/event", params: { id: occasionId } })}
          title={plan.data?.event?.title}
        />
      ) : (
        <>
          <ScopeTabs onChange={setTab} value={tab} />
          {tab !== "every-month" ? (
            <MonthNavigator
              isCurrentMonth={isCurrentMonth}
              month={month}
              onChange={setMonth}
              onResetToCurrentMonth={() => setMonth(currentMonthStart())}
            />
          ) : null}
        </>
      )}

      {plan.error ? (
        <ErrorState message={plan.error} onRetry={plan.retry} title="Budgets unavailable" />
      ) : !view ? (
        <View accessibilityLabel="Loading budgets" style={{ gap: spacing.md }}>
          <Skeleton height={110} />
          <Skeleton height={56} />
          <Skeleton height={56} />
        </View>
      ) : tab === "occasions" && !inOccasion ? (
        <OccasionsList
          disabled={!local.workspace}
          monthLabel={monthLabel(month)}
          occasions={occasions.occasions}
          onCreate={openAction}
          onOpen={setOccasionId}
        />
      ) : (
        <View style={{ gap: spacing.lg }}>
          {inOccasion && !plan.data?.event ? (
            <EmptyHint
              actionLabel="Back to occasions"
              icon="calendar-remove-outline"
              onAction={() => setOccasionId(null)}
              text="This occasion is no longer on your calendar."
              title="Occasion not found"
            />
          ) : view.rows.length === 0 ? (
            <EmptyHint
              actionLabel="Add a budget"
              icon="chart-arc"
              onAction={openAdd}
              text={
                tab === "every-month"
                  ? "Set limits once and every month starts from them."
                  : inOccasion
                    ? "Add a category limit to start planning this occasion."
                    : `Set spending limits for ${monthLabel(month)}, or for every month at once.`
              }
              title={
                tab === "every-month"
                  ? "No every-month budget yet"
                  : inOccasion
                    ? "No limits yet"
                    : `No budget for ${monthLabel(month)}`
              }
            />
          ) : (
            <>
              {tab === "every-month" && !inOccasion ? (
                <DefaultsHero limitMinor={view.totalLimitMinor} />
              ) : (
                <PlanHero
                  label={inOccasion ? "Left for this occasion" : "Left to spend"}
                  limitMinor={view.totalLimitMinor}
                  remainingMinor={view.totalRemainingMinor}
                  spentMinor={view.totalSpentMinor}
                  usedPercent={view.totalUsedPercent}
                />
              )}
              <View>
                <SectionHeader
                  title="Categories"
                  trailing={`${view.rows.length} ${view.rows.length === 1 ? "limit" : "limits"}`}
                />
                {view.rows.map((row) => (
                  <BudgetRow
                    key={row.categoryId}
                    onPress={() => openEdit(row.categoryId)}
                    row={row}
                    showSpend={tab !== "every-month" || inOccasion}
                    tagDefaults={showsMonthPlan}
                  />
                ))}
              </View>
            </>
          )}
        </View>
      )}

      <BudgetEditorSheet
        addOptions={addOptions}
        chooseScope={showsMonthPlan}
        editingBudget={editingBudget}
        errors={errors}
        isEditing={editor.isEditing}
        message={message}
        monthLabel={monthLabel(month)}
        onChange={changeEditor}
        onDismiss={closeEditor}
        onRemove={() => void remove()}
        onSave={() => void save()}
        removeLabel={removeLabel}
        saving={saving}
        scopeLabel={scopeLabel}
        value={editor}
        visible={editor.open}
      />

      <OccasionSheet
        errors={errors}
        message={message}
        onChange={(patch) => {
          setOccasionDraft((current) => ({ ...current, ...patch }));
          setErrors({});
          setMessage(null);
        }}
        onDismiss={() => {
          if (!saving) setOccasionDraft((current) => ({ ...current, open: false }));
        }}
        onSave={() => void createOccasion()}
        options={allOptions}
        saving={saving}
        value={occasionDraft}
        visible={occasionDraft.open}
      />

      <ShareBudgetSheet
        month={month}
        monthLabel={monthLabel(month)}
        onDismiss={() => setShareOpen(false)}
        rows={showsMonthPlan ? (view?.rows ?? []) : []}
        visible={shareOpen}
      />
    </Screen>
  );
}

/** Month, Every month, Occasions: underlined text tabs, not a pill or a card. */
function ScopeTabs({ value, onChange }: { value: Tab; onChange: (tab: Tab) => void }) {
  const theme = useZoptionTheme();
  return (
    <View
      accessibilityRole="tablist"
      style={[styles.tabs, { borderBottomColor: theme.colors.border }]}
    >
      {TABS.map((item) => {
        const selected = item.id === value;
        return (
          <Pressable
            key={item.id}
            accessibilityLabel={item.label}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(item.id)}
            style={[
              styles.tab,
              { borderBottomColor: selected ? theme.colors.brand : "transparent" },
            ]}
          >
            <Text
              numberOfLines={1}
              style={[
                typography.label,
                { color: selected ? theme.colors.text : theme.colors.textMuted },
              ]}
            >
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
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
        android_ripple={{ color: "rgba(10, 117, 86, 0.12)", borderless: true }}
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
      <View style={styles.monthCenter}>
        <Text
          accessibilityRole="header"
          style={[typography.headline, { color: theme.colors.text }]}
        >
          {monthLabel(month)}
        </Text>
        {!isCurrentMonth ? (
          <Pressable
            accessibilityHint="Jumps back to current month"
            accessibilityLabel="Go to this month"
            accessibilityRole="button"
            hitSlop={6}
            onPress={onResetToCurrentMonth}
            style={[styles.thisMonth, { backgroundColor: theme.colors.brandSoft }]}
          >
            <Text style={[styles.thisMonthText, { color: theme.colors.brand }]}>This month</Text>
          </Pressable>
        ) : null}
      </View>
      <Pressable
        accessibilityLabel="Next month"
        accessibilityRole="button"
        android_ripple={{ color: "rgba(10, 117, 86, 0.12)", borderless: true }}
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

/** Back link, name, and day of the open occasion. */
function OccasionHeader({
  title,
  date,
  onBack,
  onEdit,
}: {
  title: string | undefined;
  date: string | undefined;
  onBack: () => void;
  onEdit: () => void;
}) {
  const theme = useZoptionTheme();
  return (
    <View style={styles.occasionHeader}>
      <Pressable
        accessibilityLabel="Back to occasions"
        accessibilityRole="button"
        hitSlop={8}
        onPress={onBack}
        style={styles.backLink}
      >
        <MaterialCommunityIcons color={theme.colors.brand} name="chevron-left" size={20} />
        <Text style={[typography.label, { color: theme.colors.brand }]}>Occasions</Text>
      </Pressable>
      <View style={styles.occasionTitleRow}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text numberOfLines={2} style={[typography.title, { color: theme.colors.text }]}>
            {title ?? "Occasion"}
          </Text>
          {date ? (
            <Text style={[typography.callout, { color: theme.colors.textMuted }]}>
              {occasionDateLabel(date)}
            </Text>
          ) : null}
        </View>
        {title ? (
          <Button
            accessibilityLabel="Edit occasion name or date"
            icon="pencil-outline"
            onPress={onEdit}
            size="compact"
            variant="quiet"
          />
        ) : null}
      </View>
    </View>
  );
}

function OccasionsList({
  occasions,
  monthLabel: label,
  disabled,
  onOpen,
  onCreate,
}: {
  occasions: {
    eventId: string;
    title: string;
    date: string;
    totalLimitMinor: number;
    totalSpentMinor: number;
  }[];
  monthLabel: string;
  disabled: boolean;
  onOpen: (eventId: string) => void;
  onCreate: () => void;
}) {
  if (occasions.length === 0) {
    return (
      <EmptyHint
        actionLabel="New occasion"
        disabled={disabled}
        icon="party-popper"
        onAction={onCreate}
        text="Plan a birthday, trip, or holiday with its own limits, apart from your monthly budget."
        title={`No occasions in ${label}`}
      />
    );
  }
  return (
    <View>
      <SectionHeader title={`Occasions in ${label}`} trailing={`${occasions.length}`} />
      {occasions.map((occasion) => (
        <OccasionRow
          key={occasion.eventId}
          occasion={occasion}
          onPress={() => onOpen(occasion.eventId)}
        />
      ))}
    </View>
  );
}

function EmptyHint({
  icon,
  title,
  text,
  actionLabel,
  disabled,
  onAction,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"];
  title: string;
  text: string;
  actionLabel: string;
  disabled?: boolean;
  onAction: () => void;
}) {
  const theme = useZoptionTheme();
  return (
    <View style={styles.empty}>
      <MaterialCommunityIcons
        accessibilityElementsHidden
        color={theme.colors.brand}
        name={icon}
        size={32}
      />
      <Text
        accessibilityRole="header"
        style={[typography.title, { color: theme.colors.text, textAlign: "center" }]}
      >
        {title}
      </Text>
      <Text
        style={[
          typography.body,
          { color: theme.colors.textMuted, textAlign: "center", maxWidth: 320 },
        ]}
      >
        {text}
      </Text>
      <Button disabled={disabled} onPress={onAction} variant="primary">
        {actionLabel}
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  headerActions: { flexDirection: "row", alignItems: "center", gap: spacing.xs, flexShrink: 0 },
  tabs: { flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth },
  tab: {
    flex: 1,
    minHeight: touchTarget,
    alignItems: "center",
    justifyContent: "center",
    borderBottomWidth: 2,
  },
  monthNav: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  iconButton: {
    width: touchTarget,
    height: touchTarget,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.round,
  },
  monthCenter: { alignItems: "center", gap: 2 },
  thisMonth: { paddingHorizontal: spacing.xs, paddingVertical: 2, borderRadius: radii.round },
  thisMonthText: { fontSize: 11, lineHeight: 14, fontWeight: "700" },
  occasionHeader: { gap: spacing.sm },
  backLink: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start" },
  occasionTitleRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  empty: { alignItems: "center", gap: spacing.md, paddingVertical: spacing.xxl },
});
