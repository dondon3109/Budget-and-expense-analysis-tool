import { Text } from "react-native";

import { useThemeStore } from "@/stores/theme-store";
import { useVoiceLanguageStore, VOICE_LANGUAGES } from "@/stores/voice-language-store";
import { CollapsibleCard } from "@/ui/components";
import { ThemePicker, themePreferenceLabel } from "@/ui/theme-picker";
import { useZoptionTheme } from "@/ui/theme-provider";
import { typography } from "@/ui/tokens";
import { VoiceLanguagePicker } from "@/ui/voice-language-picker";
import { DailyReminderCard } from "./DailyReminderCard";

/** Theme, voice language, and daily reminder pickers, folded to their current choice until opened. */
export function PreferenceCards() {
  const theme = useZoptionTheme();
  const themePreference = useThemeStore((state) => state.preference);
  const voiceLanguage = useVoiceLanguageStore((state) => state.language);
  const voiceLanguageLabel =
    VOICE_LANGUAGES.find((option) => option.code === voiceLanguage)?.label ?? "Auto";
  return (
    <>
      <CollapsibleCard
        title="Theme"
        summary={themePreferenceLabel(themePreference)}
        icon="palette-outline"
      >
        <ThemePicker />
      </CollapsibleCard>
      <CollapsibleCard
        title="Voice language"
        summary={voiceLanguageLabel}
        icon="microphone-outline"
      >
        <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
          Choose your default voice language for AI assistant voice chats and transaction voice
          entry. Auto mode automatically detects English and Tagalog.
        </Text>
        <VoiceLanguagePicker />
      </CollapsibleCard>
      <DailyReminderCard />
    </>
  );
}
