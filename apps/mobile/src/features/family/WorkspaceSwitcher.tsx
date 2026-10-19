import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useNetInfo } from "@react-native-community/netinfo";
import type { WorkspaceRole } from "@zoption/shared";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { withTapSound } from "@/features/sounds/sound-effects";
import { BottomSheet } from "@/ui/components";
import { useZoptionTheme } from "@/ui/theme-provider";
import { radii, spacing, touchTarget, typography } from "@/ui/tokens";

import { useActiveWorkspace } from "./active-workspace";
import { familyOpenable } from "./workspace-record";

const ROLE_LABELS: Record<WorkspaceRole, string> = {
  owner: "Owner",
  member: "Member",
  viewer: "Viewer",
};

/**
 * The Home chip that names the workspace shown and switches between personal and each family.
 * It shows only for someone in at least one family.
 */
export function WorkspaceSwitcher() {
  const theme = useZoptionTheme();
  const active = useActiveWorkspace();
  const netInfo = useNetInfo();
  const reachable = netInfo.isInternetReachable ?? netInfo.isConnected;
  const [open, setOpen] = useState(false);
  if (active.families.length === 0) return null;

  const choose = (familyId: string | null) => {
    setOpen(false);
    if (familyId !== (active.family?.id ?? null)) active.switchTo(familyId);
  };
  const rows: { id: string | null; name: string; detail: string | null; enabled: boolean }[] = [
    { id: null, name: "Personal", detail: "Only you", enabled: true },
    ...active.families.map((family) => {
      const enabled = familyOpenable(family.id, active.synced, reachable);
      return {
        id: family.id,
        name: family.name,
        detail: enabled ? ROLE_LABELS[family.role] : "Connect once to use offline",
        enabled,
      };
    }),
  ];
  const name = active.family?.name ?? "Personal";

  return (
    <>
      <Pressable
        accessibilityHint="Switches between your personal money and your families"
        accessibilityLabel={`Workspace: ${name}`}
        accessibilityRole="button"
        onPress={withTapSound(() => setOpen(true))}
        style={[
          styles.chip,
          { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
        ]}
      >
        <MaterialCommunityIcons
          color={String(theme.colors.text)}
          name={active.family ? "account-group-outline" : "account-outline"}
          size={18}
        />
        <Text
          numberOfLines={1}
          style={[typography.headline, styles.chipLabel, { color: theme.colors.text }]}
        >
          {name}
        </Text>
        <MaterialCommunityIcons
          color={String(theme.colors.textMuted)}
          name="chevron-down"
          size={18}
        />
      </Pressable>
      <BottomSheet onDismiss={() => setOpen(false)} title="Switch workspace" visible={open}>
        {rows.map((row) => {
          const selected = row.id === (active.family?.id ?? null);
          return (
            <Pressable
              key={row.id ?? "personal"}
              accessibilityRole="button"
              accessibilityState={{ selected, disabled: !row.enabled }}
              disabled={!row.enabled}
              onPress={withTapSound(() => choose(row.id))}
              style={[styles.row, { opacity: row.enabled ? 1 : 0.55 }]}
            >
              <MaterialCommunityIcons
                color={String(selected ? theme.colors.brand : theme.colors.text)}
                name={row.id ? "account-group-outline" : "account-outline"}
                size={22}
              />
              <View style={styles.rowText}>
                <Text style={[typography.headline, { color: theme.colors.text }]}>{row.name}</Text>
                {row.detail ? (
                  <Text style={[typography.callout, { color: theme.colors.textMuted }]}>
                    {row.detail}
                  </Text>
                ) : null}
              </View>
              {selected ? (
                <MaterialCommunityIcons color={String(theme.colors.brand)} name="check" size={20} />
              ) : null}
            </Pressable>
          );
        })}
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignSelf: "flex-start",
    maxWidth: "100%",
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
    paddingHorizontal: spacing.md,
    borderRadius: radii.round,
    borderWidth: 1,
  },
  chipLabel: { flexShrink: 1 },
  row: {
    minHeight: touchTarget + spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  rowText: { flex: 1, gap: 2 },
});
