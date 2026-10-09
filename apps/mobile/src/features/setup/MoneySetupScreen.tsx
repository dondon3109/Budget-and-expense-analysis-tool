import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Stack, router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { resolveCategoryEmoji } from "@zoption/shared";
import { useLocalReferenceData } from "@/db/local-workspace-state";
import type { LocalAccountItem } from "@/db/view-models";
import { Button, CategoryBadge, Card, EmptyState, ErrorState, Skeleton } from "@/ui/components";
import { Screen } from "@/ui/screen";
import { useZoptionTheme } from "@/ui/theme-provider";
import { radii, spacing, touchTarget, typography } from "@/ui/tokens";
import { accountTypeIcon, accountTypeLabel } from "./account-types";
import { withTapSound } from "@/features/sounds/sound-effects";

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
  // Layout lives in the inner View: Android's NativeWind interop drops it from a
  // callback style, so the Pressable only tints.
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
        disabled ? undefined : { color: "rgba(10, 117, 86, 0.12)", borderless: false }
      }
      className="w-full"
      disabled={disabled}
      onPress={withTapSound(onPress)}
      style={({ pressed }) => ({
        backgroundColor: pressed ? theme.colors.canvasMuted : "transparent",
        opacity: disabled ? 0.62 : 1,
      })}
    >
      <View style={styles.row}>
        <View accessibilityElementsHidden style={styles.leading}>
          {emoji ? (
            <CategoryBadge
              emoji={emoji}
              color={String(iconColor ?? theme.colors.brand)}
              size={40}
            />
          ) : (
            <View style={[styles.iconTile, { backgroundColor: theme.colors.brandSoft }]}>
              <MaterialCommunityIcons color={theme.colors.brand} name={icon} size={22} />
            </View>
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
      </View>
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
      <Text accessibilityRole="header" style={[typography.headline, { color: theme.colors.text }]}>
        {title}
      </Text>
      <Button accessibilityLabel={`Add ${singular}`} variant="quiet" icon="plus" onPress={onAdd}>
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
      hasHeader
      title="Accounts & categories"
      description="Tap an account to edit it or adjust its balance. Changes save on this device first and sync when you're online."
    >
      <Stack.Screen options={{ title: "Accounts & categories" }} />
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
            <SectionHeader
              title="Account Management"
              singular="account"
              onAdd={() => open("account")}
            />
            {references.data.accounts.length === 0 ? (
              <EmptyState
                title="No active accounts"
                description="Add an account before recording income or expenses."
              />
            ) : (
              <Card style={styles.listCard}>
                {references.data.accounts.map((account, index) => (
                  <View key={account.id}>
                    {index > 0 ? (
                      <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />
                    ) : null}
                    <SetupRow
                      title={account.name}
                      detail={`${accountTypeLabel(account.type)} · ${account.currency}${account.system ? " · Permanent" : ""}`}
                      state={account.syncState}
                      icon={accountTypeIcon(account.type)}
                      onPress={() =>
                        account.syncState === "conflicted"
                          ? openConflict("account", account.id)
                          : open("account", account.id)
                      }
                    />
                  </View>
                ))}
              </Card>
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
              <Card style={styles.listCard}>
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
              </Card>
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
  listCard: { padding: 0, gap: 0, overflow: "hidden" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: touchTarget + spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  // Wide enough for the 40 point badge so it is never clipped against the text.
  leading: {
    width: 40,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  iconTile: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
  },
  rowText: { minWidth: 0, flex: 1, gap: 2 },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: spacing.md + 40 + spacing.sm,
  },
});
