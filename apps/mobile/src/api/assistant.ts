import {
  assistantMemoryItemSchema,
  assistantMemoryPreferencesResponseSchema,
  assistantMessagePageSchema,
  assistantPreferencesResponseSchema,
  assistantThreadPageSchema,
  assistantTurnResultSchema,
  type AssistantMemory,
  type AssistantMemoryPreferences,
  type AssistantMessageInput,
  type AssistantPreferenceUpdate,
  type AssistantPreferences,
  type AssistantThread,
  type AssistantThreadPage,
} from "@zoption/shared";
import { z } from "zod";

import { ApiTransportError, apiRequest } from "./authenticated";

export interface AssistantApi {
  accessToken: string;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

export type AssistantMessageRole = "user" | "assistant";
export type AssistantMessageStatus = "pending" | "completed" | "failed";

export interface AssistantWireMessage {
  id: string;
  threadId: string;
  role: AssistantMessageRole;
  content: string;
  status: AssistantMessageStatus;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface AssistantWireMessagePage {
  items: AssistantWireMessage[];
  nextCursor: string | null;
}

export interface AssistantWireTurnResult {
  thread: AssistantThread;
  userMessage: AssistantWireMessage;
  assistantMessage: AssistantWireMessage;
}

const assistantFallback = "The financial assistant could not be reached. Try again shortly.";

/**
 * Agentic assistant turns (LLM inference plus tools) legitimately take much
 * longer than a quick lookup, mirroring the web client's turn ceiling.
 */
const ASSISTANT_TURN_TIMEOUT_MS = 120_000;

export function getAssistantPreferences(api: AssistantApi): Promise<AssistantPreferences> {
  return apiRequest({
    ...api,
    path: "/api/app/assistant/preferences",
    method: "GET",
    fallback: assistantFallback,
    decode: (value) => assistantPreferencesResponseSchema.parse(value),
  });
}

export function updateAssistantPreferences(
  api: AssistantApi,
  update: AssistantPreferenceUpdate,
): Promise<AssistantPreferences> {
  return apiRequest({
    ...api,
    path: "/api/app/assistant/preferences",
    method: "PATCH",
    body: update,
    fallback: assistantFallback,
    decode: (value) => assistantPreferencesResponseSchema.parse(value),
  });
}

export function getAssistantMemoryPreferences(
  api: AssistantApi,
): Promise<AssistantMemoryPreferences> {
  return apiRequest({
    ...api,
    path: "/api/app/assistant/memory/preferences",
    method: "GET",
    fallback: assistantFallback,
    decode: (value) => assistantMemoryPreferencesResponseSchema.parse(value),
  });
}

export function updateAssistantMemoryPreferences(
  api: AssistantApi,
  input: { debtStrategy: "avalanche" | "snowball" | null },
): Promise<AssistantMemoryPreferences> {
  return apiRequest({
    ...api,
    path: "/api/app/assistant/memory/preferences",
    method: "PATCH",
    body: input,
    fallback: assistantFallback,
    decode: (value) => assistantMemoryPreferencesResponseSchema.parse(value),
  });
}

const assistantMemoryListSchema = z.array(assistantMemoryItemSchema).max(200);

export function getAssistantMemory(api: AssistantApi): Promise<AssistantMemory[]> {
  return apiRequest({
    ...api,
    path: "/api/app/assistant/memory",
    method: "GET",
    fallback: assistantFallback,
    decode: (value) => assistantMemoryListSchema.parse(value),
  });
}

export async function clearAssistantMemory(api: AssistantApi): Promise<void> {
  await apiRequest({
    ...api,
    path: "/api/app/assistant/memory",
    method: "DELETE",
    fallback: assistantFallback,
    decode: (value) => value,
  });
}

export function listAssistantThreads(
  api: AssistantApi,
  query: { cursor?: string; limit?: number } = {},
): Promise<AssistantThreadPage> {
  const search = new URLSearchParams();
  if (query.cursor) search.set("cursor", query.cursor);
  if (query.limit) search.set("limit", String(query.limit));
  const suffix = search.size > 0 ? "?" + search.toString() : "";
  return apiRequest({
    ...api,
    path: "/api/app/assistant/threads" + suffix,
    method: "GET",
    fallback: assistantFallback,
    decode: (value) => assistantThreadPageSchema.parse(value),
  });
}

export function listAssistantMessages(
  api: AssistantApi,
  threadId: string,
  query: { cursor?: string; limit?: number } = {},
): Promise<AssistantWireMessagePage> {
  const search = new URLSearchParams();
  if (query.cursor) search.set("cursor", query.cursor);
  if (query.limit) search.set("limit", String(query.limit));
  const suffix = search.size > 0 ? "?" + search.toString() : "";
  return apiRequest({
    ...api,
    path: "/api/app/assistant/threads/" + encodeURIComponent(threadId) + "/messages" + suffix,
    method: "GET",
    fallback: assistantFallback,
    decode: (value) => assistantMessagePageSchema.parse(value),
  });
}

export function createAssistantThreadTurn(
  api: AssistantApi,
  input: AssistantMessageInput,
): Promise<AssistantWireTurnResult> {
  return apiRequest({
    ...api,
    path: "/api/app/assistant/threads",
    method: "POST",
    body: input,
    fallback: assistantFallback,
    decode: (value) => assistantTurnResultSchema.parse(value),
    timeoutMs: ASSISTANT_TURN_TIMEOUT_MS,
  });
}

export function sendAssistantTurn(
  api: AssistantApi,
  threadId: string,
  input: AssistantMessageInput,
): Promise<AssistantWireTurnResult> {
  return apiRequest({
    ...api,
    path: "/api/app/assistant/threads/" + encodeURIComponent(threadId) + "/messages",
    method: "POST",
    body: input,
    fallback: assistantFallback,
    decode: (value) => assistantTurnResultSchema.parse(value),
    timeoutMs: ASSISTANT_TURN_TIMEOUT_MS,
  });
}

export async function deleteAssistantThread(
  api: AssistantApi,
  threadId: string,
): Promise<void> {
  await apiRequest({
    ...api,
    path: "/api/app/assistant/threads/" + encodeURIComponent(threadId),
    method: "DELETE",
    fallback: assistantFallback,
    decode: (value) => value,
  });
}

export async function deleteAllAssistantThreads(api: AssistantApi): Promise<void> {
  await apiRequest({
    ...api,
    path: "/api/app/assistant/threads",
    method: "DELETE",
    fallback: assistantFallback,
    decode: (value) => value,
  });
}

export { ApiTransportError };

export type { AssistantThread };
