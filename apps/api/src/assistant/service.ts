import type {
  AssistantMessageInput,
  AssistantMessageListQuery,
  AssistantMessagePage,
  AssistantPreferences,
  AssistantThreadListQuery,
  AssistantThreadPage,
  AssistantTurnResult,
} from "@zoption/shared";

import type { AssistantRepository } from "../db/assistant";
import { HttpError } from "../errors";
import type { Bindings } from "../types";
import { DeepSeekError } from "./deepseek";
import type { AssistantOrchestrator } from "./orchestrator";

export interface AssistantService {
  getPreferences(env: Bindings, tenantId: string): Promise<AssistantPreferences>;
  grantConsent(env: Bindings, tenantId: string): Promise<AssistantPreferences>;
  listThreads(
    env: Bindings,
    tenantId: string,
    query: AssistantThreadListQuery,
  ): Promise<AssistantThreadPage>;
  listMessages(
    env: Bindings,
    tenantId: string,
    threadId: string,
    query: AssistantMessageListQuery,
  ): Promise<AssistantMessagePage>;
  createThreadTurn(
    env: Bindings,
    tenantId: string,
    input: AssistantMessageInput,
  ): Promise<AssistantTurnResult>;
  sendTurn(
    env: Bindings,
    tenantId: string,
    threadId: string,
    input: AssistantMessageInput,
  ): Promise<AssistantTurnResult>;
  deleteThread(env: Bindings, tenantId: string, threadId: string): Promise<void>;
  deleteAllThreads(env: Bindings, tenantId: string): Promise<void>;
}

function mapProviderError(error: unknown): never {
  if (!(error instanceof DeepSeekError)) throw error;
  if (error.kind === "blocked") {
    throw new HttpError(
      422,
      "assistant_response_blocked",
      "The assistant could not provide a response to that question.",
    );
  }
  if (error.kind === "timeout") {
    throw new HttpError(504, "assistant_timeout", "The assistant took too long. Try again.");
  }
  if (error.kind === "invalid_response") {
    throw new HttpError(
      502,
      "assistant_provider_error",
      "The assistant returned an invalid response. Try again.",
    );
  }
  throw new HttpError(
    503,
    "assistant_unavailable",
    "The assistant is temporarily unavailable. Try again later.",
  );
}

export function createAssistantService(
  repository: AssistantRepository,
  orchestrator: AssistantOrchestrator,
): AssistantService {
  async function requireConsent(env: Bindings, tenantId: string) {
    const preferences = await repository.getPreferences(env, tenantId);
    if (!preferences.consentedAt) {
      throw new HttpError(
        409,
        "assistant_consent_required",
        "Review and accept the AI data-sharing notice before sending a message.",
      );
    }
  }

  async function runTurn(
    env: Bindings,
    tenantId: string,
    threadId: string,
    input: AssistantMessageInput,
  ): Promise<AssistantTurnResult> {
    await requireConsent(env, tenantId);
    const start = await repository.beginTurn(env, tenantId, threadId, input);
    if (start.duplicate) return start.duplicate;

    try {
      const answer = await orchestrator.answer(env, tenantId, start.history, input.message);
      return await repository.completeTurn(env, tenantId, start, answer.content, {
        model: answer.model,
        promptTokens: answer.promptTokens,
        completionTokens: answer.completionTokens,
        finishReason: answer.finishReason,
      });
    } catch (error) {
      await repository.failTurn(env, tenantId, start);
      mapProviderError(error);
    }
  }

  return {
    getPreferences: (env, tenantId) => repository.getPreferences(env, tenantId),
    grantConsent: (env, tenantId) => repository.grantConsent(env, tenantId),
    listThreads: (env, tenantId, query) => repository.listThreads(env, tenantId, query),
    listMessages: (env, tenantId, threadId, query) =>
      repository.listMessages(env, tenantId, threadId, query),

    async createThreadTurn(env, tenantId, input) {
      await requireConsent(env, tenantId);
      const thread = await repository.createThread(env, tenantId, input.message);
      return runTurn(env, tenantId, thread.id, input);
    },

    sendTurn: runTurn,
    deleteThread: (env, tenantId, threadId) => repository.deleteThread(env, tenantId, threadId),
    deleteAllThreads: (env, tenantId) => repository.deleteAllThreads(env, tenantId),
  };
}
