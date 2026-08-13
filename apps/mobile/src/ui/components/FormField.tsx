import { forwardRef, useId, type ReactNode } from "react";
import { StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";

import { radii, spacing, touchTarget, typography } from "@/ui/tokens";
import { useZoptionTheme } from "@/ui/theme-provider";

interface FormFieldProps extends TextInputProps {
  label: string;
  error?: string;
  hint?: string;
  trailing?: ReactNode;
}

export const FormField = forwardRef<TextInput, FormFieldProps>(function FormField(
  { label, error, hint, trailing, style, ...props },
  ref,
) {
  const theme = useZoptionTheme();
  const nativeId = useId();
  const errorId = `${nativeId}-error`;
  const hintId = `${nativeId}-hint`;

  return (
    <View className="w-full gap-2">
      <Text style={[typography.label, { color: theme.colors.text }]}>{label}</Text>
      <View className="flex-row items-center">
        <TextInput
          ref={ref}
          accessibilityLabel={label}
          accessibilityHint={error ?? hint}
          aria-describedby={error ? errorId : hint ? hintId : undefined}
          placeholderTextColor={theme.colors.textMuted}
          style={[
            styles.input,
            {
              backgroundColor: theme.colors.surface,
              borderColor: error ? theme.colors.danger : theme.colors.border,
              color: theme.colors.text,
            },
            trailing ? styles.withTrailing : null,
            style,
          ]}
          {...props}
        />
        {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
      </View>
      {error ? (
        <Text
          nativeID={errorId}
          accessibilityRole="alert"
          style={[typography.caption, { color: theme.colors.danger }]}
        >
          {error}
        </Text>
      ) : hint ? (
        <Text nativeID={hintId} style={[typography.caption, { color: theme.colors.textMuted }]}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  input: {
    flex: 1,
    minHeight: touchTarget,
    borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...typography.body,
  },
  withTrailing: { paddingRight: touchTarget + spacing.xs },
  trailing: { position: "absolute", right: 0, minWidth: touchTarget, alignItems: "center" },
});
