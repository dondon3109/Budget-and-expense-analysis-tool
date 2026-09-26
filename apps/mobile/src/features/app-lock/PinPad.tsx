import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { PIN_LENGTH } from "@/auth/app-lock";
import { useZoptionTheme } from "@/ui/theme-provider";
import { radii, spacing, typography } from "@/ui/tokens";

const KEY_ROWS = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
  [null, "0", "delete"],
] as const;

interface PinPadScreenProps {
  title: string;
  message: string;
  value: string;
  /** Called with the next value; the parent submits once it reaches PIN_LENGTH. */
  onChange: (next: string) => void;
  error?: string | null;
  disabled?: boolean;
  footer?: ReactNode;
}

/** Full-screen PIN entry: a heading, one dot per digit, and a 3×4 number pad. */
export function PinPadScreen({
  title,
  message,
  value,
  onChange,
  error,
  disabled = false,
  footer,
}: PinPadScreenProps) {
  const theme = useZoptionTheme();
  // NativeWind's Pressable wrapper replaces a style function with an empty
  // style, which dropped each key's size, so pressed feedback is tracked here.
  const [pressedKey, setPressedKey] = useState<string | null>(null);
  const dotColor = error ? theme.colors.danger : theme.colors.text;

  const press = (key: string): void => {
    if (disabled) return;
    if (key === "delete") {
      onChange(value.slice(0, -1));
      return;
    }
    if (value.length >= PIN_LENGTH) return;
    onChange(value + key);
  };

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: theme.colors.canvas }]}>
      <View style={styles.header}>
        <MaterialCommunityIcons name="lock-outline" size={28} color={theme.colors.text} />
        <Text
          accessibilityRole="header"
          style={[typography.title, styles.centered, { color: theme.colors.text }]}
        >
          {title}
        </Text>
        <Text style={[typography.callout, styles.centered, { color: theme.colors.textMuted }]}>
          {message}
        </Text>
        <View
          accessible
          accessibilityLabel={`${value.length} of ${PIN_LENGTH} digits entered`}
          style={styles.dots}
        >
          {Array.from({ length: PIN_LENGTH }, (_, index) => (
            <View
              key={index}
              style={[
                styles.dot,
                {
                  borderColor: error ? theme.colors.danger : theme.colors.textMuted,
                  backgroundColor: index < value.length ? dotColor : "transparent",
                },
              ]}
            />
          ))}
        </View>
        {/* Reserved height keeps the pad from jumping when an error appears. */}
        <Text
          accessibilityRole={error ? "alert" : undefined}
          style={[typography.callout, styles.error, { color: theme.colors.danger }]}
        >
          {error ?? ""}
        </Text>
      </View>

      <View style={styles.pad}>
        {KEY_ROWS.map((row, rowIndex) => (
          <View key={rowIndex} style={styles.row}>
            {row.map((key) => {
              if (key === null) return <View key="blank" style={styles.key} />;
              // Delete stays in place but out of sight until there is a digit to remove.
              const hidden = key === "delete" && value.length === 0;
              return (
                <Pressable
                  key={key}
                  accessibilityRole="button"
                  accessibilityLabel={key === "delete" ? "Delete digit" : key}
                  accessibilityState={{ disabled: disabled || hidden }}
                  accessibilityElementsHidden={hidden}
                  importantForAccessibility={hidden ? "no-hide-descendants" : "auto"}
                  disabled={disabled || hidden}
                  onPress={() => press(key)}
                  onLongPress={key === "delete" ? () => onChange("") : undefined}
                  onPressIn={() => setPressedKey(key)}
                  onPressOut={() => setPressedKey(null)}
                  style={[
                    styles.key,
                    pressedKey === key ? { backgroundColor: theme.colors.surface } : null,
                    disabled ? styles.disabled : null,
                    hidden ? styles.hidden : null,
                  ]}
                >
                  {key === "delete" ? (
                    <MaterialCommunityIcons
                      name="backspace-outline"
                      size={24}
                      color={theme.colors.textMuted}
                    />
                  ) : (
                    <Text style={[styles.digit, { color: theme.colors.text }]}>{key}</Text>
                  )}
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>

      <View style={styles.footer}>{footer}</View>
    </SafeAreaView>
  );
}

/** Asks for a new PIN twice and hands it to `onSave` once both entries match. */
export function PinSetupScreen({
  onSave,
  footer,
}: {
  onSave: (pin: string) => Promise<void>;
  footer?: ReactNode;
}) {
  const [firstEntry, setFirstEntry] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async (pin: string): Promise<void> => {
    setSaving(true);
    try {
      await onSave(pin);
    } catch {
      setFirstEntry(null);
      setValue("");
      setError("Zoption could not save the PIN. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const change = (next: string): void => {
    setError(null);
    setValue(next);
    if (next.length < PIN_LENGTH) return;
    if (firstEntry === null) {
      setFirstEntry(next);
      setValue("");
      return;
    }
    if (next !== firstEntry) {
      setFirstEntry(null);
      setValue("");
      setError("The PINs did not match. Start again.");
      return;
    }
    void save(next);
  };

  return (
    <PinPadScreen
      title={firstEntry === null ? "Create a PIN" : "Confirm your PIN"}
      message={
        firstEntry === null
          ? `Choose ${PIN_LENGTH} digits to unlock Zoption on this device.`
          : "Enter the same PIN again."
      }
      value={value}
      onChange={change}
      error={error}
      disabled={saving}
      footer={footer}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: spacing.lg },
  header: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingTop: spacing.xl,
  },
  centered: { textAlign: "center" },
  dots: { flexDirection: "row", gap: spacing.md, marginTop: spacing.lg },
  dot: { width: 12, height: 12, borderRadius: radii.round, borderWidth: 1.5 },
  error: { minHeight: 20, marginTop: spacing.sm, textAlign: "center" },
  pad: { alignSelf: "center", gap: spacing.sm },
  row: { flexDirection: "row", gap: spacing.xl },
  key: {
    width: 72,
    height: 72,
    borderRadius: radii.round,
    alignItems: "center",
    justifyContent: "center",
  },
  digit: { fontSize: 28, lineHeight: 34, fontWeight: "400", fontVariant: ["tabular-nums"] },
  disabled: { opacity: 0.4 },
  hidden: { opacity: 0 },
  footer: {
    minHeight: 64,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: spacing.sm,
  },
});
