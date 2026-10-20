import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import brandIcon from "../../../assets/zoption-icon.png";
import { promptsForGoal } from "@/features/primary-goal/goal-personalization";
import { useLeadGoal } from "@/stores/goal-profile-store";
import { elevation, radii, spacing, touchTarget, typography } from "@/ui/tokens";
import { useZoptionTheme } from "@/ui/theme-provider";

import { COMPOSER_BUTTON, COMPOSER_HIT_SLOP, formatRecordingElapsed } from "./assistant-ui";
import type { RecordingPhase } from "./assistant-voice-hooks";
import { withTapSound } from "@/features/sounds/sound-effects";

const SUGGESTED_QUESTIONS = [
  "Where did my money go this month?",
  "Am I on budget this month?",
  "Which debt should I pay first?",
];

/** Empty chat: the Zoption mark and a greeting centered, starter questions beneath as chips. */
export function AssistantEmptyChat({ onPick }: { onPick: (question: string) => void }) {
  const theme = useZoptionTheme();
  const goal = useLeadGoal();
  return (
    <View style={styles.empty}>
      <Image accessibilityElementsHidden source={brandIcon} style={styles.emptyMark} />
      <Text
        accessibilityRole="header"
        style={[typography.display, styles.centered, { color: theme.colors.text }]}
      >
        Ask anything about your money
      </Text>
      <Text style={[typography.body, styles.emptyBody, { color: theme.colors.textMuted }]}>
        Answers come from your own records, and nothing is saved until you confirm it.
      </Text>
      <View style={styles.suggestions}>
        {promptsForGoal(SUGGESTED_QUESTIONS, goal).map((question) => (
          <Pressable
            key={question}
            accessibilityRole="button"
            accessibilityLabel={question}
            onPress={withTapSound(() => onPick(question))}
            style={[
              styles.suggestion,
              { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
            ]}
          >
            <Text style={[typography.callout, { color: theme.colors.text }]}>{question}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

type VoiceStatusBannerProps =
  | { kind: "error"; message: string; onDismiss: () => void }
  | {
      kind: Exclude<RecordingPhase, "idle">;
      elapsedSeconds: number;
      liveUnavailable: boolean;
    };

/** One banner above the composer for recording, transcribing, mic permission, and voice errors. */
export function VoiceStatusBanner(props: VoiceStatusBannerProps) {
  const theme = useZoptionTheme();
  if (props.kind === "error") {
    return (
      <View
        accessibilityRole="alert"
        style={[
          styles.voiceStatus,
          { backgroundColor: theme.colors.dangerSoft, borderColor: theme.colors.danger },
        ]}
      >
        <MaterialCommunityIcons name="microphone-off" size={20} color={theme.colors.danger} />
        <Text style={[typography.label, styles.voiceStatusText, { color: theme.colors.text }]}>
          {props.message}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          onPress={withTapSound(props.onDismiss)}
          hitSlop={12}
        >
          <MaterialCommunityIcons name="close" size={18} color={theme.colors.textMuted} />
        </Pressable>
      </View>
    );
  }
  const recording = props.kind === "recording";
  return (
    <View
      accessibilityLiveRegion="polite"
      style={[
        styles.voiceStatus,
        {
          backgroundColor: recording ? theme.colors.dangerSoft : theme.colors.surface,
          borderColor: recording ? theme.colors.danger : theme.colors.border,
        },
      ]}
    >
      {recording ? (
        <View style={[styles.recordingDot, { backgroundColor: theme.colors.danger }]} />
      ) : (
        <ActivityIndicator color={theme.colors.brand} size="small" />
      )}
      <View style={styles.voiceStatusText}>
        <Text style={[typography.label, { color: theme.colors.text }]}>
          {recording
            ? "Recording " + formatRecordingElapsed(props.elapsedSeconds)
            : props.kind === "transcribing"
              ? "Transcribing your question…"
              : "Allowing microphone access…"}
        </Text>
        {recording ? (
          <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
            {props.liveUnavailable
              ? "No live preview. Your words appear when you stop."
              : "Tap the microphone to stop."}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/** Round header button of the chat view, one each side of the conversation title. */
export function ChatHeaderButton({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  const theme = useZoptionTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={withTapSound(onPress)}
      style={[
        styles.headerButton,
        elevation.card,
        { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
      ]}
    >
      <MaterialCommunityIcons name={icon} size={22} color={theme.colors.text} />
    </Pressable>
  );
}

/** Floating button that returns to the newest message once the reader scrolls up. */
export function ScrollToLatestButton({ onPress }: { onPress: () => void }) {
  const theme = useZoptionTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Scroll to latest message"
      onPress={withTapSound(onPress)}
      style={[
        styles.scrollButton,
        elevation.card,
        { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
      ]}
    >
      <MaterialCommunityIcons name="arrow-down" size={20} color={theme.colors.text} />
    </Pressable>
  );
}

/** The message box: text on top, the voice and send buttons on a row beneath it. */
export function AssistantComposer({
  draft,
  onChangeDraft,
  maxLength,
  canSend,
  onSend,
  voiceButton,
}: {
  draft: string;
  onChangeDraft: (text: string) => void;
  maxLength: number;
  canSend: boolean;
  onSend: () => void;
  voiceButton?: ReactNode;
}) {
  const theme = useZoptionTheme();
  return (
    <View
      style={[
        styles.composer,
        elevation.card,
        { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
      ]}
    >
      <TextInput
        accessibilityLabel="Message the assistant"
        multiline
        value={draft}
        onChangeText={onChangeDraft}
        placeholder="Ask anything…"
        placeholderTextColor={theme.colors.textMuted}
        maxLength={maxLength}
        style={[styles.input, { color: theme.colors.text }]}
      />
      {voiceButton}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Send message"
        accessibilityState={{ disabled: !canSend }}
        disabled={!canSend}
        hitSlop={COMPOSER_HIT_SLOP}
        onPress={withTapSound(onSend)}
        style={[
          styles.sendButton,
          { backgroundColor: canSend ? theme.colors.brand : theme.colors.border },
        ]}
      >
        <MaterialCommunityIcons name="arrow-up" size={20} color={theme.colors.onBrand} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  emptyMark: { width: 72, height: 72, borderRadius: radii.xl, marginBottom: spacing.sm },
  centered: { textAlign: "center" },
  emptyBody: { textAlign: "center", maxWidth: 300 },
  suggestions: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  suggestion: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.round,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
  },
  voiceStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginHorizontal: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  voiceStatusText: { flex: 1, gap: 2 },
  recordingDot: { width: 10, height: 10, borderRadius: radii.round },
  headerButton: {
    width: touchTarget,
    height: touchTarget,
    borderRadius: radii.round,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  scrollButton: {
    position: "absolute",
    alignSelf: "center",
    bottom: spacing.sm,
    width: 40,
    height: 40,
    borderRadius: radii.round,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.xs,
    marginHorizontal: spacing.md,
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.xl,
    paddingLeft: spacing.md,
    paddingRight: 6,
    paddingVertical: 6,
  },
  input: {
    flex: 1,
    minHeight: COMPOSER_BUTTON,
    maxHeight: 120,
    fontSize: 16,
    paddingVertical: 7,
    textAlignVertical: "center",
  },
  sendButton: {
    width: COMPOSER_BUTTON,
    height: COMPOSER_BUTTON,
    borderRadius: radii.round,
    alignItems: "center",
    justifyContent: "center",
  },
});
