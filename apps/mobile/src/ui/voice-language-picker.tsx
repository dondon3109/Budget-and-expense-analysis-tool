import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  useVoiceLanguageStore,
  VOICE_LANGUAGES,
  type VoiceLanguage,
} from "@/stores/voice-language-store";
import { radii, spacing, touchTarget, typography } from "./tokens";
import { useZoptionTheme } from "./theme-provider";

export function VoiceLanguagePicker({
  selectedLanguage,
  onSelectLanguage,
  value,
  onChange,
  disabled,
}: {
  selectedLanguage?: VoiceLanguage;
  onSelectLanguage?: (lang: VoiceLanguage) => void;
  value?: VoiceLanguage;
  onChange?: (lang: VoiceLanguage) => void;
  disabled?: boolean;
} = {}) {
  const theme = useZoptionTheme();
  const storeLanguage = useVoiceLanguageStore((state) => state.language);
  const setStoreLanguage = useVoiceLanguageStore((state) => state.setLanguage);

  const language = value ?? selectedLanguage ?? storeLanguage;
  const handleSelect = (code: VoiceLanguage) => {
    if (disabled) return;
    if (onChange) onChange(code);
    if (onSelectLanguage) onSelectLanguage(code);
    if (!onChange && !onSelectLanguage) setStoreLanguage(code);
  };

  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel="Voice language"
      className="w-full gap-2"
    >
      {VOICE_LANGUAGES.map((option) => {
        const selected = language === option.code;
        return (
          <Pressable
            key={option.code}
            accessibilityRole="radio"
            accessibilityLabel={`${option.label}, ${option.description}`}
            accessibilityState={{ selected, disabled: Boolean(disabled) }}
            disabled={disabled}
            android_ripple={{
              color: selected ? "rgba(10, 117, 86, 0.16)" : "rgba(0, 0, 0, 0.06)",
              borderless: false,
            }}
            onPress={() => handleSelect(option.code)}
            className="w-full flex-row items-center justify-between"
            style={[
              styles.option,
              {
                backgroundColor: selected ? theme.colors.brandSoft : theme.colors.surface,
                borderColor: selected ? theme.colors.brand : theme.colors.border,
              },
              disabled && { opacity: 0.6 },
            ]}
          >
            <View style={styles.optionLeft}>
              <View style={styles.optionTitleRow}>
                <Text style={[typography.headline, { color: theme.colors.text }]}>
                  {option.label}
                </Text>
                {option.code === "auto" ? (
                  <View
                    style={[
                      styles.badge,
                      {
                        backgroundColor: theme.colors.brandSoft,
                        borderColor: theme.colors.brand,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        typography.caption,
                        { color: theme.colors.brand, fontWeight: "600", fontSize: 11 },
                      ]}
                    >
                      Default
                    </Text>
                  </View>
                ) : null}
              </View>
              <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
                {option.description}
              </Text>
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

export function VoiceLanguageToggleGroup({
  language,
  onLanguageChange,
  value,
  onChange,
  disabled,
}: {
  language?: VoiceLanguage;
  onLanguageChange?: (lang: VoiceLanguage) => void;
  value?: VoiceLanguage;
  onChange?: (lang: VoiceLanguage) => void;
  disabled?: boolean;
} = {}) {
  const theme = useZoptionTheme();
  const storeLanguage = useVoiceLanguageStore((state) => state.language);
  const setStoreLanguage = useVoiceLanguageStore((state) => state.setLanguage);

  const active = value ?? language ?? storeLanguage;
  const select = (code: VoiceLanguage) => {
    if (disabled) return;
    if (onChange) onChange(code);
    if (onLanguageChange) onLanguageChange(code);
    if (!onChange && !onLanguageChange) setStoreLanguage(code);
  };

  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel="Voice language selection"
      style={[
        styles.toggleGroup,
        {
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.canvasMuted,
        },
        disabled && { opacity: 0.6 },
      ]}
    >
      {VOICE_LANGUAGES.map((opt) => {
        const isSelected = active === opt.code;
        return (
          <Pressable
            key={opt.code}
            accessibilityRole="radio"
            accessibilityLabel={`${opt.label} voice language`}
            accessibilityState={{ selected: isSelected, disabled: Boolean(disabled) }}
            disabled={disabled}
            onPress={() => select(opt.code)}
            style={[
              styles.toggleButton,
              isSelected && [
                styles.toggleButtonActive,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.brand,
                },
              ],
            ]}
          >
            <Text
              style={[
                typography.caption,
                styles.toggleButtonText,
                {
                  color: isSelected ? theme.colors.brand : theme.colors.textMuted,
                  fontWeight: isSelected ? "700" : "500",
                },
              ]}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function VoiceLanguageBadgeButton({
  language,
  onPress,
  disabled,
}: {
  language?: VoiceLanguage;
  onPress?: () => void;
  disabled?: boolean;
} = {}) {
  const theme = useZoptionTheme();
  const storeLanguage = useVoiceLanguageStore((state) => state.language);
  const cycleStoreLanguage = useVoiceLanguageStore((state) => state.cycleLanguage);

  const current = language ?? storeLanguage;
  const opt = VOICE_LANGUAGES.find((o) => o.code === current) ?? VOICE_LANGUAGES[0]!;

  const handlePress = () => {
    if (disabled) return;
    if (onPress) onPress();
    else cycleStoreLanguage();
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Voice language: ${opt.label}. Tap to switch language`}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={handlePress}
      style={({ pressed }) => [
        styles.badgeButton,
        {
          backgroundColor: pressed ? theme.colors.canvasMuted : theme.colors.brandSoft,
          borderColor: theme.colors.brand,
        },
        disabled && { opacity: 0.6 },
      ]}
    >
      <Text style={[typography.caption, styles.badgeButtonText, { color: theme.colors.brand }]}>
        {opt.shortLabel}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  option: {
    minHeight: touchTarget,
    borderRadius: radii.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  optionLeft: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  optionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  badge: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 1,
    borderRadius: radii.sm,
    borderWidth: 1,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: radii.round,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: spacing.sm,
  },
  toggleGroup: {
    flexDirection: "row",
    borderRadius: radii.md,
    borderWidth: 1,
    padding: 2,
    gap: 2,
  },
  toggleButton: {
    flex: 1,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xs,
    borderRadius: radii.sm,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "transparent",
    minHeight: 32,
  },
  toggleButtonActive: {
    elevation: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 1,
  },
  toggleButtonText: {
    fontSize: 12,
  },
  badgeButton: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 4,
    borderRadius: radii.sm,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 44,
    minHeight: 36,
    height: 36,
  },
  badgeButtonText: {
    fontWeight: "700",
    fontSize: 11,
    letterSpacing: 0.5,
  },
});
