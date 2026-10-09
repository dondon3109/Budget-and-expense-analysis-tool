import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Children, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { playSound } from "@/features/sounds/sound-effects";
import { radii, spacing, touchTarget, typography } from "@/ui/tokens";
import { useZoptionTheme } from "@/ui/theme-provider";
import { Card } from "./Card";

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

/** Tinted icon tile shared by every row on a menu screen, so rows read as one family. */
export function MenuIcon({ icon, tone = "brand" }: { icon: IconName; tone?: "brand" | "danger" }) {
  const theme = useZoptionTheme();
  const color = tone === "danger" ? theme.colors.danger : theme.colors.brand;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.iconBox,
        { backgroundColor: tone === "danger" ? theme.colors.dangerSoft : theme.colors.brandSoft },
      ]}
    >
      <MaterialCommunityIcons name={icon} size={18} color={color} />
    </View>
  );
}

/** One titled card holding a list of rows, with hairline dividers between them. */
export function MenuGroup({ title, children }: { title?: string; children: ReactNode }) {
  const theme = useZoptionTheme();
  const rows = Children.toArray(children);
  return (
    <View style={styles.section}>
      {title ? (
        <Text style={[typography.label, styles.title, { color: theme.colors.textMuted }]}>
          {title}
        </Text>
      ) : null}
      <Card style={styles.card}>
        {rows.map((row, index) => (
          <View key={index}>
            {index > 0 ? (
              <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />
            ) : null}
            {row}
          </View>
        ))}
      </Card>
    </View>
  );
}

/** A tappable row inside a MenuGroup: icon tile, title, optional value or badge, and a chevron. */
export function MenuRow({
  icon,
  title,
  value,
  badge,
  tone,
  disabled,
  onPress,
}: {
  icon: IconName;
  title: string;
  value?: string;
  badge?: string;
  tone?: "brand" | "danger";
  disabled?: boolean;
  onPress: () => void;
}) {
  const theme = useZoptionTheme();
  const detail = value ?? badge;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={detail ? `${title}, ${detail}` : title}
      android_ripple={{ color: "rgba(10, 117, 86, 0.12)", borderless: false }}
      // Android's NativeWind interop drops layout from a callback style, so the row's size
      // lives in className and its layout in the static inner View; the callback only tints.
      accessibilityState={{ disabled: Boolean(disabled) }}
      className="w-full"
      disabled={disabled}
      onPress={() => {
        playSound("tap");
        onPress();
      }}
      style={({ pressed }) => ({
        backgroundColor: pressed ? theme.colors.canvasMuted : "transparent",
        opacity: disabled ? 0.5 : 1,
      })}
    >
      <View style={styles.row}>
        <MenuIcon icon={icon} tone={tone} />
        <Text
          numberOfLines={1}
          style={[
            typography.headline,
            styles.rowTitle,
            { color: tone === "danger" ? theme.colors.danger : theme.colors.text },
          ]}
        >
          {title}
        </Text>
        {badge ? (
          <View style={[styles.badge, { backgroundColor: theme.colors.brandSoft }]}>
            <Text style={[typography.caption, { color: theme.colors.brand, fontWeight: "600" }]}>
              {badge}
            </Text>
          </View>
        ) : null}
        {value ? (
          <Text numberOfLines={1} style={[typography.callout, { color: theme.colors.textMuted }]}>
            {value}
          </Text>
        ) : null}
        <MaterialCommunityIcons
          accessibilityElementsHidden
          name="chevron-right"
          size={20}
          color={theme.colors.textMuted}
        />
      </View>
    </Pressable>
  );
}

export const menuRowStyles = StyleSheet.create({
  // Shared by rows that expand in place so they line up with MenuRow.
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: touchTarget + spacing.xs,
    paddingHorizontal: spacing.md,
  },
});

const styles = StyleSheet.create({
  section: { gap: spacing.xs },
  title: { paddingHorizontal: spacing.xs },
  card: { padding: 0, gap: 0, overflow: "hidden" },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: spacing.md + 36 + spacing.sm },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
  },
  row: menuRowStyles.row,
  rowTitle: { flex: 1, minWidth: 0 },
  badge: { paddingHorizontal: spacing.xs, paddingVertical: 2, borderRadius: radii.sm },
});
