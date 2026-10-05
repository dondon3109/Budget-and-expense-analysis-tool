import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useZoptionTheme } from "@/ui/theme-provider";
import { radii, spacing, typography } from "@/ui/tokens";

export type HomeMenuView = "home" | "remittance";

const OPTIONS: { value: HomeMenuView; label: string }[] = [
  { value: "home", label: "Home" },
  { value: "remittance", label: "Remittance" },
];

// The screen title doubles as a view switch. The list renders in flow under the
// title so it scrolls with the page and needs no overlay.
export function HomeViewMenu({
  selected,
  onSelect,
}: {
  selected: HomeMenuView;
  onSelect: (view: HomeMenuView) => void;
}) {
  const theme = useZoptionTheme();
  const [open, setOpen] = useState(false);
  const label = OPTIONS.find((option) => option.value === selected)?.label ?? "Home";
  return (
    <View style={styles.root}>
      <Pressable
        accessibilityLabel={`${label}, change view`}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((value) => !value)}
        style={styles.title}
      >
        <Text accessibilityRole="header" style={[typography.display, { color: theme.colors.text }]}>
          {label}
        </Text>
        <MaterialCommunityIcons
          color={String(theme.colors.textMuted)}
          name={open ? "chevron-up" : "chevron-down"}
          size={26}
        />
      </Pressable>
      {open ? (
        <View
          style={[
            styles.list,
            { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
          ]}
        >
          {OPTIONS.map((option) => {
            const active = option.value === selected;
            return (
              <Pressable
                key={option.value}
                accessibilityRole="menuitem"
                accessibilityState={{ selected: active }}
                onPress={() => {
                  onSelect(option.value);
                  setOpen(false);
                }}
                style={styles.item}
              >
                <Text
                  style={[
                    typography.body,
                    {
                      color: active ? theme.colors.brand : theme.colors.text,
                      fontWeight: active ? "600" : "400",
                    },
                  ]}
                >
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.xs, alignSelf: "flex-start" },
  title: { flexDirection: "row", alignItems: "center", gap: spacing.xs, minHeight: 44 },
  list: { borderRadius: radii.md, borderWidth: 1, overflow: "hidden", minWidth: 180 },
  item: { minHeight: 44, paddingHorizontal: spacing.md, justifyContent: "center" },
});
