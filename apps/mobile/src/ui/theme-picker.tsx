import { Pressable, StyleSheet, Text, View } from "react-native";

import { useThemeStore } from "@/stores/theme-store";
import { radii, spacing, touchTarget, typography, type ThemePreference } from "./tokens";
import { useZoptionTheme } from "./theme-provider";

const options: Array<{ value: ThemePreference; label: string }> = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "coffee", label: "Coffee" },
];

export function ThemePicker() {
  const theme = useZoptionTheme();
  const preference = useThemeStore((state) => state.preference);
  const setPreference = useThemeStore((state) => state.setPreference);
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel="Theme" className="w-full gap-2">
      {options.map((option) => {
        const selected = preference === option.value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => setPreference(option.value)}
            className="w-full flex-row items-center justify-between"
            style={[
              styles.option,
              {
                backgroundColor: selected ? theme.colors.brandSoft : theme.colors.surface,
                borderColor: selected ? theme.colors.brand : theme.colors.border,
              },
            ]}
          >
            <Text style={[typography.body, { color: theme.colors.text }]}>{option.label}</Text>
            <View
              accessibilityElementsHidden
              style={[
                styles.radio,
                { borderColor: selected ? theme.colors.brand : theme.colors.border },
                selected ? { backgroundColor: theme.colors.brand } : null,
              ]}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  option: {
    minHeight: touchTarget,
    borderRadius: radii.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
  },
  radio: { width: 20, height: 20, borderRadius: radii.round, borderWidth: 2 },
});
