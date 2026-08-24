import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Stack, router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { resolveCategoryEmoji } from "@zoption/shared";
import { useLocalReferenceData } from "@/db/local-workspace-state";
import type { LocalCategoryItem } from "@/db/repository";
import { Button, EmptyState, ErrorState, Skeleton } from "@/ui/components";
import { Screen } from "@/ui/screen";
import { useZoptionTheme } from "@/ui/theme-provider";
import { spacing, touchTarget, typography } from "@/ui/tokens";

function statusText(state: LocalCategoryItem["syncState"]): string | null {
  switch (state) {
    case "pending":
      return "Pending sync";
    case "failed":
      return "Needs repair";
    case "conflicted":
      return "Needs review";
    case "synced":
      return null;
  }
}

function CategoryRow({
  category,
  onPress,
}: {
  category: LocalCategoryItem;
  onPress: () => void;
}) {
  const theme = useZoptionTheme();
  const status = statusText(category.syncState);
  const disabled = category.system || category.syncState === "failed";
  const detail = `${category.kind[0]!.toUpperCase()}${category.kind.slice(1)}${category.requiredPlan === "zoption_pro" ? " · Pro" : ""}${category.locked ? " · Locked" : ""}${category.system ? " · Permanent" : ""}`;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${category.name}, ${detail}${status ? `, ${status}` : ""}`}
      accessibilityHint={
        disabled
          ? "This category cannot be edited"
          : category.syncState === "conflicted"
            ? "Opens conflict review"
            : "Opens category details"
      }
      accessibilityState={{ disabled }}
      android_ripple={
        disabled ? undefined : { color: "rgba(15, 107, 91, 0.12)", borderless: false }
      }
      className="flex-row items-center"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: pressed ? theme.colors.canvasMuted : "transparent",
          opacity: disabled ? 0.62 : 1,
        },
      ]}
    >
      <View accessibilityElementsHidden style={styles.leading}>
        {resolveCategoryEmoji(category) ? (
          <Text style={styles.leadingEmoji}>{resolveCategoryEmoji(category)}</Text>
        ) : (
          <View style={[styles.colorDot, { backgroundColor: category.color }]} />
        )}
      </View>
      <View style={styles.rowText}>
        <Text numberOfLines={1} style={[typography.body, { color: theme.colors.text }]}>
          {category.name}
        </Text>
        <Text numberOfLines={1} style={[typography.caption, { color: theme.colors.textMuted }]}>
          {detail}
        </Text>
      </View>
      {status ? (
        <Text
          style={[
            typography.caption,
            {
              color:
                category.syncState === "failed" || category.syncState === "conflicted"
                  ? theme.colors.danger
                  : theme.colors.warning,
            },
          ]}
        >
          {status}
        </Text>
      ) : null}
      {!disabled ? (
        <MaterialCommunityIcons
          accessibilityElementsHidden
          color={theme.colors.textMuted}
          name="chevron-right"
          size={22}
        />
      ) : null}
    </Pressable>
  );
}

function SectionHeader({
  title,
  onAdd,
}: {
  title: string;
  onAdd?: () => void;
}) {
  const theme = useZoptionTheme();
  return (
    <View className="flex-row items-center justify-between gap-3">
      <Text accessibilityRole="header" style={[typography.title, { color: theme.colors.text }]}>
        {title}
      </Text>
      {onAdd ? (
        <Button accessibilityLabel="Add category" variant="quiet" onPress={onAdd}>
          Add
        </Button>
      ) : null}
    </View>
  );
}

export function CategoriesScreen() {
  const references = useLocalReferenceData();
  const theme = useZoptionTheme();

  const open = (id?: string): void => {
    router.push({
      pathname: "/(app)/reference",
      params: { entityType: "category", ...(id ? { id } : {}) },
    });
  };

  const openConflict = (id: string): void => {
    router.push({ pathname: "/(app)/reference-conflict", params: { entityType: "category", id } });
  };

  const expenseCategories = references.data?.categories.filter((c) => c.kind === "expense") ?? [];
  const incomeCategories = references.data?.categories.filter((c) => c.kind === "income") ?? [];
  const transferCategories = references.data?.categories.filter((c) => c.kind === "transfer") ?? [];

  return (
    <Screen
      title="Categories"
      description="Customize category names, colors, and emoji icons. Changes sync automatically."
    >
      <Stack.Screen options={{ title: "Categories" }} />
      {references.error ? (
        <ErrorState
          title="Categories unavailable"
          message={references.error}
          onRetry={references.retry}
        />
      ) : !references.data ? (
        <View className="gap-3">
          <Skeleton height={112} />
          <Skeleton height={180} />
        </View>
      ) : references.data.categories.length === 0 ? (
        <EmptyState
          title="No active categories"
          description="Add a category to organize transactions and budgets."
          action={
            <Button onPress={() => open()} variant="primary">
              Add category
            </Button>
          }
        />
      ) : (
        <>
          <View className="gap-3">
            <SectionHeader title="Expense Categories" onAdd={() => open()} />
            {expenseCategories.length > 0 ? (
              <View style={styles.listContainer}>
                {expenseCategories.map((category, index) => (
                  <View key={category.id}>
                    {index > 0 ? (
                      <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />
                    ) : null}
                    <CategoryRow
                      category={category}
                      onPress={() =>
                        category.syncState === "conflicted"
                          ? openConflict(category.id)
                          : open(category.id)
                      }
                    />
                  </View>
                ))}
              </View>
            ) : (
              <EmptyState
                title="No expense categories"
                description="Add an expense category for daily spending."
              />
            )}
          </View>

          {incomeCategories.length > 0 ? (
            <View className="gap-3">
              <SectionHeader title="Income Categories" />
              <View style={styles.listContainer}>
                {incomeCategories.map((category, index) => (
                  <View key={category.id}>
                    {index > 0 ? (
                      <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />
                    ) : null}
                    <CategoryRow
                      category={category}
                      onPress={() =>
                        category.syncState === "conflicted"
                          ? openConflict(category.id)
                          : open(category.id)
                      }
                    />
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {transferCategories.length > 0 ? (
            <View className="gap-3">
              <SectionHeader title="Transfer Categories" />
              <View style={styles.listContainer}>
                {transferCategories.map((category, index) => (
                  <View key={category.id}>
                    {index > 0 ? (
                      <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />
                    ) : null}
                    <CategoryRow
                      category={category}
                      onPress={() =>
                        category.syncState === "conflicted"
                          ? openConflict(category.id)
                          : open(category.id)
                      }
                    />
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
            Categories organize your transactions, monthly spending breakdown, and budgets.
          </Text>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  listContainer: { overflow: "hidden" },
  row: {
    minHeight: touchTarget + spacing.md,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
    gap: spacing.sm,
  },
  leading: {
    width: 28,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  leadingEmoji: { fontSize: 24, lineHeight: 30 },
  colorDot: { width: 14, height: 14, borderRadius: 7 },
  rowText: { minWidth: 0, flex: 1, gap: 2 },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 48 },
});
