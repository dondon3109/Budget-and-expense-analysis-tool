import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { promptsForGoal } from "@/features/primary-goal/goal-personalization";
import { useLeadGoal } from "@/stores/goal-profile-store";
import { elevation, radii, spacing, touchTarget, typography } from "@/ui/tokens";
import { useZoptionTheme } from "@/ui/theme-provider";

import { formatRecordingElapsed } from "./assistant-ui";
import type { RecordingPhase } from "./assistant-voice-hooks";
import { withTapSound } from "@/features/sounds/sound-effects";

const SUGGESTED_QUESTIONS = [
  "Where did my money go this month?",
  "Am I on budget this month?",
  "Which debt should I pay first?",
];

/** Empty-chat prompt with starter questions; tapping one fills the message box. */
export function AssistantEmptyChat({ onPick }: { onPick: (question: string) => void }) {
  const theme = useZoptionTheme();
  const goal = useLeadGoal();
  return (
    <View style={styles.suggestions}>
      <Text accessibilityRole="header" style={[typography.title, { color: theme.colors.text }]}>
        Ask anything about your money
      </Text>
      <Text style={[typography.body, { color: theme.colors.textMuted }]}>
        Tap a question to start, or type your own.
      </Text>
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
          <Text style={[typography.body, { color: theme.colors.text, flex: 1 }]}>{question}</Text>
          <MaterialCommunityIcons name="arrow-top-right" size={18} color={theme.colors.textMuted} />
        </Pressable>
      ))}
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
        placeholder="Ask anything"
        placeholderTextColor={theme.colors.textMuted}
        maxLength={maxLength}
        style={[styles.input, { color: theme.colors.text }]}
      />
      <View style={styles.composerActions}>
        {voiceButton}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send message"
          accessibilityState={{ disabled: !canSend }}
          disabled={!canSend}
          onPress={withTapSound(onSend)}
          style={[
            styles.sendButton,
            { backgroundColor: canSend ? theme.colors.brand : theme.colors.border },
          ]}
        >
          <MaterialCommunityIcons name="arrow-up" size={22} color={theme.colors.onBrand} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  suggestions: { gap: spacing.sm, paddingTop: spacing.md },
  suggestion: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: touchTarget,
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
    marginHorizontal: spacing.md,
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.xl,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    gap: spacing.xs,
  },
  input: {
    minHeight: 40,
    maxHeight: 140,
    fontSize: 16,
    paddingVertical: 4,
    textAlignVertical: "top",
  },
  composerActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: spacing.xs,
  },
  sendButton: {
    width: touchTarget,
    height: touchTarget,
    borderRadius: radii.round,
    alignItems: "center",
    justifyContent: "center",
  },
});
