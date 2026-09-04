import { File, Paths } from "expo-file-system";
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
} from "expo-audio";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AssistantVoiceTranscription } from "@zoption/shared";

import {
  ApiTransportError,
  previewAssistantSpeech,
  synthesizeAssistantSpeech,
  transcribeVoice,
  type AssistantSpeechVoice,
} from "@/api/assistant-voice";
import {
  startMobileVoiceStream,
  type MobileVoiceStreamSession,
} from "@/api/voice-stream";
import { discardTemporarySourceFile } from "@/files/temporary-source-file";

import {
  MAX_RECORDING_SECONDS,
  armAssistantRecorder,
  playbackAudioMode,
} from "./assistant-voice-session";

export type RecordingPhase = "idle" | "requesting" | "recording" | "transcribing";

async function restorePlaybackAudioMode(): Promise<void> {
  try {
    await setAudioModeAsync(playbackAudioMode);
  } catch {
    // Restoring the session must never hide a recording or transcription error.
  }
}

/**
 * Records voice through expo-audio and transcribes it through the Worker
 * (Cloudflare Whisper). The recording never touches device storage beyond the
 * temporary recorder file, and it is sent exactly once, to the Worker only.
 *
 * expo-audio requires an explicit prepare + recording audio session before
 * record(); calling record on an unprepared recorder is a no-op on Android
 * and throws on iOS, which is why the composer microphone appeared dead.
 */
export interface VoiceRecording {
  uri: string;
  fileName: string;
}

/**
 * Owns native microphone lifecycle for review-first voice features. Callers
 * decide where the temporary recording is sent and what draft it returns.
 */
export function useVoiceRecorder<Result>({
  getAccessToken,
  onTranscribed,
  onError,
  transcribe,
  onPartialTranscript,
  liveTranscribeResult,
}: {
  getAccessToken: (refresh: boolean) => Promise<string>;
  onTranscribed: (result: Result) => void;
  onError: (error: ApiTransportError) => void;
  transcribe: (accessToken: string, recording: VoiceRecording) => Promise<Result>;
  onPartialTranscript?: (partial: string) => void;
  liveTranscribeResult?: (transcript: string, elapsedSeconds: number) => Result | null;
}) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [phase, setPhase] = useState<RecordingPhase>("idle");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const phaseRef = useRef<RecordingPhase>("idle");
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const liveStreamRef = useRef<MobileVoiceStreamSession | null>(null);
  const currentPhase = (): RecordingPhase => phaseRef.current;

  const setPhaseBoth = useCallback((next: RecordingPhase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const clearElapsedTimer = useCallback(() => {
    if (elapsedTimerRef.current !== null) {
      clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }
  }, []);

  const stopElapsedTimer = useCallback(() => {
    clearElapsedTimer();
    setElapsedSeconds(0);
  }, [clearElapsedTimer]);

  const clearRecordingTimeout = useCallback(() => {
    if (recordingTimeoutRef.current !== null) {
      clearTimeout(recordingTimeoutRef.current);
      recordingTimeoutRef.current = null;
    }
  }, []);

  const startElapsedTimer = useCallback(() => {
    stopElapsedTimer();
    elapsedTimerRef.current = setInterval(() => {
      setElapsedSeconds((seconds) => seconds + 1);
    }, 1000);
  }, [stopElapsedTimer]);

  useEffect(
    () => () => {
      clearElapsedTimer();
      clearRecordingTimeout();
      if (liveStreamRef.current) {
        liveStreamRef.current.cancel();
        liveStreamRef.current = null;
      }
      if (phaseRef.current === "recording") {
        const uri = recorder.uri;
        void recorder
          .stop()
          .catch(() => {
            // Leaving the screen must not surface a recorder cleanup error.
          })
          .finally(() => {
            discardTemporarySourceFile(recorder.uri ?? uri);
            void restorePlaybackAudioMode();
          });
      }
    },
    [clearElapsedTimer, clearRecordingTimeout, recorder],
  );

  const stopAndTranscribe = useCallback(async () => {
    if (currentPhase() !== "recording") return;
    const recordedElapsed = elapsedSeconds;
    stopElapsedTimer();
    clearRecordingTimeout();
    setPhaseBoth("transcribing");

    let streamTranscript: string | null = null;
    if (liveStreamRef.current) {
      try {
        streamTranscript = await liveStreamRef.current.stop();
      } catch {}
      liveStreamRef.current = null;
    }

    let recordingUri = recorder.uri;
    let uploadStarted = false;
    try {
      await recorder.stop();
      const uri = recorder.uri ?? recordingUri;
      recordingUri = uri;

      if (liveTranscribeResult && streamTranscript && streamTranscript.trim().length > 0) {
        const liveResult = liveTranscribeResult(streamTranscript.trim(), recordedElapsed);
        if (liveResult !== null) {
          discardTemporarySourceFile(uri);
          await restorePlaybackAudioMode();
          setPhaseBoth("idle");
          if (currentPhase() !== "transcribing") return;
          onTranscribed(liveResult);
          return;
        }
      }

      if (!uri) {
        onError(new ApiTransportError("Nothing was recorded. Try again.", "invalid_request", 0));
        setPhaseBoth("idle");
        return;
      }
      const accessToken = await getAccessToken(false);
      // The multipart transport removes the file after native fetch settles.
      uploadStarted = true;
      const transcription = await transcribe(accessToken, { uri, fileName: "voice-input.m4a" });
      if (currentPhase() !== "transcribing") return;
      onTranscribed(transcription);
    } catch (error) {
      if (currentPhase() !== "transcribing") return;
      onError(
        error instanceof ApiTransportError
          ? error
          : new ApiTransportError("Voice input failed. Try again.", "network", 0),
      );
    } finally {
      if (!uploadStarted) discardTemporarySourceFile(recordingUri ?? recorder.uri);
      await restorePlaybackAudioMode();
      setPhaseBoth("idle");
    }
  }, [
    recorder,
    getAccessToken,
    onError,
    onTranscribed,
    transcribe,
    liveTranscribeResult,
    elapsedSeconds,
    setPhaseBoth,
    stopElapsedTimer,
    clearRecordingTimeout,
  ]);

  const startRecording = useCallback(async () => {
    if (currentPhase() !== "idle") return;
    setPhaseBoth("requesting");
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) {
        stopElapsedTimer();
        clearRecordingTimeout();
        onError(
          new ApiTransportError(
            "Microphone access is off. Enable it in system settings to use voice input.",
            "invalid_request",
            0,
          ),
        );
        setPhaseBoth("idle");
        return;
      }
      await armAssistantRecorder(recorder, setAudioModeAsync);
      setPhaseBoth("recording");
      startElapsedTimer();

      if (onPartialTranscript || liveTranscribeResult) {
        void getAccessToken(false)
          .then((token) => {
            if (phaseRef.current !== "recording") return;
            void startMobileVoiceStream(token, {
              onPartial: (partial) => {
                if (phaseRef.current === "recording") {
                  onPartialTranscript?.(partial);
                }
              },
              onFinal: (final) => {
                if (phaseRef.current === "recording") {
                  onPartialTranscript?.(final);
                }
              },
              onLatency: (metrics) => {
                if (typeof console !== "undefined" && console.debug) {
                  console.debug("[voice] mobile live latency", metrics);
                }
              },
              onError: () => {
                // Live WebSocket failed — batch file upload fallback will still run on stop
              },
            })
              .then((session) => {
                if (phaseRef.current !== "recording") {
                  session.cancel();
                } else {
                  // No-op session (native AudioStream unavailable) yields null on stop, so batch fallback runs
                  liveStreamRef.current = session;
                }
              })
              .catch(() => {});
          })
          .catch(() => {});
      }

      // A hard stop when the user keeps recording past the cap.
      clearRecordingTimeout();
      recordingTimeoutRef.current = setTimeout(() => {
        recordingTimeoutRef.current = null;
        if (currentPhase() === "recording") {
          void stopAndTranscribe();
        }
      }, MAX_RECORDING_SECONDS * 1000);
    } catch {
      stopElapsedTimer();
      clearRecordingTimeout();
      await restorePlaybackAudioMode();
      onError(new ApiTransportError("Voice input could not start.", "network", 0));
      setPhaseBoth("idle");
    }
  }, [
    onError,
    recorder,
    getAccessToken,
    onPartialTranscript,
    liveTranscribeResult,
    setPhaseBoth,
    startElapsedTimer,
    stopAndTranscribe,
    stopElapsedTimer,
    clearRecordingTimeout,
  ]);

  const cancelRecording = useCallback(async () => {
    if (liveStreamRef.current) {
      liveStreamRef.current.cancel();
      liveStreamRef.current = null;
    }
    const recordingUri = recorder.uri;
    if (currentPhase() === "recording") {
      try {
        await recorder.stop();
      } catch {
        // Cancellation must never crash the screen.
      }
    }
    discardTemporarySourceFile(recorder.uri ?? recordingUri);
    stopElapsedTimer();
    clearRecordingTimeout();
    await restorePlaybackAudioMode();
    setPhaseBoth("idle");
  }, [recorder, setPhaseBoth, stopElapsedTimer, clearRecordingTimeout]);

  return {
    phase,
    elapsedSeconds,
    startRecording,
    stopAndTranscribe,
    cancelRecording,
  };
}

/** Keeps the Assistant's existing transcript-only behavior on the shared recorder lifecycle. */
export function useAssistantRecorder({
  getAccessToken,
  onTranscribed,
  onError,
  onPartialTranscript,
}: {
  getAccessToken: (refresh: boolean) => Promise<string>;
  onTranscribed: (text: string) => void;
  onError: (error: ApiTransportError) => void;
  onPartialTranscript?: (text: string) => void;
}) {
  return useVoiceRecorder<AssistantVoiceTranscription>({
    getAccessToken,
    onTranscribed: (result) => onTranscribed(result.text),
    onError,
    onPartialTranscript,
    liveTranscribeResult: (text, elapsed) => ({ text, durationSeconds: elapsed }),
    transcribe: (accessToken, recording) =>
      transcribeVoice({ accessToken }, { ...recording, mimeType: "audio/mp4" }),
  });
}

export interface SpokenReplyController {
  playingMessageId: string | null;
  listen: (messageId: string, voice: AssistantSpeechVoice) => Promise<void>;
}

export interface VoicePreviewController {
  previewingVoice: AssistantSpeechVoice | null;
  previewError: string | null;
  preview: (voice: AssistantSpeechVoice) => Promise<void>;
  clearPreview: () => void;
}

/**
 * Fetches a synthesized spoken reply from the Worker (Fish Audio) and plays it
 * through expo-audio. Generated audio is cached as a temporary file and is
 * never persisted with financial data.
 */
export function useSpokenReplies({
  getAccessToken,
  onError,
  onEnded,
}: {
  getAccessToken: (refresh: boolean) => Promise<string>;
  onError: (error: ApiTransportError) => void;
  onEnded?: () => void;
}): SpokenReplyController {
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);
  const playingRef = useRef<string | null>(null);
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;

  useEffect(() => {
    if (status.didJustFinish && playingRef.current !== null) {
      playingRef.current = null;
      setPlayingMessageId(null);
      onEndedRef.current?.();
    }
  }, [status.didJustFinish]);

  const listen = useCallback(
    async (messageId: string, voice: AssistantSpeechVoice) => {
      if (playingRef.current === messageId) {
        player.pause();
        playingRef.current = null;
        setPlayingMessageId(null);
        return;
      }
      try {
        await setAudioModeAsync(playbackAudioMode);
        const accessToken = await getAccessToken(false);
        const { bytes } = await synthesizeAssistantSpeech({ accessToken }, messageId, voice);
        const file = new File(Paths.cache, "assistant-speech.mp3");
        file.write(bytes);
        player.replace({ uri: file.uri });
        player.play();
        playingRef.current = messageId;
        setPlayingMessageId(messageId);
      } catch (error) {
        onError(
          error instanceof ApiTransportError
            ? error
            : new ApiTransportError("The spoken reply failed. Try again.", "network", 0),
        );
      }
    },
    [getAccessToken, onError, player],
  );

  return { playingMessageId, listen };
}

/**
 * Plays the curated, non-financial sample returned by the voice preview
 * endpoint. Samples remain temporary cache files and never join local records.
 */
export function useAssistantVoicePreview({
  getAccessToken,
}: {
  getAccessToken: (refresh: boolean) => Promise<string>;
}): VoicePreviewController {
  const player = useAudioPlayer(null);
  const [previewingVoice, setPreviewingVoice] = useState<AssistantSpeechVoice | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const clearPreview = useCallback(() => {
    player.pause();
    setPreviewingVoice(null);
    setPreviewError(null);
  }, [player]);

  const preview = useCallback(
    async (voice: AssistantSpeechVoice) => {
      if (previewingVoice !== null) return;
      setPreviewingVoice(voice);
      setPreviewError(null);
      try {
        await setAudioModeAsync(playbackAudioMode);
        const accessToken = await getAccessToken(false);
        const { bytes } = await previewAssistantSpeech({ accessToken }, voice);
        const file = new File(Paths.cache, "assistant-voice-preview.mp3");
        file.write(bytes);
        player.replace({ uri: file.uri });
        player.play();
      } catch (error) {
        setPreviewError(
          error instanceof ApiTransportError
            ? error.message
            : "The voice preview failed. Try again.",
        );
      } finally {
        setPreviewingVoice(null);
      }
    },
    [getAccessToken, player, previewingVoice],
  );

  return { previewingVoice, previewError, preview, clearPreview };
}
