import { File, Paths } from "expo-file-system";
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioRecorder,
} from "expo-audio";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  ApiTransportError,
  synthesizeAssistantSpeech,
  transcribeVoice,
  type AssistantSpeechVoice,
} from "@/api/assistant-voice";

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
export function useAssistantRecorder({
  getAccessToken,
  onTranscribed,
  onError,
}: {
  getAccessToken: (refresh: boolean) => Promise<string>;
  onTranscribed: (text: string) => void;
  onError: (error: ApiTransportError) => void;
}) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [phase, setPhase] = useState<RecordingPhase>("idle");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const phaseRef = useRef<RecordingPhase>("idle");
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
    },
    [clearElapsedTimer, clearRecordingTimeout],
  );

  const stopAndTranscribe = useCallback(async () => {
    if (currentPhase() !== "recording") return;
    stopElapsedTimer();
    clearRecordingTimeout();
    setPhaseBoth("transcribing");
    try {
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri) {
        onError(new ApiTransportError("Nothing was recorded. Try again.", "invalid_request", 0));
        setPhaseBoth("idle");
        return;
      }
      const accessToken = await getAccessToken(false);
      const transcription = await transcribeVoice(
        { accessToken },
        { uri, mimeType: "audio/mp4", fileName: "voice-input.m4a" },
      );
      if (currentPhase() !== "transcribing") return;
      onTranscribed(transcription.text);
    } catch (error) {
      if (currentPhase() !== "transcribing") return;
      onError(
        error instanceof ApiTransportError
          ? error
          : new ApiTransportError("Voice input failed. Try again.", "network", 0),
      );
    } finally {
      await restorePlaybackAudioMode();
      setPhaseBoth("idle");
    }
  }, [
    recorder,
    getAccessToken,
    onError,
    onTranscribed,
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
    setPhaseBoth,
    startElapsedTimer,
    stopAndTranscribe,
    stopElapsedTimer,
    clearRecordingTimeout,
  ]);

  const cancelRecording = useCallback(async () => {
    if (currentPhase() === "recording") {
      try {
        await recorder.stop();
      } catch {
        // Cancellation must never crash the screen.
      }
    }
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

export interface SpokenReplyController {
  playingMessageId: string | null;
  listen: (messageId: string, voice: AssistantSpeechVoice) => Promise<void>;
}

/**
 * Fetches a synthesized spoken reply from the Worker (Fish Audio) and plays it
 * through expo-audio. Generated audio is cached as a temporary file and is
 * never persisted with financial data.
 */
export function useSpokenReplies({
  getAccessToken,
  onError,
}: {
  getAccessToken: (refresh: boolean) => Promise<string>;
  onError: (error: ApiTransportError) => void;
}): SpokenReplyController {
  const player = useAudioPlayer(null);
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);
  const playingRef = useRef<string | null>(null);

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
