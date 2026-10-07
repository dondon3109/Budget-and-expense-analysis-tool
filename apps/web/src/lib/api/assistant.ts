import { assistantMessageSchema } from "@zoption/shared";
import type {
  AssistantMemory,
  AssistantMemoryPreferences,
  AssistantMemoryPreferencesUpdate,
  AssistantMessage,
  AssistantMessageInput,
  AssistantMessagePage,
  AssistantPreferences,
  AssistantPreferenceUpdate,
  AssistantThreadPage,
  AssistantTurnResult,
  AssistantSpeechVoice,
  AssistantVoicePreferences,
  AssistantVoiceTranscription,
  VoiceLanguage,
} from "@zoption/shared";

import type { AuthenticatedWorkspace } from "../workspace";
import { ApiRequestError, isRecord, apiErrorPayload } from "./errors";
import { apiUrl, workspaceFetch, requestJson } from "./transport";

export function getAssistantPreferences(
  workspace: AuthenticatedWorkspace,
): Promise<AssistantPreferences> {
  return requestJson(workspace, "/api/app/assistant/preferences");
}

export function grantAssistantConsent(
  workspace: AuthenticatedWorkspace,
): Promise<AssistantPreferences> {
  return requestJson(workspace, "/api/app/assistant/preferences", {
    method: "PATCH",
    body: JSON.stringify({ consented: true }),
  });
}

export function getAssistantVoicePreferences(
  workspace: AuthenticatedWorkspace,
): Promise<AssistantVoicePreferences> {
  return requestJson(workspace, "/api/app/assistant/voice/preferences");
}

export function grantAssistantVoiceConsent(
  workspace: AuthenticatedWorkspace,
): Promise<AssistantVoicePreferences> {
  return requestJson(workspace, "/api/app/assistant/voice/preferences", {
    method: "PATCH",
    body: JSON.stringify({ consented: true }),
  });
}

export async function transcribeAssistantVoice(
  workspace: AuthenticatedWorkspace,
  audio: Blob,
  language?: VoiceLanguage,
): Promise<AssistantVoiceTranscription> {
  const form = new FormData();
  const extension = audio.type.includes("mp4")
    ? "m4a"
    : audio.type.includes("ogg")
      ? "ogg"
      : "webm";
  form.set("audio", audio, `voice-input.${extension}`);
  form.set("lang", language || "auto");
  const response = await workspaceFetch(
    workspace,
    "/api/app/assistant/voice/transcriptions",
    {
      method: "POST",
      headers: { Accept: "application/json" },
      body: form,
    },
    { timeoutMs: 45_000 },
  );
  if (!response.ok) {
    const payload = apiErrorPayload(await response.json().catch(() => null));
    throw new ApiRequestError(
      payload.message ?? "The recording could not be transcribed.",
      response.status,
      payload.error ?? "assistant_voice_failed",
      payload.details,
    );
  }
  return (await response.json()) as AssistantVoiceTranscription;
}

/**
 * Mints a single-use voice stream ticket and opens the live transcription socket with it.
 *
 * The ticket replaces the Supabase access token, which must never travel in a URL, and it is
 * single use with a 60 second TTL — so it is minted here, immediately before the handshake.
 * Every connect, including a fresh attempt after a dropped socket, calls this function again;
 * reusing a ticket or a socket is rejected by the server with invalid_voice_ticket.
 */
export async function openVoiceStreamWebSocket(
  workspace: AuthenticatedWorkspace,
  language?: VoiceLanguage,
): Promise<WebSocket> {
  const payload = await requestJson<unknown>(workspace, "/api/app/assistant/voice/ticket", {
    method: "POST",
  });
  const ticket = isRecord(payload) ? payload.ticket : undefined;
  if (typeof ticket !== "string" || !ticket) {
    throw new ApiRequestError(
      "Live transcription authentication could not be prepared.",
      502,
      "invalid_voice_ticket_response",
    );
  }

  const base = apiUrl
    ? apiUrl.replace(/^http:/, "ws:").replace(/^https:/, "wss:")
    : `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}`;
  const langParam = language ? `&lang=${encodeURIComponent(language)}` : "&lang=auto";
  const wsUrl = `${base}/api/app/assistant/voice/stream?ticket=${encodeURIComponent(ticket)}${langParam}`;
  return new WebSocket(wsUrl);
}

export async function describeVoiceStreamFailure(
  workspace: AuthenticatedWorkspace,
): Promise<string> {
  try {
    const response = await workspaceFetch(
      workspace,
      "/api/app/assistant/voice/stream",
      { method: "GET", headers: { Accept: "application/json" } },
      // A short probe on the voice failure path: repeating it would only delay the message.
      { retryUnauthorized: false, timeoutMs: 4_000, retryOnTimeout: false },
    );
    const payload = apiErrorPayload(await response.json().catch(() => null));
    if (payload.error === "origin_not_allowed") {
      return "This origin is not allowed to use live voice. Add it to ALLOWED_ORIGINS.";
    }
    if (payload.error === "authentication_required" || payload.error === "invalid_access_token") {
      return "Voice stream authentication failed. Sign in again.";
    }
    if (
      payload.error === "gemini_missing_key" ||
      payload.error === "stt_not_streaming" ||
      payload.error === "stt_not_configured" ||
      payload.error === "bridge_not_configured" ||
      payload.error === "rate_limit_exceeded"
    ) {
      return payload.message || "Live transcription is not available.";
    }
    if (response.status >= 500) return "Voice stream server error. Check the API worker logs.";
  } catch {
    // Fall through to the generic handshake error.
  }
  return "WebSocket connection to voice stream failed.";
}

export async function getAssistantVoiceSpeech(
  workspace: AuthenticatedWorkspace,
  messageId: string,
  voice: AssistantSpeechVoice = "default",
): Promise<Blob> {
  const response = await workspaceFetch(
    workspace,
    "/api/app/assistant/voice/speech",
    {
      method: "POST",
      headers: { Accept: "audio/mpeg", "Content-Type": "application/json" },
      body: JSON.stringify({ messageId, voice }),
    },
    { timeoutMs: 45_000 },
  );
  if (!response.ok) {
    const payload = apiErrorPayload(await response.json().catch(() => null));
    throw new ApiRequestError(
      payload.message ?? "The spoken reply could not be prepared.",
      response.status,
      payload.error ?? "assistant_voice_failed",
      payload.details,
    );
  }
  return response.blob();
}

export async function getAssistantVoicePreview(
  workspace: AuthenticatedWorkspace,
  voice: AssistantSpeechVoice,
): Promise<Blob> {
  const response = await workspaceFetch(
    workspace,
    "/api/app/assistant/voice/preview",
    {
      method: "POST",
      headers: { Accept: "audio/mpeg", "Content-Type": "application/json" },
      body: JSON.stringify({ voice }),
    },
    { timeoutMs: 45_000 },
  );
  if (!response.ok) {
    const payload = apiErrorPayload(await response.json().catch(() => null));
    throw new ApiRequestError(
      payload.message ?? "The voice preview could not be prepared.",
      response.status,
      payload.error ?? "assistant_voice_failed",
      payload.details,
    );
  }
  return response.blob();
}

export function updateAssistantIdentity(
  workspace: AuthenticatedWorkspace,
  input: Extract<AssistantPreferenceUpdate, { assistantName: string }>,
): Promise<AssistantPreferences> {
  return requestJson(workspace, "/api/app/assistant/preferences", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function updateAssistantResponsePreferences(
  workspace: AuthenticatedWorkspace,
  input: Extract<AssistantPreferenceUpdate, { responseDetail: string }>,
): Promise<AssistantPreferences> {
  return requestJson(workspace, "/api/app/assistant/preferences", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function getAssistantThreads(
  workspace: AuthenticatedWorkspace,
  cursor?: string,
): Promise<AssistantThreadPage> {
  const search = new URLSearchParams({ limit: "20" });
  if (cursor) search.set("cursor", cursor);
  return requestJson(workspace, `/api/app/assistant/threads?${search.toString()}`);
}

export function getAssistantMessages(
  workspace: AuthenticatedWorkspace,
  threadId: string,
  cursor?: string,
): Promise<AssistantMessagePage> {
  const search = new URLSearchParams({ limit: "50" });
  if (cursor) search.set("cursor", cursor);
  return requestJson(
    workspace,
    `/api/app/assistant/threads/${encodeURIComponent(threadId)}/messages?${search.toString()}`,
  );
}

/**
 * Agentic assistant turns (LLM inference plus tools) legitimately outlast the
 * 20s default ceiling, so both turn endpoints get a longer client timeout.
 */
const ASSISTANT_TURN_TIMEOUT_MS = 120_000;

export function createAssistantThread(
  workspace: AuthenticatedWorkspace,
  input: AssistantMessageInput,
): Promise<AssistantTurnResult> {
  return requestJson(
    workspace,
    "/api/app/assistant/threads",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
    { timeoutMs: ASSISTANT_TURN_TIMEOUT_MS },
  );
}

export function sendAssistantMessage(
  workspace: AuthenticatedWorkspace,
  args: { threadId: string; input: AssistantMessageInput },
): Promise<AssistantTurnResult> {
  return requestJson(
    workspace,
    `/api/app/assistant/threads/${encodeURIComponent(args.threadId)}/messages`,
    { method: "POST", body: JSON.stringify(args.input) },
    { timeoutMs: ASSISTANT_TURN_TIMEOUT_MS },
  );
}

/**
 * Saves one transaction an assistant reply drafted (`slot` picks it among the reply's drafts).
 * The server writes its own stored draft at most once and answers with the reply, now marked saved.
 */
export async function confirmAssistantTransactionDraft(
  workspace: AuthenticatedWorkspace,
  messageId: string,
  slot = 0,
): Promise<AssistantMessage> {
  const value = await requestJson<unknown>(
    workspace,
    `/api/app/assistant/messages/${encodeURIComponent(messageId)}/transaction`,
    { method: "POST", body: JSON.stringify({ slot }) },
  );
  // Metadata stays a loose record in the shared schema; the draft card parses its draft.
  return assistantMessageSchema.parse(value) as AssistantMessage;
}

/**
 * Applies the subscription, goal, or debt change an assistant reply proposed. The server applies
 * its own stored proposal at most once and answers with the reply, now marked done.
 */
export async function confirmAssistantAction(
  workspace: AuthenticatedWorkspace,
  messageId: string,
): Promise<AssistantMessage> {
  const value = await requestJson<unknown>(
    workspace,
    `/api/app/assistant/messages/${encodeURIComponent(messageId)}/action`,
    { method: "POST", body: "{}" },
  );
  return assistantMessageSchema.parse(value) as AssistantMessage;
}

export function deleteAssistantThread(
  workspace: AuthenticatedWorkspace,
  threadId: string,
): Promise<void> {
  return requestJson(workspace, `/api/app/assistant/threads/${encodeURIComponent(threadId)}`, {
    method: "DELETE",
  });
}

export function deleteAllAssistantThreads(workspace: AuthenticatedWorkspace): Promise<void> {
  return requestJson(workspace, "/api/app/assistant/threads", { method: "DELETE" });
}

export function getAssistantMemory(workspace: AuthenticatedWorkspace): Promise<AssistantMemory[]> {
  return requestJson(workspace, "/api/app/assistant/memory");
}

export function getAssistantMemoryPreferences(
  workspace: AuthenticatedWorkspace,
): Promise<AssistantMemoryPreferences> {
  return requestJson(workspace, "/api/app/assistant/memory/preferences");
}

export function updateAssistantMemoryPreferences(
  workspace: AuthenticatedWorkspace,
  input: AssistantMemoryPreferencesUpdate,
): Promise<AssistantMemoryPreferences> {
  return requestJson(workspace, "/api/app/assistant/memory/preferences", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function clearAssistantMemory(workspace: AuthenticatedWorkspace): Promise<void> {
  return requestJson(workspace, "/api/app/assistant/memory", { method: "DELETE" });
}

export function updateAssistantMemory(
  workspace: AuthenticatedWorkspace,
  id: string,
  value: string,
): Promise<AssistantMemory> {
  return requestJson(workspace, `/api/app/assistant/memory/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ value }),
  });
}

export function deleteAssistantMemory(
  workspace: AuthenticatedWorkspace,
  id: string,
): Promise<void> {
  return requestJson(workspace, `/api/app/assistant/memory/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}
