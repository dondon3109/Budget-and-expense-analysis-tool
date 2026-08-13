import { useState, type PropsWithChildren } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, type PressableProps } from "react-native";

import { useZoptionTheme } from "@/ui/theme-provider";
import { radii, spacing, touchTarget, typography } from "@/ui/tokens";

export type ButtonVariant = "primary" | "secondary" | "danger" | "quiet";

interface ButtonProps extends Omit<PressableProps, "children" | "style">, PropsWithChildren {
  variant?: ButtonVariant;
  loading?: boolean;
}

export function Button({
  variant = "primary",
  loading = false,
  disabled,
  children,
  accessibilityLabel,
  onPressIn,
  onPressOut,
  ...props
}: ButtonProps) {
  const theme = useZoptionTheme();
  const [pressed, setPressed] = useState(false);
  const isDisabled = disabled || loading;
  const palette = {
    primary: {
      background: theme.colors.brand,
      pressed: theme.colors.brandPressed,
      text: theme.colors.onBrand,
      border: theme.colors.brand,
    },
    secondary: {
      background: theme.colors.surfaceRaised,
      pressed: theme.colors.brandSoft,
      text: theme.colors.text,
      border: theme.colors.border,
    },
    danger: {
      background: theme.colors.danger,
      pressed: theme.colors.danger,
      text: theme.colors.onBrand,
      border: theme.colors.danger,
    },
    quiet: {
      background: "transparent",
      pressed: theme.colors.brandSoft,
      text: theme.colors.brand,
      border: "transparent",
    },
  }[variant];

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      onPressIn={(event) => {
        setPressed(true);
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        setPressed(false);
        onPressOut?.(event);
      }}
      style={[
        styles.base,
        {
          backgroundColor: pressed ? palette.pressed : palette.background,
          borderColor: palette.border,
          opacity: isDisabled ? 0.52 : 1,
        },
      ]}
      {...props}
    >
      {loading ? <ActivityIndicator accessibilityElementsHidden color={palette.text} /> : null}
      <Text
        numberOfLines={2}
        style={[typography.label, { color: palette.text, textAlign: "center" }]}
      >
        {children}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.xs,
    justifyContent: "center",
    minHeight: touchTarget,
    minWidth: touchTarget,
    borderRadius: radii.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
});
