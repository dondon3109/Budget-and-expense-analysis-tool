import {
  assistantSpeechVoiceSchema,
  assistantVoicePreferencesResponseSchema,
  assistantVoiceTranscriptionResponseSchema,
  type AssistantSpeechVoice,
  type AssistantVoicePreferences,
  type AssistantVoiceTranscription,
} from "@zoption/shared";

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
  form.append("audio", {
    uri: recording.uri,
    name: recording.fileName,
    type: recording.mimeType,
  } as unknown as Blob);
  const accessToken = api.accessToken;
  let response: Response;
  try {
    response = await (api.fetchImpl ?? fetch)(
      publicConfig.apiUrl + "/api/app/assistant/voice/transcriptions",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: form,
        signal: api.signal,
      },
    );
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw new ApiTransportError(
      "Zoption could not be reached. Connect to the internet and retry.",
      "network",
      0,
    );
  }
  if (!response.ok) {
    
    throw mapApiError(response.status, (await response.json().catch(() => ({}))) as never, voiceFallback);
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
    response = await (api.fetchImpl ?? fetch)(
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
    throw new ApiTransportError(
      "Zoption could not be reached. Connect to the internet and retry.",
      "network",
      0,
    );
  }
  if (!response.ok) {

    throw mapApiError(response.status, (await response.json().catch(() => ({}))) as never, voiceFallback);
  }
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength === 0) {
    throw new ApiTransportError("No spoken reply was returned.", "invalid_response", response.status);
  }
  return { bytes: new Uint8Array(buffer), mimeType: "audio/mpeg" };
}

export { ApiTransportError };

export type { AssistantSpeechVoice, AssistantVoicePreferences };
