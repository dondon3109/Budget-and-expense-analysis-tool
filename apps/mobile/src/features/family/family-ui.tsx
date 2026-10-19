import { familyMemberRoles, type FamilyMemberRole, type WorkspaceRole } from "@zoption/shared";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { withTapSound } from "@/features/sounds/sound-effects";
import { useZoptionTheme } from "@/ui/theme-provider";
import { radii, spacing, touchTarget, typography } from "@/ui/tokens";

import { ROLE_LABELS } from "./use-family-api";

/** What each role can do, said once wherever a role is picked. */
export const ROLE_HINTS: Record<FamilyMemberRole, string> = {
  member: "Adds entries and changes their own",
  viewer: "Sees everything, changes nothing",
};

/** A round initial standing in for a family or a person on the family pages. */
export function FamilyAvatar({ label, size = 40 }: { label: string; size?: number }) {
  const theme = useZoptionTheme();
  const initial = label.trim().charAt(0).toUpperCase() || "?";
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.avatar,
        { width: size, height: size, backgroundColor: theme.colors.brandSoft },
      ]}
    >
      <Text style={[typography.headline, { color: theme.colors.brand }]}>{initial}</Text>
    </View>
  );
}

/** A small tag for a role; the owner's stands out, the rest stay quiet. */
export function RoleBadge({ role }: { role: WorkspaceRole }) {
  const theme = useZoptionTheme();
  const owner = role === "owner";
  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: owner ? theme.colors.brandSoft : theme.colors.canvasMuted },
      ]}
    >
      <Text
        style={[
          typography.caption,
          { color: owner ? theme.colors.brand : theme.colors.textMuted, fontWeight: "600" },
        ]}
      >
        {ROLE_LABELS[role]}
      </Text>
    </View>
  );
}

/** Member or viewer as two side-by-side choices, each saying what it allows. */
export function RoleChooser({
  value,
  onChange,
  disabled,
}: {
  value: FamilyMemberRole;
  onChange: (role: FamilyMemberRole) => void;
  disabled?: boolean;
}) {
  const theme = useZoptionTheme();
  return (
    <View accessibilityRole="radiogroup" style={styles.chooser}>
      {familyMemberRoles.map((role) => {
        const selected = role === value;
        return (
          <Pressable
            key={role}
            accessibilityLabel={`${ROLE_LABELS[role]}: ${ROLE_HINTS[role]}`}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected, disabled: Boolean(disabled) }}
            disabled={disabled}
            onPress={withTapSound(() => onChange(role))}
            style={[
              styles.choice,
              {
                borderColor: selected ? theme.colors.brand : theme.colors.border,
                backgroundColor: selected ? theme.colors.brandSoft : theme.colors.surface,
                opacity: disabled ? 0.5 : 1,
              },
            ]}
          >
            <Text
              style={[
                typography.headline,
                { color: selected ? theme.colors.brand : theme.colors.text },
              ]}
            >
              {ROLE_LABELS[role]}
            </Text>
            <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
              {ROLE_HINTS[role]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A section heading above a group of cards, matching the label style of `MenuGroup`. */
export function SectionLabel({ children }: { children: string }) {
  const theme = useZoptionTheme();
  return (
    <Text
      accessibilityRole="header"
      style={[typography.label, styles.sectionLabel, { color: theme.colors.textMuted }]}
    >
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  avatar: { borderRadius: radii.round, alignItems: "center", justifyContent: "center" },
  badge: { paddingHorizontal: spacing.xs, paddingVertical: 2, borderRadius: radii.sm },
  chooser: { flexDirection: "row", gap: spacing.xs },
  choice: {
    flex: 1,
    minHeight: touchTarget,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.sm,
    gap: 2,
  },
  sectionLabel: { paddingHorizontal: spacing.xs },
});
