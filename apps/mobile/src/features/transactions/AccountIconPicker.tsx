import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import type { AccountType } from "@zoption/shared";
import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { withTapSound } from "@/features/sounds/sound-effects";
import { accountTypeIcon } from "@/features/setup/account-types";
import { GrowPanel, measureGrowAnchor, type GrowAnchor } from "@/ui/components/GrowPanel";
import { useZoptionTheme } from "@/ui/theme-provider";
import { radii, spacing, typography } from "@/ui/tokens";

export interface AccountIconOption {
  id: string;
  label: string;
  detail: string;
  type: AccountType;
}

/** Tiles in the form's row. With more accounts than this, the last slot becomes More. */
const ROW_SLOTS = 4;

/**
 * Where an account sits in the picker: cash, then GCash, then bank accounts, then everything
 * else. The starter GCash account is a General account, so only its name tells it apart.
 */
function entryRank(option: { label: string; type: AccountType }): number {
  if (option.type === "cash") return 0;
  if (option.label.trim().toLowerCase() === "gcash") return 1;
  if (option.type === "checking" || option.type === "savings") return 2;
  return 3;
}

/** Orders accounts for entry: cash, GCash, bank, then the rest; ties keep their name order. */
export function entryAccountOrder<Option extends { label: string; type: AccountType }>(
  options: readonly Option[],
): Option[] {
  return [...options].sort((a, b) => entryRank(a) - entryRank(b));
}

/**
 * The accounts shown in the row: all of them when they fit, otherwise the first few with the
 * chosen account swapped into the last one, so the choice is always visible.
 */
export function rowAccounts<Option extends { id: string }>(
  options: readonly Option[],
  value: string,
): { shown: Option[]; overflow: boolean } {
  if (options.length <= ROW_SLOTS) return { shown: [...options], overflow: false };
  const shown = options.slice(0, ROW_SLOTS - 1);
  const chosen = options.find((option) => option.id === value);
  if (chosen && !shown.includes(chosen)) shown[shown.length - 1] = chosen;
  return { shown, overflow: true };
}

/**
 * The entry form's account choice: a row of tiles marked by each account's type icon. When the
 * accounts do not fit, a More tile opens every account in a panel that grows out of it.
 */
export function AccountIconPicker({
  label,
  options,
  value,
  error,
  disabled,
  onSelect,
}: {
  label: string;
  options: readonly AccountIconOption[];
  value: string;
  error?: string;
  disabled?: boolean;
  onSelect: (accountId: string) => void;
}) {
  const theme = useZoptionTheme();
  // undefined: closed. null: open without an anchor, growing from the bottom.
  const [anchor, setAnchor] = useState<GrowAnchor | null | undefined>(undefined);
  const { shown, overflow } = rowAccounts(options, value);
  return (
    <View style={styles.field}>
      <Text style={[typography.label, { color: theme.colors.text }]}>{label}</Text>
      <View accessibilityLabel={label} accessibilityRole="radiogroup" style={styles.row}>
        {shown.map((option) => (
          <AccountTile
            key={option.id}
            disabled={disabled}
            option={option}
            selected={option.id === value}
            onPress={() => onSelect(option.id)}
          />
        ))}
        {overflow ? (
          <Pressable
            accessibilityHint={`Shows all ${options.length} accounts`}
            accessibilityLabel={`More accounts for ${label}`}
            accessibilityRole="button"
            disabled={disabled}
            onPress={withTapSound((event) => measureGrowAnchor(event, setAnchor))}
            style={[
              styles.tile,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
                opacity: disabled ? 0.55 : 1,
              },
            ]}
          >
            <View style={[styles.icon, { backgroundColor: theme.colors.canvasMuted }]}>
              <MaterialCommunityIcons
                accessibilityElementsHidden
                color={theme.colors.textMuted}
                name="dots-horizontal"
                size={18}
              />
            </View>
            <Text
              numberOfLines={1}
              style={[typography.caption, styles.name, { color: theme.colors.text }]}
            >
              More
            </Text>
            <Text
              numberOfLines={1}
              style={[typography.caption, styles.center, { color: theme.colors.textMuted }]}
            >
              +{options.length - shown.length}
            </Text>
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <Text
          accessibilityRole="alert"
          style={[typography.caption, { color: theme.colors.danger }]}
        >
          {error}
        </Text>
      ) : null}
      {anchor !== undefined ? (
        <Modal
          animationType="none"
          navigationBarTranslucent
          onRequestClose={() => setAnchor(undefined)}
          statusBarTranslucent
          transparent
          visible
        >
          <GrowPanel anchor={anchor} onDismiss={() => setAnchor(undefined)}>
            {({ close }) => (
              <>
                <Text
                  accessibilityRole="header"
                  style={[typography.title, { color: theme.colors.text }]}
                >
                  {label}
                </Text>
                <ScrollView
                  accessibilityRole="radiogroup"
                  contentContainerStyle={styles.grid}
                  style={styles.gridScroll}
                >
                  {options.map((option) => (
                    <View key={option.id} style={styles.gridCell}>
                      <AccountTile
                        option={option}
                        selected={option.id === value}
                        onPress={() =>
                          close(() => {
                            onSelect(option.id);
                            setAnchor(undefined);
                          })
                        }
                      />
                    </View>
                  ))}
                </ScrollView>
              </>
            )}
          </GrowPanel>
        </Modal>
      ) : null}
    </View>
  );
}

function AccountTile({
  option,
  selected,
  disabled,
  onPress,
}: {
  option: AccountIconOption;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const theme = useZoptionTheme();
  return (
    <Pressable
      accessibilityLabel={`${option.label}, ${option.detail}`}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={withTapSound(onPress, "select")}
      style={[
        styles.tile,
        {
          backgroundColor: selected ? theme.colors.brandSoft : theme.colors.surface,
          borderColor: selected ? theme.colors.brand : theme.colors.border,
          opacity: disabled ? 0.55 : 1,
        },
      ]}
    >
      <View
        style={[
          styles.icon,
          { backgroundColor: selected ? theme.colors.solid : theme.colors.canvasMuted },
        ]}
      >
        <MaterialCommunityIcons
          accessibilityElementsHidden
          color={selected ? theme.colors.onSolid : theme.colors.textMuted}
          name={accountTypeIcon(option.type)}
          size={18}
        />
      </View>
      <Text
        numberOfLines={1}
        style={[typography.caption, styles.name, { color: theme.colors.text }]}
      >
        {option.label}
      </Text>
      <Text
        numberOfLines={1}
        style={[typography.caption, styles.center, { color: theme.colors.textMuted }]}
      >
        {option.detail}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  field: { gap: spacing.xs },
  row: { flexDirection: "row", gap: spacing.xs },
  tile: {
    flex: 1,
    minWidth: 0,
    borderWidth: 1,
    borderRadius: radii.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xxs,
    alignItems: "center",
    gap: 2,
  },
  icon: {
    width: 32,
    height: 32,
    borderRadius: radii.round,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xxs,
  },
  name: { textAlign: "center", fontWeight: "600" },
  center: { textAlign: "center" },
  gridScroll: { flexShrink: 1 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  // Three to a row: each cell is a third of the width less its share of the two gaps.
  gridCell: { width: "31.5%", flexDirection: "row" },
});
