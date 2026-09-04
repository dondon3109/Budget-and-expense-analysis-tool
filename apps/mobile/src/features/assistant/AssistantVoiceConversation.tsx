import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import {
  CURRENT_ASSISTANT_VOICE_CONSENT_VERSION,
  type AssistantThread,
  type AssistantVoicePreferences,
} from "@zoption/shared";

import { createAssistantThreadTurn, sendAssistantTurn } from "@/api/assistant";
import { getAssistantVoicePreferences, grantAssistantVoiceConsent } from "@/api/assistant-voice";
import { ApiTransportError } from "@/api/authenticated";
import { useZoptionTheme } from "@/ui/theme-provider";
import { radii, spacing, typography } from "@/ui/tokens";
import { newClientRequestId } from "./assistant-forms";
import { useAssistantRecorder, useSpokenReplies } from "./assistant-voice-hooks";

/**
 * The only voice used by the voice conversation: Bright Female.
 * Same Fish Audio preset as web ("bright"); no picker is offered here.
 */
export const VOICE_CONVERSATION_SPEECH_VOICE = "bright" as const;

type VoiceStatus = "idle" | "listening" | "thinking" | "speaking";

interface VoiceCaption {
  id: string;
  role: "user" | "assistant";
  text: string;
}

interface AssistantVoiceConversationProps {
  getAccessToken: (refresh: boolean) => Promise<string>;
  withToken: <T>(operation: (token: string) => Promise<T>) => Promise<T>;
  assistantName: string;
  onClose: () => void;
  onTurnComplete: (thread: AssistantThread) => void;
}

const STATUS_LABEL: Record<VoiceStatus, string> = {
  idle: "Tap the ball and speak",
  listening: "Listening…",
  thinking: "Checking your records…",
  speaking: "Speaking…",
};

function newCaptionId(): string {
  return `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

export function AssistantVoiceConversation({
  getAccessToken,
  withToken,
  assistantName,
  onClose,
  onTurnComplete,
}: AssistantVoiceConversationProps) {
  const theme = useZoptionTheme();
  const listRef = useRef<FlatList<VoiceCaption>>(null);
  const statusRef = useRef<VoiceStatus>("idle");
  const threadIdRef = useRef<string | null>(null);
  const mountedRef = useRef(true);

  const [preferences, setPreferences] = useState<AssistantVoicePreferences | null>(null);
  const [prefsError, setPrefsError] = useState<string | null>(null);
  const [enabling, setEnabling] = useState(false);
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [livePartial, setLivePartial] = useState("");
  const [captions, setCaptions] = useState<VoiceCaption[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);

  const setVoiceStatus = useCallback((next: VoiceStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    let current = true;
    void withToken((token) => getAssistantVoicePreferences({ accessToken: token }))
      .then((data) => {
        if (current) setPreferences(data);
      })
      .catch((error: unknown) => {
        if (current) {
          setPrefsError(
            error instanceof ApiTransportError
              ? error.message
              : "Voice chat could not be prepared.",
          );
        }
      });
    return () => {
      current = false;
      mountedRef.current = false;
    };
  }, [withToken]);

  const consented = Boolean(
    preferences?.consentedAt &&
    preferences.consentVersion === CURRENT_ASSISTANT_VOICE_CONSENT_VERSION,
  );
  const speechAvailable = preferences?.speechAvailable !== false;

  const enableVoice = useCallback(async () => {
    setEnabling(true);
    setNotice(null);
    try {
      // Consent first: the microphone is never requested before consent.
      const data = await withToken((token) => grantAssistantVoiceConsent({ accessToken: token }));
      if (mountedRef.current) setPreferences(data);
    } catch (error) {
      if (mountedRef.current) {
        setNotice(
          error instanceof ApiTransportError ? error.message : "Voice could not be enabled.",
        );
      }
    } finally {
      if (mountedRef.current) setEnabling(false);
    }
  }, [withToken]);

  const handleRecorderError = useCallback(
    (error: ApiTransportError) => {
      if (!mountedRef.current) return;
      setNotice(error.message);
      setVoiceStatus("idle");
    },
    [setVoiceStatus],
  );

  const handleSpeechError = useCallback(
    (error: ApiTransportError) => {
      if (!mountedRef.current) return;
      setAudioError(error.message);
      setVoiceStatus("idle");
    },
    [setVoiceStatus],
  );

  const spoken = useSpokenReplies({
    getAccessToken,
    onError: handleSpeechError,
    onEnded: () => {
      if (mountedRef.current) setVoiceStatus("idle");
    },
  });
  const spokenRef = useRef(spoken);
  spokenRef.current = spoken;

  const handleFinalTranscript = useCallback(
    async (text: string) => {
      const finalText = text.trim();
      if (!finalText || statusRef.current === "thinking" || statusRef.current === "speaking") {
        return;
      }
      setLivePartial("");
      setNotice(null);
      setAudioError(null);
      setCaptions((current) => [...current, { id: newCaptionId(), role: "user", text: finalText }]);
      setVoiceStatus("thinking");
      try {
        const threadId = threadIdRef.current;
        const input = {
          message: finalText,
          clientRequestId: newClientRequestId(),
          kind: "voice" as const,
        };
        const turn = await withToken((token) =>
          threadId
            ? sendAssistantTurn({ accessToken: token }, threadId, input)
            : createAssistantThreadTurn({ accessToken: token }, input),
        );
        if (!mountedRef.current) return;
        threadIdRef.current = turn.thread.id;
        onTurnComplete(turn.thread);
        setCaptions((current) => [
          ...current,
          { id: turn.assistantMessage.id, role: "assistant", text: turn.assistantMessage.content },
        ]);
        if (!speechAvailable) {
          setNotice("Spoken replies are unavailable in this environment. Showing text only.");
          setVoiceStatus("idle");
          return;
        }
        setVoiceStatus("speaking");
        await spokenRef.current.listen(turn.assistantMessage.id, VOICE_CONVERSATION_SPEECH_VOICE);
      } catch (error) {
        if (!mountedRef.current) return;
        setNotice(
          error instanceof ApiTransportError ? error.message : "The voice turn failed. Try again.",
        );
        setVoiceStatus("idle");
      }
    },
    [onTurnComplete, setVoiceStatus, speechAvailable, withToken],
  );
  const transcriptRef = useRef(handleFinalTranscript);
  transcriptRef.current = handleFinalTranscript;

  const recorder = useAssistantRecorder({
    getAccessToken,
    onTranscribed: (text) => void transcriptRef.current(text),
    onError: handleRecorderError,
    onPartialTranscript: (partial) => {
      if (mountedRef.current) setLivePartial(partial);
    },
  });

  const handleOrbPress = useCallback(() => {
    if (!consented) {
      void enableVoice();
      return;
    }
    if (status === "listening") {
      void recorder.stopAndTranscribe();
    } else if (status === "idle") {
      setNotice(null);
      setAudioError(null);
      setLivePartial("");
      setVoiceStatus("listening");
      void recorder.startRecording();
    }
  }, [consented, enableVoice, recorder, setVoiceStatus, status]);

  const handleClose = useCallback(() => {
    if (statusRef.current === "listening") {
      void recorder.cancelRecording();
    }
    const playing = spokenRef.current.playingMessageId;
    if (playing !== null) {
      void spokenRef.current.listen(playing, VOICE_CONVERSATION_SPEECH_VOICE);
    }
    onClose();
  }, [onClose, recorder]);

  if (!preferences && prefsError === null) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={theme.colors.brand} />
        <Text style={[typography.callout, { color: theme.colors.textMuted }]}>
          Preparing voice chat…
        </Text>
      </View>
    );
  }

  if (prefsError !== null) {
    return (
      <View style={styles.centered}>
        <Text accessibilityRole="alert" style={[typography.body, { color: theme.colors.danger }]}>
          {prefsError}
        </Text>
        <Text
          accessibilityRole="button"
          onPress={onClose}
          style={[typography.label, { color: theme.colors.brand }]}
        >
          Back to text chat
        </Text>
      </View>
    );
  }

  if (!consented) {
    return (
      <View style={styles.consent}>
        <Text style={[typography.title, { color: theme.colors.text }]}>
          Talk to {assistantName}?
        </Text>
        <Text style={[typography.body, { color: theme.colors.textMuted }]}>
          Your recording is sent to Cloudflare Workers AI for transcription. After you finish
          speaking, the completed reply text is sent to Fish Audio for speech. Zoption does not
          store recordings or generated audio.
        </Text>
        {notice !== null ? (
          <Text
            accessibilityRole="alert"
            style={[typography.caption, { color: theme.colors.danger }]}
          >
            {notice}
          </Text>
        ) : null}
        <View style={styles.consentActions}>
          <Text
            accessibilityRole="button"
            onPress={onClose}
            style={[typography.label, { color: theme.colors.textMuted }]}
          >
            Not now
          </Text>
          <Text
            accessibilityRole="button"
            accessibilityState={{ disabled: enabling }}
            onPress={() => void enableVoice()}
            style={[typography.label, { color: theme.colors.brand }]}
          >
            {enabling ? "Enabling voice…" : "Accept and continue"}
          </Text>
        </View>
      </View>
    );
  }

  const orbScale =
    status === "idle" ? 1 : status === "listening" ? 1.08 : status === "speaking" ? 1.12 : 1.03;
  const orbOpacity = status === "thinking" ? 0.75 : 1;

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.canvas }]}>
      <View style={[styles.topbar, { borderBottomColor: theme.colors.border }]}>
        <View>
          <Text style={[typography.headline, { color: theme.colors.text }]}>Voice chat</Text>
          <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
            Bright Female · spoken replies
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to text chat"
          onPress={handleClose}
          style={[styles.closeButton, { borderColor: theme.colors.border }]}
        >
          <MaterialCommunityIcons name="arrow-left" size={18} color={theme.colors.text} />
          <Text style={[typography.label, { color: theme.colors.text }]}>Text chat</Text>
        </Pressable>
      </View>

      <FlatList
        ref={listRef}
        data={captions}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.captions}
        accessibilityLabel="Conversation captions"
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        ListEmptyComponent={
          livePartial || status !== "idle" ? null : (
            <Text style={[typography.callout, styles.empty, { color: theme.colors.textMuted }]}>
              Tap the ball and ask about spending, budgets, recurring charges, goals, or debt.
            </Text>
          )
        }
        renderItem={({ item }) => (
          <View
            style={[
              styles.caption,
              item.role === "user" ? styles.captionUser : styles.captionAssistant,
              item.role === "user"
                ? { backgroundColor: theme.colors.brand }
                : {
                    backgroundColor: theme.colors.surface,
                    borderColor: theme.colors.border,
                  },
            ]}
          >
            <Text
              style={[
                typography.caption,
                styles.captionSpeaker,
                { color: item.role === "user" ? theme.colors.onBrand : theme.colors.textMuted },
              ]}
            >
              {item.role === "user" ? "You" : assistantName}
            </Text>
            <Text
              style={[
                typography.body,
                { color: item.role === "user" ? theme.colors.onBrand : theme.colors.text },
              ]}
            >
              {item.text}
            </Text>
          </View>
        )}
        ListFooterComponent={null}
      />

      {(livePartial !== "" || notice !== null || audioError !== null) && (
        <View style={[styles.statusBlock, { borderTopColor: theme.colors.border }]}>
          {livePartial !== "" ? (
            <View
              style={[styles.caption, styles.captionUser, { backgroundColor: theme.colors.brand }]}
            >
              <Text
                style={[typography.caption, styles.captionSpeaker, { color: theme.colors.onBrand }]}
              >
                You
              </Text>
              <Text style={[typography.body, { color: theme.colors.onBrand }]}>
                “{livePartial}”
              </Text>
            </View>
          ) : null}
          {notice !== null ? (
            <Text
              accessibilityRole="alert"
              style={[typography.caption, { color: theme.colors.danger }]}
            >
              {notice}
            </Text>
          ) : null}
          {audioError !== null ? (
            <Text
              accessibilityRole="alert"
              style={[typography.caption, { color: theme.colors.danger }]}
            >
              {audioError}
            </Text>
          ) : null}
        </View>
      )}

      <View style={[styles.stage, { borderTopColor: theme.colors.border }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={status === "listening" ? "Stop listening" : "Start talking"}
          accessibilityHint={status === "idle" ? "Starts the microphone" : undefined}
          onPress={handleOrbPress}
          style={[
            styles.orb,
            {
              backgroundColor: theme.colors.brand,
              borderColor: theme.colors.brand,
              opacity: orbOpacity,
              transform: [{ scale: orbScale }],
            },
          ]}
        >
          <MaterialCommunityIcons
            name={status === "listening" ? "microphone" : "microphone-outline"}
            size={44}
            color={theme.colors.onBrand}
          />
        </Pressable>
        <Text style={[typography.label, { color: theme.colors.text }]}>{STATUS_LABEL[status]}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    padding: spacing.lg,
  },
  consent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    padding: spacing.lg,
  },
  consentActions: {
    flexDirection: "row",
    gap: spacing.lg,
    marginTop: spacing.sm,
  },
  topbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  closeButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    minHeight: 36,
    paddingHorizontal: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.md,
  },
  captions: {
    flexGrow: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  empty: {
    textAlign: "center",
    marginTop: spacing.xxl,
  },
  caption: {
    borderRadius: radii.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    gap: 2,
  },
  captionUser: {
    alignSelf: "flex-end",
    maxWidth: "85%",
  },
  captionAssistant: {
    alignSelf: "flex-start",
    maxWidth: "90%",
    borderWidth: StyleSheet.hairlineWidth,
  },
  captionSpeaker: {
    textTransform: "uppercase",
    fontSize: 11,
    opacity: 0.8,
  },
  statusBlock: {
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  stage: {
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    paddingBottom: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  orb: {
    width: 112,
    height: 112,
    borderRadius: 56,
    borderWidth: 3,
    alignItems: "center",
    justifyContent: "center",
  },
});
