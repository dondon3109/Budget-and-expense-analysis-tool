import {
  assistantSpeechVoiceSchema,
  assistantVoicePreferencesResponseSchema,
  assistantVoiceTranscriptionResponseSchema,
  type AssistantSpeechVoice,
  type AssistantVoicePreferences,
  type AssistantVoiceTranscription,
} from "@zoption/shared";
import { File } from "expo-file-system";

import { publicConfig } from "@/config/public-config";

import { ApiTransportError, apiRequest, mapApiError } from "./authenticated";

export interface AssistantVoiceApi {
  accessToken: string;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

const voiceFallback = "Voice mode could not be reached. Try again shortly.";

export function getAssistantVoicePreferences(
  api: AssistantVoiceApi,
): Promise<AssistantVoicePreferences> {
  return apiRequest({
    ...api,
    path: "/api/app/assistant/voice/preferences",
    method: "GET",
    fallback: voiceFallback,
    decode: (value) => assistantVoicePreferencesResponseSchema.parse(value),
  });
}

export function grantAssistantVoiceConsent(
  api: AssistantVoiceApi,
): Promise<AssistantVoicePreferences> {
  return apiRequest({
    ...api,
    path: "/api/app/assistant/voice/preferences",
    method: "PATCH",
    body: { consented: true },
    fallback: voiceFallback,
    decode: (value) => assistantVoicePreferencesResponseSchema.parse(value),
  });
}

export const assistantSpeechVoices = ["default", "bright", "energetic"] as const;

export const VOICE_REQUEST_TIMEOUT_MS = 45_000;

/**
 * Runs fetch with a hard timeout so a stalled provider request (for example
 * while the Worker voice providers are being configured) fails with a clear
 * error instead of leaving the recorder spinner running forever.
 *
 * Classification is based on whether the request was aborted (by the timeout or
 * an external signal), not just on error.name being "AbortError". React Native
 * may reject an aborted in-flight request with a generic "Network request failed"
 * error rather than a DOMException named "AbortError". Relying only on the error
 * name converted a slow transcription (timeout) into the misleading "Zoption
 * could not be reached. Connect to the internet and retry." message even though
 * the network was fine. Only a request that is not aborted and still rejects is
 * reported as a genuine connectivity failure.
 */
export async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  input: string,
  init: RequestInit,
  timeoutMs: number = VOICE_REQUEST_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const externalSignal = init.signal;
  const forwardAbort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener("abort", forwardAbort, { once: true });
  }
  try {
    return await fetchImpl(input, { ...init, signal: controller.signal });
  } catch (error) {
    // The request was interrupted (hard timeout or external abort). Surface the
    // timeout honestly instead of blaming connectivity.
    if (controller.signal.aborted) {
      if (timedOut) {
        throw new ApiTransportError(
          "Voice mode is taking too long. The provider may not be ready yet - try again shortly.",
          "network",
          0,
        );
      }
      if (error instanceof Error && error.name === "AbortError") throw error;
      throw error;
    }
    throw new ApiTransportError(
      "Zoption could not be reached. Connect to the internet and retry.",
      "network",
      0,
    );
  } finally {
    clearTimeout(timeout);
    externalSignal?.removeEventListener("abort", forwardAbort);
  }
}

function abortError(): Error {
  const error = new Error("The operation was aborted.");
  error.name = "AbortError";
  return error;
}

/**
 * Bounds a multipart request without attaching AbortController to React
 * Native's fetch. On Android, an AbortSignal on a FormData upload can make the
 * native transport reject locally before sending any bytes.
 */
export async function fetchMultipartWithTimeout(
  fetchImpl: typeof fetch,
  input: string,
  init: RequestInit,
  timeoutMs: number = VOICE_REQUEST_TIMEOUT_MS,
): Promise<Response> {
  const { signal, ...requestInit } = init;

  return await new Promise<Response>((resolve, reject) => {
    let settled = false;
    let timeout: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      if (timeout !== null) clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
    };
    const resolveOnce = (response: Response) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(response);
    };
    const rejectOnce = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const onAbort = () => rejectOnce(abortError());

    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener("abort", onAbort, { once: true });
    timeout = setTimeout(() => {
      rejectOnce(
        new ApiTransportError(
          "Voice mode is taking too long. The provider may not be ready yet - try again shortly.",
          "network",
          0,
        ),
      );
    }, timeoutMs);

    void fetchImpl(input, requestInit).then(resolveOnce, () => {
      rejectOnce(
        new ApiTransportError(
          "Zoption could not be reached. Connect to the internet and retry.",
          "network",
          0,
        ),
      );
    });
  });
}

export function isAssistantSpeechVoice(value: string): value is AssistantSpeechVoice {
  return assistantSpeechVoiceSchema.safeParse(value).success;
}

export interface VoiceRecordingInput {
  uri: string;
  mimeType: string;
  fileName: string;
}

export async function transcribeVoice(
  api: AssistantVoiceApi,
  recording: VoiceRecordingInput,
): Promise<AssistantVoiceTranscription> {
  const form = new FormData();
  // Expo SDK 57's Winter fetch cannot serialize React Native's legacy
  // { uri, name, type } FormData part. expo-file-system's File implements the
  // Blob byte contract used by Winter and keeps the upload on-device/in-flight.
  form.append("audio", new File(recording.uri) as unknown as Blob, recording.fileName);
  const accessToken = api.accessToken;
  let response: Response;
  try {
    response = await fetchMultipartWithTimeout(
      api.fetchImpl ?? fetch,
      publicConfig.apiUrl + "/api/app/assistant/voice/transcriptions",
      {
        method: "POST",
        headers: { Accept: "application/json", Authorization: `Bearer ${accessToken}` },
        body: form,
        signal: api.signal,
      },
    );
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw error;
  }
  if (!response.ok) {
    throw mapApiError(
      response.status,
      (await response.json().catch(() => ({}))) as never,
      voiceFallback,
    );
  }
  return assistantVoiceTranscriptionResponseSchema.parse(await response.json());
}

export async function synthesizeAssistantSpeech(
  api: AssistantVoiceApi,
  messageId: string,
  voice: AssistantSpeechVoice,
): Promise<{ bytes: Uint8Array; mimeType: "audio/mpeg" }> {
  const accessToken = api.accessToken;
  let response: Response;
  try {
    response = await fetchWithTimeout(
      api.fetchImpl ?? fetch,
      publicConfig.apiUrl + "/api/app/assistant/voice/speech",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ messageId, voice }),
        signal: api.signal,
      },
    );
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw error;
  }
  if (!response.ok) {
    throw mapApiError(
      response.status,
      (await response.json().catch(() => ({}))) as never,
      voiceFallback,
    );
  }
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength === 0) {
    throw new ApiTransportError(
      "No spoken reply was returned.",
      "invalid_response",
      response.status,
    );
  }
  return { bytes: new Uint8Array(buffer), mimeType: "audio/mpeg" };
}

export { ApiTransportError };

export type { AssistantSpeechVoice, AssistantVoicePreferences };
