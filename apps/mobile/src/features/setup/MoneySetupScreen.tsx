import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Stack, router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { resolveCategoryEmoji } from "@zoption/shared";
import { useLocalReferenceData } from "@/db/local-workspace-state";
import type { LocalAccountItem } from "@/db/repository";
import { Button, EmptyState, ErrorState, Skeleton } from "@/ui/components";
import { Screen } from "@/ui/screen";
import { useZoptionTheme } from "@/ui/theme-provider";
import { spacing, touchTarget, typography } from "@/ui/tokens";

const accountTypeLabel: Record<LocalAccountItem["type"], string> = {
  cash: "Cash",
  checking: "Checking",
  savings: "Savings",
  credit: "Credit",
  other: "Other",
};

const accountTypeIcon: Record<
  LocalAccountItem["type"],
  keyof typeof MaterialCommunityIcons.glyphMap
> = {
  cash: "cash-multiple",
  checking: "bank-outline",
  savings: "piggy-bank-outline",
  credit: "credit-card-outline",
  other: "wallet-outline",
};

function statusText(state: LocalAccountItem["syncState"]): string | null {
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

function SetupRow({
  title,
  detail,
  state,
  icon,
  iconColor,
  emoji,
  disabled,
  onPress,
}: {
  title: string;
  detail: string;
  state: LocalAccountItem["syncState"];
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  iconColor?: string;
  emoji?: string | null;
  disabled?: boolean;
  onPress: () => void;
}) {
  const theme = useZoptionTheme();
  const status = statusText(state);
  // Keep structural layout on the Pressable itself: Android's NativeWind
  // interop can drop flex-direction from callback-composed style arrays.
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${detail}${status ? `, ${status}` : ""}`}
      accessibilityHint={
        disabled
          ? "This item cannot be edited"
          : state === "conflicted"
            ? "Opens conflict review"
            : "Opens item details"
      }
      accessibilityState={{ disabled: Boolean(disabled) }}
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
        {emoji ? (
          <Text style={styles.leadingEmoji}>{emoji}</Text>
        ) : (
          <MaterialCommunityIcons color={iconColor ?? theme.colors.brand} name={icon} size={24} />
        )}
      </View>
      <View style={styles.rowText}>
        <Text numberOfLines={1} style={[typography.body, { color: theme.colors.text }]}>
          {title}
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
                state === "failed" || state === "conflicted"
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
  singular,
  onAdd,
}: {
  title: string;
  singular: string;
  onAdd: () => void;
}) {
  const theme = useZoptionTheme();
  return (
    <View className="flex-row items-center justify-between gap-3">
      <Text accessibilityRole="header" style={[typography.title, { color: theme.colors.text }]}>
        {title}
      </Text>
      <Button accessibilityLabel={`Add ${singular}`} variant="quiet" onPress={onAdd}>
        Add
      </Button>
    </View>
  );
}

export function MoneySetupScreen() {
  const references = useLocalReferenceData();
  const theme = useZoptionTheme();
  const open = (entityType: "account" | "category", id?: string): void => {
    router.push({
      pathname: "/(app)/reference",
      params: { entityType, ...(id ? { id } : {}) },
    });
  };
  const openConflict = (entityType: "account" | "category", id: string): void => {
    router.push({ pathname: "/(app)/reference-conflict", params: { entityType, id } });
  };

  return (
    <Screen
      title="Accounts & categories"
      description="Changes save to encrypted storage first and synchronize when Zoption is reachable."
    >
      <Stack.Screen options={{ title: "Money setup" }} />
      {references.error ? (
        <ErrorState
          title="Money setup unavailable"
          message={references.error}
          onRetry={references.retry}
        />
      ) : !references.data ? (
        <View className="gap-3">
          <Skeleton height={112} />
          <Skeleton height={180} />
        </View>
      ) : (
        <>
          <View className="gap-3">
            <SectionHeader title="Accounts" singular="account" onAdd={() => open("account")} />
            {references.data.accounts.length === 0 ? (
              <EmptyState
                title="No active accounts"
                description="Add an account before recording income or expenses."
              />
            ) : (
              <View style={styles.listContainer}>
                {references.data.accounts.map((account, index) => (
                  <View key={account.id}>
                    {index > 0 ? (
                      <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />
                    ) : null}
                    <SetupRow
                      title={account.name}
                      detail={`${accountTypeLabel[account.type]} · ${account.currency}${account.system ? " · Permanent" : ""}`}
                      state={account.syncState}
                      icon={accountTypeIcon[account.type]}
                      onPress={() =>
                        account.syncState === "conflicted"
                          ? openConflict("account", account.id)
                          : open("account", account.id)
                      }
                    />
                  </View>
                ))}
              </View>
            )}
          </View>

          <View className="gap-3">
            <SectionHeader title="Categories" singular="category" onAdd={() => open("category")} />
            {references.data.categories.length === 0 ? (
              <EmptyState
                title="No active categories"
                description="Add a category to organize financial activity."
              />
            ) : (
              <View style={styles.listContainer}>
                {references.data.categories.map((category, index) => (
                  <View key={category.id}>
                    {index > 0 ? (
                      <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />
                    ) : null}
                    <SetupRow
                      title={category.name}
                      detail={`${category.kind[0]!.toUpperCase()}${category.kind.slice(1)}${category.requiredPlan === "zoption_pro" ? " · Pro" : ""}${category.locked ? " · Locked" : ""}${category.system ? " · Permanent" : ""}`}
                      state={category.syncState}
                      icon="tag-outline"
                      iconColor={category.color}
                      emoji={resolveCategoryEmoji(category)}
                      disabled={category.system || category.syncState === "failed"}
                      onPress={() =>
                        category.syncState === "conflicted"
                          ? openConflict("category", category.id)
                          : open("category", category.id)
                      }
                    />
                  </View>
                ))}
              </View>
            )}
          </View>
          <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
            New accounts and categories can be used in a transaction immediately. Zoption keeps the
            pending setup and transaction together so they synchronize as one atomic group.
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
  rowText: { minWidth: 0, flex: 1, gap: 2 },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 48 },
});
