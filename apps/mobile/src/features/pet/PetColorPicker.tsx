import { petColorLabels, petColors, petColorSwatch, type PetColor } from "@zoption/shared";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { withTapSound } from "@/features/sounds/sound-effects";
import { useZoptionTheme } from "@/ui/theme-provider";
import { radii, spacing, typography } from "@/ui/tokens";

interface PetColorPickerProps {
  label: string;
  /** Null while nothing is picked yet. */
  value: PetColor | null;
  disabled?: boolean;
  onChange: (color: PetColor) => void;
  /** Draws an option (the pet itself in that color) in place of its color dot. */
  preview?: (color: PetColor) => ReactNode;
}

/** The pet colors as a row of radio swatches. */
export function PetColorPicker({ label, value, disabled, onChange, preview }: PetColorPickerProps) {
  const theme = useZoptionTheme();
  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={[typography.label, { color: theme.colors.text }]}>{label}</Text>
      <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.row}>
        {petColors.map((color) => {
          const selected = value === color;
          return (
            <Pressable
              key={color}
              accessibilityRole="radio"
              accessibilityLabel={petColorLabels[color]}
              accessibilityState={{ selected, disabled }}
              disabled={disabled}
              onPress={withTapSound(() => onChange(color))}
              style={[
                styles.option,
                {
                  borderColor: selected ? theme.colors.brand : "transparent",
                  backgroundColor: selected ? theme.colors.brandSoft : undefined,
                  opacity: disabled ? 0.6 : 1,
                },
              ]}
            >
              {preview ? (
                preview(color)
              ) : (
                <View
                  style={[
                    styles.dot,
                    {
                      borderColor: theme.colors.border,
                      backgroundColor: petColorSwatch(color, String(theme.colors.surface)),
                    },
                  ]}
                />
              )}
              <Text style={[typography.caption, { color: theme.colors.text }]}>
                {petColorLabels[color]}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: spacing.xxs },
  option: {
    minWidth: 52,
    alignItems: "center",
    gap: spacing.xxs,
    padding: spacing.xxs,
    borderWidth: 2,
    borderRadius: radii.md,
  },
  dot: { width: 28, height: 28, borderRadius: radii.round, borderWidth: 2 },
});
