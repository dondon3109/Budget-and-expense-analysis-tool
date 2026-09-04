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
import {
  clearDummyAssistantMemory,
  createDummyAssistantThreadTurn,
  deleteAllDummyAssistantThreads,
  deleteDummyAssistantThread,
  getDummyAssistantMemory,
  getDummyAssistantMemoryPreferences,
  getDummyAssistantPreferences,
  isDummyAssistantToken,
  listDummyAssistantMessages,
  listDummyAssistantThreads,
  sendDummyAssistantTurn,
  updateDummyAssistantMemoryPreferences,
  updateDummyAssistantPreferences,
} from "./assistant-dummy";

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

export async function getAssistantPreferences(api: AssistantApi): Promise<AssistantPreferences> {
  try {
    return await apiRequest({
      ...api,
      path: "/api/app/assistant/preferences",
      method: "GET",
      fallback: assistantFallback,
      decode: (value) => assistantPreferencesResponseSchema.parse(value),
    });
  } catch (error) {
    if (isDummyAssistantToken(api.accessToken)) {
      return getDummyAssistantPreferences();
    }
    throw error;
  }
}

export async function updateAssistantPreferences(
  api: AssistantApi,
  update: AssistantPreferenceUpdate,
): Promise<AssistantPreferences> {
  try {
    return await apiRequest({
      ...api,
      path: "/api/app/assistant/preferences",
      method: "PATCH",
      body: update,
      fallback: assistantFallback,
      decode: (value) => assistantPreferencesResponseSchema.parse(value),
    });
  } catch (error) {
    if (isDummyAssistantToken(api.accessToken)) {
      return updateDummyAssistantPreferences(update);
    }
    throw error;
  }
}

export async function getAssistantMemoryPreferences(
  api: AssistantApi,
): Promise<AssistantMemoryPreferences> {
  try {
    return await apiRequest({
      ...api,
      path: "/api/app/assistant/memory/preferences",
      method: "GET",
      fallback: assistantFallback,
      decode: (value) => assistantMemoryPreferencesResponseSchema.parse(value),
    });
  } catch (error) {
    if (isDummyAssistantToken(api.accessToken)) {
      return getDummyAssistantMemoryPreferences();
    }
    throw error;
  }
}

export async function updateAssistantMemoryPreferences(
  api: AssistantApi,
  input: { debtStrategy: "avalanche" | "snowball" | null },
): Promise<AssistantMemoryPreferences> {
  try {
    return await apiRequest({
      ...api,
      path: "/api/app/assistant/memory/preferences",
      method: "PATCH",
      body: input,
      fallback: assistantFallback,
      decode: (value) => assistantMemoryPreferencesResponseSchema.parse(value),
    });
  } catch (error) {
    if (isDummyAssistantToken(api.accessToken)) {
      return updateDummyAssistantMemoryPreferences(input);
    }
    throw error;
  }
}

const assistantMemoryListSchema = z.array(assistantMemoryItemSchema).max(200);

export async function getAssistantMemory(api: AssistantApi): Promise<AssistantMemory[]> {
  try {
    return await apiRequest({
      ...api,
      path: "/api/app/assistant/memory",
      method: "GET",
      fallback: assistantFallback,
      decode: (value) => assistantMemoryListSchema.parse(value),
    });
  } catch (error) {
    if (isDummyAssistantToken(api.accessToken)) {
      return getDummyAssistantMemory();
    }
    throw error;
  }
}

export async function clearAssistantMemory(api: AssistantApi): Promise<void> {
  try {
    await apiRequest({
      ...api,
      path: "/api/app/assistant/memory",
      method: "DELETE",
      fallback: assistantFallback,
      decode: (value) => value,
    });
  } catch (error) {
    if (isDummyAssistantToken(api.accessToken)) {
      return clearDummyAssistantMemory();
    }
    throw error;
  }
}

export async function listAssistantThreads(
  api: AssistantApi,
  query: { cursor?: string; limit?: number } = {},
): Promise<AssistantThreadPage> {
  try {
    const search = new URLSearchParams();
    if (query.cursor) search.set("cursor", query.cursor);
    if (query.limit) search.set("limit", String(query.limit));
    const suffix = search.size > 0 ? "?" + search.toString() : "";
    return await apiRequest({
      ...api,
      path: "/api/app/assistant/threads" + suffix,
      method: "GET",
      fallback: assistantFallback,
      decode: (value) => assistantThreadPageSchema.parse(value),
    });
  } catch (error) {
    if (isDummyAssistantToken(api.accessToken)) {
      return listDummyAssistantThreads(query);
    }
    throw error;
  }
}

export async function listAssistantMessages(
  api: AssistantApi,
  threadId: string,
  query: { cursor?: string; limit?: number } = {},
): Promise<AssistantWireMessagePage> {
  try {
    const search = new URLSearchParams();
    if (query.cursor) search.set("cursor", query.cursor);
    if (query.limit) search.set("limit", String(query.limit));
    const suffix = search.size > 0 ? "?" + search.toString() : "";
    return await apiRequest({
      ...api,
      path: "/api/app/assistant/threads/" + encodeURIComponent(threadId) + "/messages" + suffix,
      method: "GET",
      fallback: assistantFallback,
      decode: (value) => assistantMessagePageSchema.parse(value),
    });
  } catch (error) {
    if (isDummyAssistantToken(api.accessToken)) {
      return listDummyAssistantMessages(threadId, query);
    }
    throw error;
  }
}

export async function createAssistantThreadTurn(
  api: AssistantApi,
  input: AssistantMessageInput,
): Promise<AssistantWireTurnResult> {
  try {
    return await apiRequest({
      ...api,
      path: "/api/app/assistant/threads",
      method: "POST",
      body: input,
      fallback: assistantFallback,
      decode: (value) => assistantTurnResultSchema.parse(value),
      timeoutMs: ASSISTANT_TURN_TIMEOUT_MS,
    });
  } catch (error) {
    if (error instanceof ApiTransportError && error.status > 0) {
      throw error;
    }
    if (isDummyAssistantToken(api.accessToken)) {
      return createDummyAssistantThreadTurn(input);
    }
    throw error;
  }
}

export async function sendAssistantTurn(
  api: AssistantApi,
  threadId: string,
  input: AssistantMessageInput,
): Promise<AssistantWireTurnResult> {
  try {
    return await apiRequest({
      ...api,
      path: "/api/app/assistant/threads/" + encodeURIComponent(threadId) + "/messages",
      method: "POST",
      body: input,
      fallback: assistantFallback,
      decode: (value) => assistantTurnResultSchema.parse(value),
      timeoutMs: ASSISTANT_TURN_TIMEOUT_MS,
    });
  } catch (error) {
    if (error instanceof ApiTransportError && error.status > 0) {
      throw error;
    }
    if (isDummyAssistantToken(api.accessToken)) {
      return sendDummyAssistantTurn(threadId, input);
    }
    throw error;
  }
}

export async function deleteAssistantThread(api: AssistantApi, threadId: string): Promise<void> {
  try {
    await apiRequest({
      ...api,
      path: "/api/app/assistant/threads/" + encodeURIComponent(threadId),
      method: "DELETE",
      fallback: assistantFallback,
      decode: (value) => value,
    });
  } catch (error) {
    if (isDummyAssistantToken(api.accessToken)) {
      return deleteDummyAssistantThread(threadId);
    }
    throw error;
  }
}

export async function deleteAllAssistantThreads(api: AssistantApi): Promise<void> {
  try {
    await apiRequest({
      ...api,
      path: "/api/app/assistant/threads",
      method: "DELETE",
      fallback: assistantFallback,
      decode: (value) => value,
    });
  } catch (error) {
    if (isDummyAssistantToken(api.accessToken)) {
      return deleteAllDummyAssistantThreads();
    }
    throw error;
  }
}

export { ApiTransportError };

export type { AssistantThread };
