import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { resolveCategoryEmoji } from "@zoption/shared";
import type { BudgetMonthItem, LocalCategoryOption } from "@/db/view-models";
import {
  BottomSheet,
  Button,
  CategoryBadge,
  CurrencyCode,
  FormField,
  formatDateInput,
  MoneyValue,
} from "@/ui/components";
import { useZoptionTheme } from "@/ui/theme-provider";
import { radii, spacing, typography } from "@/ui/tokens";
import type { BudgetFormErrors, OccasionFormErrors } from "./budget-form";
import { withTapSound } from "@/features/sounds/sound-effects";

export interface CategoryOption {
  id: string;
  label: string;
  detail?: string;
}

/** Turns categories into picker options, with their emoji in front. */
export function toCategoryOptions(categories: LocalCategoryOption[]): CategoryOption[] {
  return categories.map((category) => {
    const emoji = resolveCategoryEmoji(category);
    return {
      id: category.id,
      label: emoji ? `${emoji} ${category.name}` : category.name,
      detail: category.pending ? "Pending setup" : undefined,
    };
  });
}

// Every option stays visible so the chosen category is never hidden behind a collapsed menu
// inside the sheet.
function CategoryPicker({
  options,
  selectedId,
  error,
  emptyText,
  onChange,
}: {
  options: CategoryOption[];
  selectedId: string | null;
  error?: string;
  emptyText: string;
  onChange: (categoryId: string) => void;
}) {
  const theme = useZoptionTheme();
  return (
    <View accessibilityRole="radiogroup" style={styles.pickerGroup}>
      <Text style={[typography.label, { color: theme.colors.text }]}>Expense category</Text>
      {options.length === 0 ? (
        <Text style={[typography.caption, { color: theme.colors.textMuted }]}>{emptyText}</Text>
      ) : (
        <View style={styles.chips}>
          {options.map((option) => {
            const selected = option.id === selectedId;
            return (
              <Pressable
                key={option.id}
                accessibilityHint={option.detail}
                accessibilityLabel={option.label}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                onPress={withTapSound(() => onChange(option.id))}
                style={[
                  styles.chip,
                  {
                    backgroundColor: selected ? theme.colors.brandSoft : "transparent",
                    borderColor: selected ? theme.colors.brand : theme.colors.border,
                  },
                ]}
              >
                <Text style={[typography.body, { color: theme.colors.text }]}>{option.label}</Text>
              </Pressable>
            );
          })}
        </View>
      )}
      {error ? (
        <Text
          accessibilityRole="alert"
          style={[typography.caption, { color: theme.colors.danger }]}
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
}

export type AppliesTo = "month" | "every-month";

/** Chooses whether a limit is for this month only or for every month. */
function AppliesToToggle({
  value,
  monthLabel,
  onChange,
}: {
  value: AppliesTo;
  monthLabel: string;
  onChange: (value: AppliesTo) => void;
}) {
  const theme = useZoptionTheme();
  const options: { value: AppliesTo; label: string; hint: string }[] = [
    { value: "month", label: monthLabel, hint: "Only this month" },
    { value: "every-month", label: "Every month", hint: "Every month without its own limit" },
  ];
  return (
    <View accessibilityRole="radiogroup" style={styles.pickerGroup}>
      <Text style={[typography.label, { color: theme.colors.text }]}>Applies to</Text>
      <View style={[styles.toggle, { borderColor: theme.colors.border }]}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              accessibilityHint={option.hint}
              accessibilityLabel={option.label}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              onPress={withTapSound(() => onChange(option.value))}
              style={[
                styles.toggleOption,
                { backgroundColor: selected ? theme.colors.solid : "transparent" },
              ]}
            >
              <Text
                numberOfLines={1}
                style={[
                  typography.label,
                  { color: selected ? theme.colors.onSolid : theme.colors.text },
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export interface BudgetEditorValue {
  categoryId: string | null;
  amount: string;
  appliesTo: AppliesTo;
}

/** Adds, edits, or removes one category limit in the plan that is open. */
export function BudgetEditorSheet({
  visible,
  isEditing,
  value,
  scopeLabel,
  monthLabel,
  chooseScope,
  addOptions,
  editingBudget,
  removeLabel,
  errors,
  message,
  saving,
  onChange,
  onDismiss,
  onSave,
  onRemove,
}: {
  visible: boolean;
  isEditing: boolean;
  value: BudgetEditorValue;
  /** What the limit covers, shown under the title: "August 2026", "Every month", an occasion. */
  scopeLabel: string;
  monthLabel: string;
  /** Offer the this-month / every-month choice; only the month plan has one. */
  chooseScope: boolean;
  addOptions: CategoryOption[];
  editingBudget: BudgetMonthItem | undefined;
  removeLabel: string;
  errors: BudgetFormErrors;
  message: string | null;
  saving: boolean;
  onChange: (patch: Partial<BudgetEditorValue>) => void;
  onDismiss: () => void;
  onSave: () => void;
  onRemove: () => void;
}) {
  const theme = useZoptionTheme();
  const emoji = editingBudget
    ? resolveCategoryEmoji({ name: editingBudget.categoryName, kind: "expense" })
    : null;
  const amountLabel = value.appliesTo === "every-month" ? "Limit each month" : "Spending limit";

  return (
    <BottomSheet
      onDismiss={onDismiss}
      title={isEditing ? "Edit budget" : "Add budget"}
      visible={visible}
    >
      <View style={styles.body}>
        <View style={styles.scopeTag}>
          <MaterialCommunityIcons
            accessibilityElementsHidden
            color={theme.colors.textMuted}
            name="calendar-month-outline"
            size={14}
          />
          <Text style={[typography.caption, { color: theme.colors.textMuted }]}>{scopeLabel}</Text>
        </View>

        {isEditing && editingBudget ? (
          <View style={styles.editing}>
            <CategoryBadge color={editingBudget.categoryColor} emoji={emoji ?? null} size={42} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[typography.headline, { color: theme.colors.text }]}>
                {editingBudget.categoryName}
              </Text>
              {editingBudget.source !== "every-month" || value.appliesTo === "month" ? (
                <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
                  Spent so far:{" "}
                  <MoneyValue
                    amountMinor={editingBudget.spentMinor}
                    tone="expense"
                    style={{ fontSize: 12, lineHeight: 16 }}
                  />
                </Text>
              ) : null}
            </View>
          </View>
        ) : (
          <CategoryPicker
            emptyText="Every expense category already has a budget here."
            error={errors.categoryId}
            onChange={(categoryId) => onChange({ categoryId })}
            options={addOptions}
            selectedId={value.categoryId}
          />
        )}

        {chooseScope ? (
          <AppliesToToggle
            monthLabel={monthLabel}
            onChange={(appliesTo) => onChange({ appliesTo })}
            value={value.appliesTo}
          />
        ) : null}

        <FormField
          editable={!saving}
          error={errors.amount}
          keyboardType="decimal-pad"
          label={amountLabel}
          maxLength={18}
          onChangeText={(amount) => onChange({ amount })}
          placeholder="0.00"
          trailing={<CurrencyCode />}
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

        <View style={styles.actions}>
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
            <Button disabled={saving} onPress={onRemove} variant="quiet">
              {removeLabel}
            </Button>
          ) : null}
        </View>
      </View>
    </BottomSheet>
  );
}

export interface OccasionEditorValue {
  title: string;
  date: string;
  categoryId: string | null;
  amount: string;
}

/**
 * Starts an occasion: a name and day, which become a calendar event, and the first limit.
 * More limits are added from the occasion once it exists.
 */
export function OccasionSheet({
  visible,
  value,
  options,
  errors,
  message,
  saving,
  onChange,
  onDismiss,
  onSave,
}: {
  visible: boolean;
  value: OccasionEditorValue;
  options: CategoryOption[];
  errors: BudgetFormErrors & OccasionFormErrors;
  message: string | null;
  saving: boolean;
  onChange: (patch: Partial<OccasionEditorValue>) => void;
  onDismiss: () => void;
  onSave: () => void;
}) {
  const theme = useZoptionTheme();
  return (
    <BottomSheet onDismiss={onDismiss} title="New occasion" visible={visible}>
      <View style={styles.body}>
        <FormField
          autoCapitalize="sentences"
          editable={!saving}
          error={errors.title}
          label="Occasion"
          maxLength={120}
          onChangeText={(title) => onChange({ title })}
          placeholder="Mia's birthday party"
          value={value.title}
        />
        <FormField
          editable={!saving}
          error={errors.date}
          keyboardType="numbers-and-punctuation"
          label="Date"
          maxLength={10}
          onChangeText={(date) => onChange({ date: formatDateInput(date) })}
          placeholder="YYYY-MM-DD"
          value={value.date}
        />
        <CategoryPicker
          emptyText="Add an expense category first."
          error={errors.categoryId}
          onChange={(categoryId) => onChange({ categoryId })}
          options={options}
          selectedId={value.categoryId}
        />
        <FormField
          editable={!saving}
          error={errors.amount}
          keyboardType="decimal-pad"
          label="Limit for this category"
          maxLength={18}
          onChangeText={(amount) => onChange({ amount })}
          placeholder="0.00"
          trailing={<CurrencyCode />}
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
        <View style={styles.actions}>
          <Button
            accessibilityLabel="Create occasion"
            loading={saving}
            onPress={onSave}
            variant="primary"
          >
            Create occasion
          </Button>
        </View>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.lg },
  pickerGroup: { gap: spacing.xs },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  chip: {
    minHeight: 40,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderRadius: radii.round,
  },
  toggle: {
    flexDirection: "row",
    borderWidth: 1,
    borderRadius: radii.round,
    padding: 3,
    gap: 3,
  },
  toggleOption: {
    flex: 1,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.round,
    paddingHorizontal: spacing.sm,
  },
  scopeTag: { flexDirection: "row", alignItems: "center", gap: spacing.xxs },
  editing: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  actions: { gap: spacing.sm, marginTop: spacing.xs },
});
