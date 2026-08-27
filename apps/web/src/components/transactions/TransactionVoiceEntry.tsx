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

export interface TransactionVoiceEntryProps {
  workspace: AuthenticatedWorkspace;
  disabled?: boolean;
  onDraft: (draft: TransactionVoiceDraft) => void;
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
}: TransactionVoiceEntryProps) {
  const queryClient = useQueryClient();
  const recorderRef = useRef<MediaRecorder | undefined>(undefined);
  const streamRef = useRef<MediaStream | undefined>(undefined);
  const chunksRef = useRef<Blob[]>([]);
  const stopTimerRef = useRef<number | undefined>(undefined);
  const elapsedTimerRef = useRef<number | undefined>(undefined);
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
    window.clearInterval(elapsedTimerRef.current);
    if (liveSessionRef.current) {
      liveSessionRef.current.stop();
      liveSessionRef.current = null;
    }
    stopTimerRef.current = undefined;
    elapsedTimerRef.current = undefined;
    setElapsedSeconds(0);
  }

  useEffect(
    () => () => {
      mountedRef.current = false;
      clearRecordingResources();
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
    },
    [],
  );

  async function transcribe(blob: Blob) {
    setStatus("transcribing");
    try {
      const draft = await extractVoiceTransaction(workspace, blob);
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

  async function startRecording(providedStream?: MediaStream) {
    let stream = providedStream;
    try {
      setMessage(undefined);
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
        clearRecordingResources();
        activeStream.getTracks().forEach((track) => track.stop());
        streamRef.current = undefined;
        recorderRef.current = undefined;
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        if (blob.size) void transcribe(blob);
        else {
          setStatus("idle");
          setMessage("No audio was captured. Try again.");
        }
      });
      recorder.start(250);
      setStatus("recording");
      setElapsedSeconds(0);
      setLiveTranscript("");

      void startLiveTranscriptionSession(workspace, activeStream, {
        onPartial: (partial) => {
          if (!mountedRef.current) return;
          setLiveTranscript(partial);
        },
        onFinal: (final) => {
          if (!mountedRef.current) return;
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
        if (recorderRef.current?.state === "recording") recorderRef.current.stop();
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

  function stopRecording() {
    clearRecordingResources();
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
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
      <button
        type="button"
        className={["button", recording ? "danger" : "primary"].join(" ")}
        disabled={disabled || checking}
        onClick={action}
      >
        {recording ? <Square size={16} /> : <Mic size={16} />} {label}
      </button>
      {(liveTranscript || message) && (
        <small className="transaction-voice-message" role="alert">
          {recording && liveTranscript ? `“${liveTranscript}”` : message}
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
