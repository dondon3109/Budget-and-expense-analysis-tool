import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useThemeStore } from "@/stores/theme-store";
import { radii, spacing, touchTarget, typography, type ThemePreference } from "./tokens";
import { useZoptionTheme } from "./theme-provider";

const options: Array<{
  value: ThemePreference;
  label: string;
  swatchBg?: string;
  swatchDot?: string;
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
}> = [
  { value: "system", label: "System (follows device)", icon: "theme-light-dark" },
  { value: "light", label: "Light (warm paper)", swatchBg: "#f4f1e9", swatchDot: "#0f6b5b" },
  { value: "dark", label: "Dark (neutral black)", swatchBg: "#0f1115", swatchDot: "#67e0bc" },
  { value: "coffee", label: "Coffee (warm tan)", swatchBg: "#efe4d2", swatchDot: "#0f6b5b" },
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
            android_ripple={{
              color: selected ? "rgba(15, 107, 91, 0.16)" : "rgba(0, 0, 0, 0.06)",
              borderless: false,
            }}
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
            <View style={styles.optionLeft}>
              {option.swatchBg ? (
                <View
                  accessibilityElementsHidden
                  style={[styles.swatch, { backgroundColor: option.swatchBg }]}
                >
                  <View style={[styles.swatchDot, { backgroundColor: option.swatchDot }]} />
                </View>
              ) : option.icon ? (
                <View
                  accessibilityElementsHidden
                  style={[styles.swatch, { backgroundColor: theme.colors.surfaceRaised }]}
                >
                  <MaterialCommunityIcons name={option.icon} size={16} color={theme.colors.brand} />
                </View>
              ) : null}
              <Text style={[typography.body, { color: theme.colors.text }]}>{option.label}</Text>
            </View>
            <View
              accessibilityElementsHidden
              style={[
                styles.radio,
                { borderColor: selected ? theme.colors.brand : theme.colors.border },
                selected ? { backgroundColor: theme.colors.brand } : null,
              ]}
            >
              {selected ? (
                <MaterialCommunityIcons name="check" size={12} color={theme.colors.onBrand} />
              ) : null}
            </View>
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
    paddingVertical: spacing.xs,
  },
  optionLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flex: 1,
    minWidth: 0,
  },
  swatch: {
    width: 28,
    height: 28,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  swatchDot: {
    width: 10,
    height: 10,
    borderRadius: radii.round,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: radii.round,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
});
