import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useState, type ComponentProps, type PropsWithChildren } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, type PressableProps } from "react-native";

import { useZoptionTheme } from "@/ui/theme-provider";
import { radii, spacing, touchTarget, typography } from "@/ui/tokens";

export type ButtonVariant = "primary" | "secondary" | "danger" | "quiet";

interface ButtonProps extends Omit<PressableProps, "children" | "style">, PropsWithChildren {
  variant?: ButtonVariant;
  loading?: boolean;
  icon?: ComponentProps<typeof MaterialCommunityIcons>["name"];
  size?: "default" | "large";
}

export function Button({
  variant = "primary",
  loading = false,
  icon,
  size = "default",
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
  const resolvedAccessibilityLabel =
    accessibilityLabel ?? (typeof children === "string" ? children : undefined);
  const palette = {
    primary: {
      background: theme.colors.brand,
      pressed: theme.colors.brandPressed,
      text: theme.colors.onBrand,
      border: theme.colors.brandPressed,
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
  const disabledPalette = {
    background: theme.colors.surface,
    text: theme.colors.textMuted,
    border: theme.colors.border,
  };

  return (
    <Pressable
      accessibilityLabel={resolvedAccessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      android_ripple={
        isDisabled
          ? undefined
          : {
              color:
                variant === "primary" || variant === "danger"
                  ? "rgba(255, 255, 255, 0.24)"
                  : "rgba(15, 107, 91, 0.16)",
              borderless: false,
            }
      }
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
        size === "large" ? styles.large : null,
        {
          backgroundColor: isDisabled
            ? disabledPalette.background
            : pressed
              ? palette.pressed
              : palette.background,
          borderColor: isDisabled ? disabledPalette.border : palette.border,
        },
      ]}
      {...props}
    >
      {loading ? (
        <ActivityIndicator
          accessibilityElementsHidden
          color={isDisabled ? disabledPalette.text : palette.text}
        />
      ) : icon ? (
        <MaterialCommunityIcons
          accessibilityElementsHidden
          color={isDisabled ? disabledPalette.text : palette.text}
          name={icon}
          size={size === "large" ? 22 : 19}
        />
      ) : null}
      <Text
        numberOfLines={2}
        style={[
          size === "large" ? styles.largeLabel : typography.label,
          { color: isDisabled ? disabledPalette.text : palette.text, textAlign: "center" },
        ]}
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
  large: {
    minHeight: touchTarget + spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  largeLabel: {
    ...typography.callout,
    fontWeight: "600",
  },
});
