import { CURRENT_ASSISTANT_CONSENT_VERSION } from "@zoption/shared";
import type {
  AssistantMemory,
  AssistantMemoryPreferences,
  AssistantMemoryPreferencesUpdate,
  AssistantMessageInput,
  AssistantMessageListQuery,
  AssistantMessagePage,
  AssistantPreferences,
  AssistantPreferenceUpdate,
  AssistantThreadListQuery,
  AssistantThreadPage,
  AssistantTurnResult,
} from "@zoption/shared";

import type { AssistantRepository } from "../db/assistant";
import type { AssistantModelMemoryUsageRepository } from "../db/assistant-model-memory-usage";
import type { AssistantUsageRepository } from "../db/assistant-usage";
import { HttpError } from "../errors";
import type { Bindings } from "../types";
import { DeepSeekError, type DeepSeekErrorKind, type DeepSeekFailureReason } from "./deepseek";
import { buildMemoryBlock, deterministicExtract, runModelMemoryPass } from "./memory";
import type { AssistantOrchestrator } from "./orchestrator";
import type { AssistantProvider } from "./provider";
import { responseMetadataForPolicy, serializeTurnPolicy } from "./turn-policy";

const THREAD_SUMMARY_MAX_CHARACTERS = 500;

export interface AssistantService {
  getPreferences(env: Bindings, tenantId: string): Promise<AssistantPreferences>;
  updatePreferences(
    env: Bindings,
    tenantId: string,
    input: AssistantPreferenceUpdate,
  ): Promise<AssistantPreferences>;
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
  getMemory(env: Bindings, tenantId: string): Promise<AssistantMemory[]>;
  getMemoryPreferences(env: Bindings, tenantId: string): Promise<AssistantMemoryPreferences>;
  updateMemoryPreferences(
    env: Bindings,
    tenantId: string,
    input: AssistantMemoryPreferencesUpdate,
  ): Promise<AssistantMemoryPreferences>;
  clearMemory(env: Bindings, tenantId: string): Promise<void>;
}

export interface AssistantProviderFailureEvent {
  event: "assistant_provider_failure";
  provider: "deepseek";
  kind: DeepSeekErrorKind;
  reason: DeepSeekFailureReason;
  providerStatus?: number;
}

export type AssistantDiagnosticReporter = (event: AssistantProviderFailureEvent) => void;

function defaultDiagnosticReporter(event: AssistantProviderFailureEvent): void {
  console.warn(JSON.stringify(event));
}

function reportProviderFailure(error: DeepSeekError, reporter: AssistantDiagnosticReporter): void {
  const event: AssistantProviderFailureEvent = {
    event: "assistant_provider_failure",
    provider: "deepseek",
    kind: error.kind,
    reason: error.reason,
    ...(error.providerStatus === undefined ? {} : { providerStatus: error.providerStatus }),
  };
  try {
    reporter(event);
  } catch {
    // Operational diagnostics must never alter the assistant response or turn cleanup.
  }
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
  reporter: AssistantDiagnosticReporter = defaultDiagnosticReporter,
  assistantUsage?: Pick<AssistantUsageRepository, "consumeUsage">,
  provider?: AssistantProvider,
  modelMemoryUsage?: Pick<AssistantModelMemoryUsageRepository, "tryConsumePass">,
): AssistantService {
  async function requireReadyPreferences(
    env: Bindings,
    tenantId: string,
  ): Promise<AssistantPreferences & { assistantName: string; userPreferredName: string }> {
    const preferences = await repository.getPreferences(env, tenantId);
    if (
      !preferences.consentedAt ||
      preferences.consentVersion !== CURRENT_ASSISTANT_CONSENT_VERSION
    ) {
      throw new HttpError(
        409,
        "assistant_consent_required",
        "Review and accept the AI data-sharing notice before sending a message.",
      );
    }
    const { assistantName, userPreferredName } = preferences;
    if (!assistantName || !userPreferredName) {
      throw new HttpError(
        409,
        "assistant_identity_required",
        "Name your assistant and choose how it should address you before sending a message.",
      );
    }
    return { ...preferences, assistantName, userPreferredName };
  }

  async function loadMemoryContext(env: Bindings, tenantId: string, threadId: string) {
    const [memories, preferences] = await Promise.all([
      repository.listMemories(env, tenantId),
      repository.getPreferences(env, tenantId),
    ]);
    const facts = memories.filter(
      (memory) => memory.kind === "fact" || memory.kind === "preference",
    );
    const threadSummary =
      memories.find((memory) => memory.kind === "summary" && memory.key === `thread:${threadId}`)
        ?.value ?? null;
    const debtMemory = memories.find(
      (memory) => memory.kind === "preference" && memory.key === "debt_strategy",
    );
    const debtStrategy =
      debtMemory && (debtMemory.value === "avalanche" || debtMemory.value === "snowball")
        ? debtMemory.value
        : null;
    const block = buildMemoryBlock({
      debtStrategy,
      responseDetail: preferences.responseDetail,
      coachingStyle: preferences.coachingStyle,
      facts,
      threadSummary,
    });
    return { block };
  }

  async function persistExtractedMemories(env: Bindings, tenantId: string, message: string) {
    const extraction = deterministicExtract(message);
    for (const memory of extraction.memories) {
      await repository.upsertMemory(env, tenantId, memory);
    }
    if (
      extraction.needsModelPass &&
      env.ASSISTANT_MEMORY_MODEL_PASS !== "off" &&
      provider &&
      modelMemoryUsage
    ) {
      const consumed = await modelMemoryUsage.tryConsumePass(env, tenantId);
      if (!consumed) return;
      const extracted = await runModelMemoryPass(env, provider, message);
      for (const memory of extracted) {
        await repository.upsertMemory(env, tenantId, memory);
      }
    }
  }

  async function updateThreadSummary(
    env: Bindings,
    tenantId: string,
    threadId: string,
    assistantContent: string,
  ) {
    const summary = assistantContent.replace(/\s+/g, " ").trim();
    if (!summary) return;
    const bounded =
      summary.length > THREAD_SUMMARY_MAX_CHARACTERS
        ? `${summary.slice(0, THREAD_SUMMARY_MAX_CHARACTERS - 1).trimEnd()}…`
        : summary;
    await repository.upsertMemory(env, tenantId, {
      kind: "summary",
      key: `thread:${threadId}`,
      value: bounded,
      source: "deterministic",
    });
  }

  async function runTurn(
    env: Bindings,
    tenantId: string,
    threadId: string,
    input: AssistantMessageInput,
  ): Promise<AssistantTurnResult> {
    const preferences = await requireReadyPreferences(env, tenantId);
    const start = await repository.beginTurn(env, tenantId, threadId, input);
    if (start.duplicate) return start.duplicate;

    try {
      const policy = await orchestrator.plan(env, tenantId, start.history, input.message);
      if (policy.deterministicResponse) {
        const responseMetadata = responseMetadataForPolicy(policy);
        return await repository.completeTurn(env, tenantId, start, policy.deterministicResponse, {
          model: "zoption-turn-policy",
          finishReason: "policy",
          responseMetadata,
          audit: {
            promptVersion: responseMetadata.promptVersion,
            compliancePolicyJson: serializeTurnPolicy(policy),
            ...(policy.resolvedPeriod
              ? { resolvedPeriodJson: JSON.stringify(policy.resolvedPeriod) }
              : {}),
            requiredToolGroupsJson: JSON.stringify(policy.requiredToolGroups),
            providerCallCount: 0,
            validationStatus: "not_required",
            toolCalls: [],
          },
        });
      }

      await assistantUsage?.consumeUsage(env, tenantId);
      const { block } = await loadMemoryContext(env, tenantId, start.thread.id);
      const answer = await orchestrator.answer(
        env,
        tenantId,
        start.history,
        input.message,
        {
          assistantName: preferences.assistantName,
          userPreferredName: preferences.userPreferredName,
          responseDetail: preferences.responseDetail,
          coachingStyle: preferences.coachingStyle,
        },
        policy,
        block,
      );
      const completed = await repository.completeTurn(env, tenantId, start, answer.content, {
        model: answer.model,
        promptTokens: answer.promptTokens,
        completionTokens: answer.completionTokens,
        finishReason: answer.finishReason,
        responseMetadata: answer.responseMetadata,
        audit: answer.audit,
      });
      try {
        await persistExtractedMemories(env, tenantId, input.message);
        await updateThreadSummary(env, tenantId, start.thread.id, answer.content);
      } catch {
        // Memory updates are best-effort and must never fail a completed turn.
      }
      return completed;
    } catch (error) {
      if (error instanceof DeepSeekError) reportProviderFailure(error, reporter);
      await repository.failTurn(env, tenantId, start);
      mapProviderError(error);
    }
  }

  return {
    getPreferences: (env, tenantId) => repository.getPreferences(env, tenantId),
    updatePreferences: (env, tenantId, input) => {
      if ("consented" in input) return repository.grantConsent(env, tenantId);
      if ("assistantName" in input) return repository.setAssistantIdentity(env, tenantId, input);
      return repository.setResponsePreferences(env, tenantId, input);
    },
    listThreads: (env, tenantId, query) => repository.listThreads(env, tenantId, query),
    listMessages: (env, tenantId, threadId, query) =>
      repository.listMessages(env, tenantId, threadId, query),

    async createThreadTurn(env, tenantId, input) {
      await requireReadyPreferences(env, tenantId);
      const thread = await repository.createThread(env, tenantId, input.message);
      return runTurn(env, tenantId, thread.id, input);
    },

    sendTurn: runTurn,
    deleteThread: (env, tenantId, threadId) => repository.deleteThread(env, tenantId, threadId),
    deleteAllThreads: (env, tenantId) => repository.deleteAllThreads(env, tenantId),

    getMemory: (env, tenantId) => repository.listMemories(env, tenantId),

    async getMemoryPreferences(env, tenantId) {
      const preferences = await repository.getPreferences(env, tenantId);
      const debtMemory = await repository.getMemory(env, tenantId, "preference", "debt_strategy");
      const debtStrategy =
        debtMemory && (debtMemory.value === "avalanche" || debtMemory.value === "snowball")
          ? debtMemory.value
          : null;
      return {
        debtStrategy,
        responseDetail: preferences.responseDetail,
        coachingStyle: preferences.coachingStyle,
      };
    },

    async updateMemoryPreferences(env, tenantId, input) {
      await requireReadyPreferences(env, tenantId);
      if (input.debtStrategy === null) {
        await repository.deleteMemory(env, tenantId, "preference", "debt_strategy");
      } else {
        await repository.upsertMemory(env, tenantId, {
          kind: "preference",
          key: "debt_strategy",
          value: input.debtStrategy,
          source: "user_stated",
        });
      }
      return this.getMemoryPreferences(env, tenantId);
    },

    async clearMemory(env, tenantId) {
      await repository.clearMemories(env, tenantId);
    },
  };
}
