import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";

import { radii, spacing, touchTarget, typography } from "@/ui/tokens";
import { useZoptionTheme } from "@/ui/theme-provider";
import { BottomSheet } from "./BottomSheet";

export interface SelectionOption {
  id: string;
  label: string;
  detail?: string;
  color?: string;
}

interface SelectionFieldProps {
  label: string;
  value: string;
  options: SelectionOption[];
  placeholder: string;
  sheetTitle: string;
  error?: string;
  hint?: string;
  disabled?: boolean;
  onSelect: (value: string) => void;
}

export function SelectionField({
  label,
  value,
  options,
  placeholder,
  sheetTitle,
  error,
  hint,
  disabled,
  onSelect,
}: SelectionFieldProps) {
  const theme = useZoptionTheme();
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.id === value);
  return (
    <View className="w-full gap-2">
      <Text style={[typography.label, { color: theme.colors.text }]}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          selected
            ? `${label}, ${selected.label}${selected.detail ? `, ${selected.detail}` : ""}`
            : label
        }
        accessibilityHint={error ?? hint ?? `Opens ${sheetTitle.toLowerCase()}`}
        accessibilityState={{ disabled: Boolean(disabled), expanded: open }}
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={[
          styles.field,
          {
            backgroundColor: theme.colors.surface,
            borderColor: error ? theme.colors.danger : theme.colors.border,
            opacity: disabled ? 0.55 : 1,
          },
        ]}
      >
        <View style={styles.fieldContent}>
          {selected?.color ? (
            <View
              accessibilityElementsHidden
              style={[styles.dot, { backgroundColor: selected.color }]}
            />
          ) : null}
          <View style={styles.fieldText}>
            <Text
              numberOfLines={1}
              style={[
                typography.body,
                { color: selected ? theme.colors.text : theme.colors.textMuted },
              ]}
            >
              {selected?.label ?? placeholder}
            </Text>
            {selected?.detail ? (
              <Text
                numberOfLines={1}
                style={[typography.caption, { color: theme.colors.textMuted }]}
              >
                {selected.detail}
              </Text>
            ) : null}
          </View>
        </View>
        <MaterialCommunityIcons
          accessibilityElementsHidden
          color={theme.colors.textMuted}
          name="chevron-down"
          size={22}
        />
      </Pressable>
      {error ? (
        <Text
          accessibilityRole="alert"
          style={[typography.caption, { color: theme.colors.danger }]}
        >
          {error}
        </Text>
      ) : hint ? (
        <Text style={[typography.caption, { color: theme.colors.textMuted }]}>{hint}</Text>
      ) : null}
      <BottomSheet visible={open} title={sheetTitle} onDismiss={() => setOpen(false)}>
        <FlatList
          data={options}
          keyExtractor={(option) => option.id}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => {
            const isSelected = item.id === value;
            return (
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ checked: isSelected }}
                accessibilityLabel={item.label}
                accessibilityHint={item.detail}
                onPress={() => {
                  onSelect(item.id);
                  setOpen(false);
                }}
                style={[
                  styles.option,
                  {
                    backgroundColor: isSelected ? theme.colors.brandSoft : "transparent",
                  },
                ]}
              >
                {item.color ? (
                  <View
                    accessibilityElementsHidden
                    style={[styles.dot, { backgroundColor: item.color }]}
                  />
                ) : null}
                <View className="min-w-0 flex-1">
                  <Text style={[typography.body, { color: theme.colors.text }]}>{item.label}</Text>
                  {item.detail ? (
                    <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
                      {item.detail}
                    </Text>
                  ) : null}
                </View>
                {isSelected ? (
                  <MaterialCommunityIcons
                    accessibilityElementsHidden
                    color={theme.colors.brand}
                    name="check"
                    size={22}
                  />
                ) : null}
              </Pressable>
            );
          }}
        />
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    width: "100%",
    minHeight: touchTarget,
    borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
  },
  fieldContent: {
    minWidth: 0,
    flex: 1,
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.xs,
  },
  fieldText: { minWidth: 0, flex: 1 },
  option: {
    minHeight: touchTarget,
    borderRadius: radii.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
  },
  dot: { width: 10, height: 10, borderRadius: radii.round },
});
