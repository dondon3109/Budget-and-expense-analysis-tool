import { Pressable, StyleSheet, Text, View } from "react-native";

import { useZoptionTheme } from "@/ui/theme-provider";
import { radii, spacing, typography } from "@/ui/tokens";
import { withTapSound } from "@/features/sounds/sound-effects";

/** The pill switch between a tab's views: Home's Overview and Analytics, Budgets and Bills. */
export function ViewSwitch<T extends string>({
  options,
  selected,
  onSelect,
}: {
  options: readonly { value: T; label: string }[];
  selected: T;
  onSelect: (view: T) => void;
}) {
  const theme = useZoptionTheme();
  return (
    <View
      accessibilityRole="tablist"
      style={[
        styles.track,
        { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
      ]}
    >
      {options.map((option) => {
        const active = option.value === selected;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={withTapSound(() => onSelect(option.value))}
            style={[
              styles.segment,
              { backgroundColor: active ? theme.colors.brand : "transparent" },
            ]}
          >
            <Text
              style={[
                typography.callout,
                {
                  color: active ? theme.colors.onBrand : theme.colors.text,
                  fontWeight: active ? "600" : "500",
                },
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: "row",
    padding: spacing.xxs,
    borderRadius: radii.round,
    borderWidth: 1,
  },
  segment: {
    minHeight: 36,
    paddingHorizontal: spacing.sm,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.round,
  },
});
