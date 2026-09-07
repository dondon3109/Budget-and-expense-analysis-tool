import { CURRENT_RECEIPT_CONSENT_VERSION, type TransactionVoiceDraft } from "@zoption/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LoaderCircle, Mic, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { extractVoiceTransaction, getReceiptPreferences, grantReceiptConsent } from "../../lib/api";
import { queryKeys } from "../../lib/queryKeys";
import {
  startLiveTranscriptionSession,
  type LiveTranscriptionSession,
} from "../../lib/voiceStream";
import type { AuthenticatedWorkspace } from "../../lib/workspace";

const MAX_RECORDING_MS = 60_000;
const MIME_TYPES = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus", "audio/webm"];
const SPEECH_RMS_THRESHOLD = 0.015;
const ENDING_SILENCE_MS = 1400;
const NO_SPEECH_TIMEOUT_MS = 8000;
const VOICE_SAMPLE_INTERVAL_MS = 100;

export interface TransactionVoiceEntryProps {
  workspace: AuthenticatedWorkspace;
  disabled?: boolean;
  onDraft: (draft: TransactionVoiceDraft) => void;
  categories?: string[];
}

type RecorderStatus = "idle" | "requesting" | "recording" | "transcribing";

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function formatElapsed(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function TransactionVoiceEntry({
  workspace,
  disabled,
  onDraft,
  categories,
}: TransactionVoiceEntryProps) {
  const queryClient = useQueryClient();
  const recorderRef = useRef<MediaRecorder | undefined>(undefined);
  const streamRef = useRef<MediaStream | undefined>(undefined);
  const chunksRef = useRef<Blob[]>([]);
  const stopTimerRef = useRef<number | undefined>(undefined);
  const elapsedTimerRef = useRef<number | undefined>(undefined);
  const activityTimerRef = useRef<number | undefined>(undefined);
  const audioContextRef = useRef<AudioContext | undefined>(undefined);
  const stopReasonRef = useRef<"user" | "silence" | "no-speech" | "cancelled">("user");
  const liveTranscriptRef = useRef<string>("");
  const mountedRef = useRef(true);
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [liveTranscript, setLiveTranscript] = useState<string>("");
  const [message, setMessage] = useState<string>();
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [showConsent, setShowConsent] = useState(false);
  const liveSessionRef = useRef<LiveTranscriptionSession | null>(null);

  const preferencesQuery = useQuery({
    queryKey: queryKeys.receiptPreferences(workspace),
    queryFn: () => getReceiptPreferences(workspace),
    retry: false,
  });
  const consentMutation = useMutation({
    mutationFn: () => grantReceiptConsent(workspace),
    onSuccess: (preferences) => {
      queryClient.setQueryData(queryKeys.receiptPreferences(workspace), preferences);
    },
  });

  function clearRecordingResources() {
    window.clearTimeout(stopTimerRef.current);
    window.clearInterval(activityTimerRef.current);
    activityTimerRef.current = undefined;
    window.clearInterval(elapsedTimerRef.current);
    elapsedTimerRef.current = undefined;
    if (liveSessionRef.current) {
      void Promise.resolve(liveSessionRef.current.stop()).catch(() => {});
      liveSessionRef.current = null;
    }
    const audioContext = audioContextRef.current;
    audioContextRef.current = undefined;
    if (audioContext && audioContext.state !== "closed") void audioContext.close().catch(() => {});
    stopTimerRef.current = undefined;
    setElapsedSeconds(0);
  }

  useEffect(
    () => () => {
      mountedRef.current = false;
      clearRecordingResources();
      stopReasonRef.current = "cancelled";
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
    },
    [],
  );

  async function transcribe(blob: Blob) {
    setStatus("transcribing");
    try {
      const draft = await (categories && categories.length > 0
        ? extractVoiceTransaction(workspace, blob, categories)
        : extractVoiceTransaction(workspace, blob));
      if (!mountedRef.current) return;
      onDraft(draft);
      setMessage(`Draft filled from: “${draft.transcript}”`);
    } catch (error) {
      if (mountedRef.current) setMessage(errorMessage(error, "AI voice entry failed. Try again."));
    } finally {
      if (mountedRef.current) setStatus("idle");
    }
  }

  function requestMicrophone(): Promise<MediaStream> {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      throw new Error("Voice recording is not supported in this browser.");
    }
    return navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
  }

  function monitorAudioActivity(stream: MediaStream) {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    let audioContext: AudioContext;
    try {
      audioContext = new AudioContextClass();
    } catch {
      return;
    }
    audioContextRef.current = audioContext;
    let source: MediaStreamAudioSourceNode;
    let analyser: AnalyserNode;
    try {
      source = audioContext.createMediaStreamSource(stream);
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
    } catch {
      return;
    }

    const samples = new Uint8Array(analyser.frequencyBinCount);
    let heardSpeech = false;
    const startedAt = Date.now();
    let lastSpeechAt = startedAt;

    activityTimerRef.current = window.setInterval(() => {
      const recorder = recorderRef.current;
      if (!recorder || recorder.state !== "recording") return;

      analyser.getByteTimeDomainData(samples);
      let sumSquares = 0;
      for (const sample of samples) {
        const normalized = (sample - 128) / 128;
        sumSquares += normalized * normalized;
      }
      const rms = Math.sqrt(sumSquares / samples.length);
      const now = Date.now();
      if (rms >= SPEECH_RMS_THRESHOLD) {
        heardSpeech = true;
        lastSpeechAt = now;
        return;
      }
      if (heardSpeech && now - lastSpeechAt >= ENDING_SILENCE_MS) {
        stopRecording("silence");
      } else if (!heardSpeech && now - startedAt >= NO_SPEECH_TIMEOUT_MS) {
        stopRecording("no-speech");
      }
    }, VOICE_SAMPLE_INTERVAL_MS);
  }

  async function startRecording(providedStream?: MediaStream) {
    let stream = providedStream;
    try {
      setMessage(undefined);
      stopReasonRef.current = "user";
      setStatus("requesting");
      stream ??= await requestMicrophone();
      if (!mountedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const activeStream = stream;
      streamRef.current = activeStream;
      const mimeType = MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(activeStream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      });
      recorder.addEventListener("stop", () => {
        void (async () => {
          const liveSession = liveSessionRef.current;
          liveSessionRef.current = null;

          window.clearTimeout(stopTimerRef.current);
          window.clearInterval(activityTimerRef.current);
          activityTimerRef.current = undefined;
          window.clearInterval(elapsedTimerRef.current);
          elapsedTimerRef.current = undefined;
          const monitoringContext = audioContextRef.current;
          audioContextRef.current = undefined;
          if (monitoringContext && monitoringContext.state !== "closed") {
            void monitoringContext.close().catch(() => {});
          }

          if (liveSession) {
            try {
              await liveSession.stop();
            } catch {
              // Ignore live stream stop failures during teardown.
            }
          }

          activeStream.getTracks().forEach((track) => track.stop());
          streamRef.current = undefined;
          recorderRef.current = undefined;

          if (stopReasonRef.current === "cancelled") {
            setStatus("idle");
            setLiveTranscript("");
            liveTranscriptRef.current = "";
            return;
          }
          if (stopReasonRef.current === "no-speech") {
            setStatus("idle");
            setMessage("I didn’t hear anything. Speak a transaction and try again.");
            setLiveTranscript("");
            liveTranscriptRef.current = "";
            return;
          }

          const liveText = liveTranscriptRef.current.trim();
          if (liveText) {
            setStatus("transcribing");
            try {
              const draft = await (categories && categories.length > 0
                ? extractVoiceTransaction(workspace, { transcript: liveText }, categories)
                : extractVoiceTransaction(workspace, { transcript: liveText }));
              if (!mountedRef.current) return;
              onDraft(draft);
              setMessage(`Draft filled from: “${draft.transcript}”`);
              setStatus("idle");
              return;
            } catch {
              // Fall back to audio blob upload if live transcript extraction fails
            }
          }

          const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
          if (blob.size) {
            void transcribe(blob);
          } else {
            setStatus("idle");
            setMessage("No audio was captured. Try again.");
          }
        })();
      });
      recorder.start(250);
      setStatus("recording");
      setElapsedSeconds(0);
      setLiveTranscript("");
      liveTranscriptRef.current = "";

      monitorAudioActivity(activeStream);

      void startLiveTranscriptionSession(workspace, activeStream, {
        onPartial: (partial) => {
          if (!mountedRef.current) return;
          liveTranscriptRef.current = partial;
          setLiveTranscript(partial);
        },
        onFinal: (final) => {
          if (!mountedRef.current) return;
          liveTranscriptRef.current = final;
          setLiveTranscript(final);
        },
        onError: () => {},
      })
        .then((session) => {
          liveSessionRef.current = session;
        })
        .catch(() => {});

      elapsedTimerRef.current = window.setInterval(() => {
        setElapsedSeconds((seconds) => seconds + 1);
      }, 1000);
      stopTimerRef.current = window.setTimeout(() => {
        if (recorderRef.current?.state === "recording") stopRecording("user");
      }, MAX_RECORDING_MS);
    } catch (error) {
      clearRecordingResources();
      stream?.getTracks().forEach((track) => track.stop());
      streamRef.current = undefined;
      recorderRef.current = undefined;
      setStatus("idle");
      setMessage(errorMessage(error, "The microphone could not be started. Try again."));
    }
  }

  function stopRecording(reason: "user" | "silence" | "no-speech" = "user") {
    stopReasonRef.current = reason;
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }

  function cancelRecording() {
    stopReasonRef.current = "cancelled";
    clearRecordingResources();
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    setStatus("idle");
    setMessage(undefined);
    setLiveTranscript("");
    liveTranscriptRef.current = "";
  }

  async function acceptConsent() {
    if (consentMutation.isPending) return;
    setMessage(undefined);
    // Request the microphone inside the click so mobile browsers keep activation.
    let stream: MediaStream | undefined;
    try {
      stream = await requestMicrophone();
      await consentMutation.mutateAsync();
      setShowConsent(false);
      await startRecording(stream);
      stream = undefined;
    } catch (error) {
      stream?.getTracks().forEach((track) => track.stop());
      setMessage(errorMessage(error, "AI entry could not be enabled. Try again."));
    }
  }

  const preferences = preferencesQuery.data;
  const consented = Boolean(
    preferences?.enabled &&
    preferences.consentedAt &&
    preferences.consentVersion === CURRENT_RECEIPT_CONSENT_VERSION,
  );
  const recording = status === "recording";
  const busy = status === "requesting" || status === "transcribing";
  const checking = preferencesQuery.isPending || busy || consentMutation.isPending;
  const label = preferencesQuery.isPending
    ? "Checking voice entry…"
    : preferencesQuery.isError
      ? "Retry AI voice entry"
      : !consented
        ? "Enable AI voice entry"
        : recording
          ? "Stop and review"
          : status === "requesting"
            ? "Starting microphone…"
            : status === "transcribing"
              ? "Creating your draft…"
              : "Speak a transaction";

  function action() {
    if (disabled || checking) return;
    setMessage(undefined);
    if (preferencesQuery.isPending) return;
    if (preferencesQuery.isError) {
      void preferencesQuery.refetch();
      return;
    }
    if (!consented) {
      setShowConsent(true);
      return;
    }
    if (status === "recording") stopRecording();
    else if (status === "idle") void startRecording();
  }

  return (
    <section className="transaction-voice" aria-labelledby="transaction-voice-title">
      <div className="transaction-voice-intro">
        <span
          className={["transaction-voice-icon", recording ? "recording" : ""]
            .filter(Boolean)
            .join(" ")}
          aria-hidden="true"
        >
          {busy ? (
            <LoaderCircle className="spinning" size={20} />
          ) : recording ? (
            <Square size={18} />
          ) : (
            <Mic size={20} />
          )}
        </span>
        <div>
          <strong id="transaction-voice-title">Say it, then inspect it</strong>
          <small>
            Try “Spent 250 pesos on lunch today.” Nothing saves until you review this form.
          </small>
        </div>
      </div>
      {recording && (
        <div className="transaction-voice-status" role="status" aria-live="polite">
          <span className="transaction-voice-timer">{formatElapsed(elapsedSeconds)}</span>
          <div>
            <strong>Recording</strong>
            <small>Speak naturally, then stop to review the draft.</small>
          </div>
        </div>
      )}
      {recording ? (
        <div className="transaction-voice-actions">
          <button
            type="button"
            className="button danger"
            disabled={disabled || checking}
            onClick={action}
          >
            <Square size={16} /> Stop and review
          </button>
          <button
            type="button"
            className="button secondary"
            disabled={disabled}
            onClick={cancelRecording}
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="button primary"
          disabled={disabled || checking}
          onClick={action}
        >
          {busy ? <LoaderCircle className="spinning" size={16} /> : <Mic size={16} />} {label}
        </button>
      )}
      {(liveTranscript || message) && (
        <small className="transaction-voice-message" role="alert">
          {status === "transcribing" && liveTranscript
            ? `“${liveTranscript}”`
            : recording && liveTranscript
              ? `“${liveTranscript}”`
              : message}
        </small>
      )}
      {showConsent && (
        <div
          className="transaction-voice-consent"
          role="dialog"
          aria-modal="true"
          aria-label="Enable AI-assisted entry?"
        >
          <strong>Enable AI-assisted entry?</strong>
          <p>
            Zoption sends only the voice recording, receipt photo, or PDF you choose to AI during
            that request to draft editable entries. These source files are not stored. You review
            every result before it is saved.
          </p>
          <div className="transaction-voice-consent-actions">
            <button
              type="button"
              className="button secondary compact"
              disabled={consentMutation.isPending}
              onClick={() => setShowConsent(false)}
            >
              Not now
            </button>
            <button
              type="button"
              className="button primary compact"
              disabled={consentMutation.isPending}
              onClick={() => void acceptConsent()}
            >
              {consentMutation.isPending ? "Enabling…" : "Accept and enable"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
