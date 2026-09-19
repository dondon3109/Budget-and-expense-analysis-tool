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
import { consumeAiUsage as defaultConsumeAiUsage } from "../db/billing";
import { HttpError } from "../errors";
import type { Bindings } from "../types";
import {
  AssistantProviderError,
  type AssistantProviderErrorKind,
  type AssistantProviderFailureReason,
} from "./provider-error";
import {
  buildMemoryBlock,
  canonicalizeMemoryKey,
  containsPromptInjection,
  deterministicExtract,
  isCanonicalMemoryKey,
  isSensitiveMemory,
  MAX_MEMORY_FACTS_STORED,
  runModelMemoryPass,
  sanitizeMemoryValue,
} from "./memory";
import type { AssistantOrchestrator } from "./orchestrator";
import {
  createPostHogAiTelemetry,
  type AssistantAiTelemetry,
  type AssistantAiTelemetryFactory,
} from "./posthog-ai";
import type { AssistantProvider } from "./provider";
import { responseMetadataForPolicy, serializeTurnPolicy } from "./turn-policy";

const THREAD_SUMMARY_MAX_CHARACTERS = 500;

export interface AssistantTurnExecution {
  defer(promise: Promise<void>): void;
}

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
    execution?: AssistantTurnExecution,
  ): Promise<AssistantTurnResult>;
  sendTurn(
    env: Bindings,
    tenantId: string,
    threadId: string,
    input: AssistantMessageInput,
    execution?: AssistantTurnExecution,
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
  updateMemory(
    env: Bindings,
    tenantId: string,
    id: string,
    value: string,
  ): Promise<AssistantMemory>;
  deleteMemoryFact(env: Bindings, tenantId: string, id: string): Promise<void>;
}

export interface AssistantProviderFailureEvent {
  event: "assistant_provider_failure";
  provider: string;
  kind: AssistantProviderErrorKind;
  reason: AssistantProviderFailureReason;
  providerStatus?: number;
}

export type AssistantDiagnosticReporter = (event: AssistantProviderFailureEvent) => void;

function defaultDiagnosticReporter(event: AssistantProviderFailureEvent): void {
  console.warn(JSON.stringify(event));
}

function reportProviderFailure(
  error: AssistantProviderError,
  reporter: AssistantDiagnosticReporter,
): void {
  const event: AssistantProviderFailureEvent = {
    event: "assistant_provider_failure",
    provider: error.provider,
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
  if (!(error instanceof AssistantProviderError)) throw error;
  // Retrying cannot fix an unfunded provider account, so it gets its own code and
  // copy instead of the retry guidance every other mapping gives.
  if (error.reason === "insufficient_credits") {
    throw new HttpError(
      503,
      "assistant_provider_unfunded",
      "The assistant is unavailable because its provider account is out of credit.",
    );
  }
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
  consumeAiUsage: (env: Bindings, tenantId: string) => Promise<void> = defaultConsumeAiUsage,
  provider?: AssistantProvider,
  modelMemoryUsage?: Pick<AssistantModelMemoryUsageRepository, "tryConsumePass">,
  telemetryFactory: AssistantAiTelemetryFactory = createPostHogAiTelemetry,
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

  async function loadMemoryContext(
    env: Bindings,
    tenantId: string,
    threadId: string,
    currentMessage?: string,
  ) {
    const [memories, preferences, threadSummaryMemory] = await Promise.all([
      repository.listMemories(env, tenantId),
      repository.getPreferences(env, tenantId),
      repository.getMemory(env, tenantId, "summary", `thread:${threadId}`),
    ]);
    const facts = memories.filter(
      (memory) =>
        (memory.kind === "fact" || memory.kind === "preference") &&
        // A stored key outside the canonical allowlist is a legacy model-invented
        // channel. It stops reaching the prompt immediately, and permanent memory
        // means the row now stays stored but unused until the user deletes it.
        isCanonicalMemoryKey(memory.key),
    );
    const threadSummary = threadSummaryMemory?.value ?? null;
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
      query: currentMessage,
      threadSummary,
    });
    return { block };
  }

  async function persistExtractedMemories(
    env: Bindings,
    tenantId: string,
    message: string,
    telemetry?: AssistantAiTelemetry,
    context?: { threadId: string },
  ) {
    const extraction = deterministicExtract(message);
    if (extraction.forgetAll) {
      await repository.clearMemories(env, tenantId, "fact");
      await repository.clearMemories(env, tenantId, "summary");
    } else {
      for (const key of extraction.forgetKeys) {
        const canonical = canonicalizeMemoryKey(key);
        await repository.deleteMemory(env, tenantId, "fact", canonical);
        await repository.deleteMemory(env, tenantId, "preference", canonical);
      }
    }
    // A "forget" turn is deletion-only: never persist new facts from it.
    const forgetOnly =
      (extraction.forgetAll || extraction.forgetKeys.length > 0) &&
      extraction.memories.length === 0;
    const persist = async (memory: {
      kind: "preference" | "fact" | "summary";
      key: string;
      value: string;
      supersedes?: string[];
      source: "user_stated" | "deterministic" | "model_assisted";
    }) => {
      const clean = sanitizeMemoryValue(memory.value);
      if (!clean || isSensitiveMemory(clean) || containsPromptInjection(clean)) return;
      await repository.upsertMemory(env, tenantId, {
        ...memory,
        key: canonicalizeMemoryKey(memory.key),
        value: clean,
        ...(context?.threadId ? { threadId: context.threadId } : {}),
      });
      for (const old of memory.supersedes ?? []) {
        const canonical = canonicalizeMemoryKey(old);
        const next = canonicalizeMemoryKey(memory.key);
        if (canonical && canonical !== next) {
          // Only facts are replaced. Preferences belong to the Memory panel control,
          // and a model-assisted suggestion must never delete the user's choice.
          await repository.deleteMemory(env, tenantId, "fact", canonical);
        }
      }
    };
    for (const memory of extraction.memories) {
      await persist(memory);
    }
    if (
      !forgetOnly &&
      extraction.needsModelPass &&
      env.ASSISTANT_MEMORY_MODEL_PASS !== "off" &&
      provider &&
      modelMemoryUsage
    ) {
      const consumed = await modelMemoryUsage.tryConsumePass(env, tenantId);
      if (consumed) {
        // Facts and preferences both, so the model can reuse or supersede either key.
        const existing = await repository.listMemories(env, tenantId);
        const extracted = await runModelMemoryPass(env, provider, message, telemetry, {
          existingKeys: existing.map((item) => item.key),
        });
        for (const memory of extracted) {
          await persist(memory);
        }
      }
    }
    // Storage cap with oldest-first eviction, applied after every writer so a model
    // pass cannot leave the tenant over the cap until a later turn. Preferences and
    // user-stated facts are never evicted.
    const storedFacts = await repository.countFacts(env, tenantId);
    if (storedFacts > MAX_MEMORY_FACTS_STORED) {
      await repository.compactFacts(env, tenantId, MAX_MEMORY_FACTS_STORED);
    }
  }

  async function updateThreadSummary(
    env: Bindings,
    tenantId: string,
    threadId: string,
    userMessage: string,
    assistantContent: string,
  ) {
    const prior =
      (await repository.getMemory(env, tenantId, "summary", `thread:${threadId}`))?.value ?? "";
    const combined = [
      prior,
      `User: ${userMessage.slice(0, 200)}`,
      `Assistant: ${assistantContent.slice(0, 300)}`,
    ]
      .filter(Boolean)
      .join(" | ")
      .replace(/\s+/g, " ")
      .trim();
    if (!combined) return;
    // The summary embeds raw user text, so it passes the same guards as every other
    // memory: a message carrying secrets is not worth retaining for the thread's
    // lifetime, and the prior summary stays as it was.
    if (isSensitiveMemory(combined) || containsPromptInjection(combined)) return;
    // Rolling summary: keep the tail so recent decisions survive, cap growth. The cut
    // is trimmed to a word boundary so the injected line never opens mid-word.
    const limit = THREAD_SUMMARY_MAX_CHARACTERS * 2;
    const bounded =
      combined.length > limit
        ? combined
            .slice(-limit)
            .replace(/^\S*\s/, "")
            .trim()
        : combined;
    await repository.upsertMemory(env, tenantId, {
      kind: "summary",
      key: `thread:${threadId}`,
      value: bounded,
      source: "deterministic",
      threadId,
    });
  }

  async function runTurn(
    env: Bindings,
    tenantId: string,
    threadId: string,
    input: AssistantMessageInput,
    execution?: AssistantTurnExecution,
  ): Promise<AssistantTurnResult> {
    const preferences = await requireReadyPreferences(env, tenantId);
    const start = await repository.beginTurn(env, tenantId, threadId, input);
    if (start.duplicate) return start.duplicate;

    let telemetry: AssistantAiTelemetry | undefined;
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

      // One unit per billable provider-backed turn; deterministic policy replies return above.
      // Fail closed: a database error other than the limit abort reaches the catch below and
      // must stop the turn before the provider is called.
      await consumeAiUsage(env, tenantId);
      try {
        telemetry = telemetryFactory(env);
      } catch {
        // Optional observability configuration must never block an assistant turn.
      }
      const { block } = await loadMemoryContext(env, tenantId, start.thread.id, input.message);
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
        telemetry,
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
        await persistExtractedMemories(env, tenantId, input.message, telemetry, {
          threadId: start.thread.id,
        });
        await updateThreadSummary(env, tenantId, start.thread.id, input.message, answer.content);
      } catch {
        // Memory updates are best-effort and must never fail a completed turn.
      }
      telemetry?.finalize(
        answer.finishReason === "validation_fallback" ? "validation_fallback" : "completed",
      );
      return completed;
    } catch (error) {
      telemetry?.finalize(
        error instanceof AssistantProviderError ? "provider_error" : "application_error",
      );
      if (error instanceof AssistantProviderError) reportProviderFailure(error, reporter);
      await repository.failTurn(env, tenantId, start);
      return mapProviderError(error);
    } finally {
      if (telemetry && execution) {
        try {
          execution.defer(telemetry.flush());
        } catch {
          // Deferred telemetry must never alter the assistant response or cleanup.
        }
      }
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

    async createThreadTurn(env, tenantId, input, execution) {
      await requireReadyPreferences(env, tenantId);
      const thread = await repository.createThread(
        env,
        tenantId,
        input.message,
        input.kind === "voice" ? "voice" : "text",
      );
      return runTurn(env, tenantId, thread.id, input, execution);
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

    async updateMemory(env, tenantId, id, value) {
      const clean = sanitizeMemoryValue(value);
      if (!clean || isSensitiveMemory(clean) || containsPromptInjection(clean)) {
        throw new HttpError(400, "invalid_request", "That memory value cannot be saved.");
      }
      const updated = await repository.updateMemoryValue(env, tenantId, id, clean);
      if (!updated) throw new HttpError(404, "memory_not_found", "That memory was not found.");
      return updated;
    },

    async deleteMemoryFact(env, tenantId, id) {
      await repository.deleteMemoryById(env, tenantId, id);
    },
  };
}
