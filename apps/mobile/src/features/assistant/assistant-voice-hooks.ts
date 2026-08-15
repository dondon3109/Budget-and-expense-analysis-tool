import { File, Paths } from "expo-file-system";
import {
  AudioModule,
  RecordingPresets,
  useAudioPlayer,
  useAudioRecorder,
} from "expo-audio";
import { useCallback, useRef, useState } from "react";

import {
  ApiTransportError,
  synthesizeAssistantSpeech,
  transcribeVoice,
  type AssistantSpeechVoice,
} from "@/api/assistant-voice";

const MAX_RECORDING_SECONDS = 60;

export type RecordingPhase = "idle" | "requesting" | "recording" | "transcribing";

/**
 * Records voice through expo-audio and transcribes it through the Worker
 * (Cloudflare Whisper). The recording never touches device storage beyond the
 * temporary recorder file, and it is sent exactly once, to the Worker only.
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
  const phaseRef = useRef<RecordingPhase>("idle");
  const currentPhase = (): RecordingPhase => phaseRef.current;

  const setPhaseBoth = useCallback((next: RecordingPhase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const stopAndTranscribe = useCallback(async () => {
    if (currentPhase() !== "recording") return;
    setPhaseBoth("transcribing");
    try {
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri) {
        onError(
          new ApiTransportError("Nothing was recorded. Try again.", "invalid_request", 0),
        );
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
      setPhaseBoth("idle");
    }
  }, [recorder, getAccessToken, onError, onTranscribed, setPhaseBoth]);

  const startRecording = useCallback(async () => {
    if (currentPhase() !== "idle") return;
    setPhaseBoth("requesting");
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) {
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
      setPhaseBoth("recording");
      recorder.record({
        forDuration: MAX_RECORDING_SECONDS,
      });
      // A hard stop when the user keeps recording past the cap.
      setTimeout(() => {
        if (currentPhase() === "recording") {
          void stopAndTranscribe();
        }
      }, MAX_RECORDING_SECONDS * 1000);
    } catch {
      onError(new ApiTransportError("Voice input could not start.", "network", 0));
      setPhaseBoth("idle");
    }
  }, [onError, recorder, setPhaseBoth, stopAndTranscribe]);

  const cancelRecording = useCallback(async () => {
    if (currentPhase() === "recording") {
      try {
        await recorder.stop();
      } catch {
        // Cancellation must never crash the screen.
      }
    }
    setPhaseBoth("idle");
  }, [recorder, setPhaseBoth]);

  return {
    phase,
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
