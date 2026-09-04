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
import { renderMobileVoiceCaption } from "./render-voice-caption";

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
  // Typewriter caption: while the reply is spoken, letters appear paced to
  // the audio instead of the full text popping in before the voice starts.
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [typedCount, setTypedCount] = useState(0);

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
      setSpeakingId(null);
      setVoiceStatus("idle");
    },
    [setVoiceStatus],
  );

  const spoken = useSpokenReplies({
    getAccessToken,
    onError: handleSpeechError,
    onEnded: () => {
      if (!mountedRef.current) return;
      setSpeakingId(null);
      setVoiceStatus("idle");
    },
  });
  const spokenRef = useRef(spoken);
  spokenRef.current = spoken;

  const typingFull =
    speakingId !== null
      ? (captions.find((item) => item.id === speakingId && item.role === "assistant")?.text ?? "")
      : "";

  // Advances the typewriter while the reply is spoken: held at the caret
  // until audio is actually audible, then paced to the playback position
  // (fixed fallback speed when the duration is unknown). Leaving `speaking`
  // snaps to the full text via the render below.
  const fallbackStartRef = useRef<number | null>(null);
  useEffect(() => {
    if (status !== "speaking" || typingFull === "") return;
    const timer = setInterval(() => {
      const progress = spokenRef.current.speechProgress;
      // Known-but-not-playing means still loading: hold so text never outruns voice.
      if (progress && !progress.playing) return;
      let count: number;
      if (progress && progress.duration > 0) {
        count = Math.min(
          typingFull.length,
          Math.floor((progress.currentTime / progress.duration) * typingFull.length) + 1,
        );
      } else {
        if (fallbackStartRef.current === null) fallbackStartRef.current = Date.now();
        count = Math.min(
          typingFull.length,
          Math.floor((Date.now() - fallbackStartRef.current) / 60) + 1,
        );
      }
      setTypedCount((previous) => (count > previous ? count : previous));
      if (count >= typingFull.length) clearInterval(timer);
    }, 50);
    return () => clearInterval(timer);
  }, [status, speakingId, typingFull]);

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
        const turn = await withToken(async (token) => {
          if (threadId) {
            try {
              return await sendAssistantTurn({ accessToken: token }, threadId, input);
            } catch (turnError) {
              if (turnError instanceof ApiTransportError && turnError.status === 404) {
                threadIdRef.current = null;
                return await createAssistantThreadTurn({ accessToken: token }, input);
              }
              throw turnError;
            }
          }
          return await createAssistantThreadTurn({ accessToken: token }, input);
        });
        if (!mountedRef.current) return;
        threadIdRef.current = turn.thread.id;
        onTurnComplete(turn.thread);

        if (!speechAvailable) {
          setCaptions((current) => [
            ...current,
            { id: turn.assistantMessage.id, role: "assistant", text: turn.assistantMessage.content },
          ]);
          setNotice("Spoken replies are unavailable in this environment. Showing text only.");
          setVoiceStatus("idle");
          return;
        }

        // Enter speaking state with typedCount=0 BEFORE adding caption
        // so the assistant message renders directly into typewriter mode (at ▍)
        // rather than flashing the full text before speech begins.
        setSpeakingId(turn.assistantMessage.id);
        setTypedCount(0);
        fallbackStartRef.current = null;
        setVoiceStatus("speaking");
        setCaptions((current) => [
          ...current,
          { id: turn.assistantMessage.id, role: "assistant", text: turn.assistantMessage.content },
        ]);
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
            {item.role === "user" ? (
              <Text style={[typography.body, { color: theme.colors.onBrand }]}>
                {item.text}
              </Text>
            ) : (
              <Text style={[typography.body, { color: theme.colors.text }]}>
                {item.id === speakingId && status === "speaking" && typedCount < typingFull.length
                  ? renderMobileVoiceCaption(
                      `${typingFull.slice(0, typedCount)}▍`,
                      [typography.body, { color: theme.colors.text }],
                      styles.boldCaption,
                    )
                  : renderMobileVoiceCaption(
                      item.text,
                      [typography.body, { color: theme.colors.text }],
                      styles.boldCaption,
                    )}
              </Text>
            )}
          </View>
        )}
        ListFooterComponent={null}
      />

      {(livePartial !== "" ||
        notice !== null ||
        audioError !== null ||
        (status === "listening" && recorder.liveStatus === "unavailable")) && (
        <View style={[styles.statusBlock, { borderTopColor: theme.colors.border }]}>
          {status === "listening" && recorder.liveStatus === "unavailable" && livePartial === "" ? (
            <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
              Live preview is off here — your words appear when you stop.
            </Text>
          ) : null}
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
  boldCaption: {
    fontWeight: "700",
  },
});
