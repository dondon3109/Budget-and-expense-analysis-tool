import { HttpError } from "../errors";
import type { Bindings } from "../types";
import type {
  AssistantAuditToolCall,
  AssistantHistoryMessage,
  AssistantRunAudit,
} from "../db/assistant";
import type { AssistantResponseMetadata } from "@zoption/shared";
import {
  canonicalizePesoAmounts,
  correctivePrompt,
  deterministicPeriodSummaryAnswer,
  safeFallback,
  sanitizedAuditJson,
  sourceFromExecution,
  toolGroupForName,
  validateAssistantAnswer,
  validateToolArguments,
} from "./answer-validation";
import type { FinancialReader } from "./financial-reader";
import type { AssistantAiTelemetry } from "./posthog-ai";
import { ASSISTANT_PROMPT_VERSION, buildAssistantSystemPrompt } from "./prompt";
import {
  createAssistantTurnPolicy,
  responseMetadataForPolicy,
  serializeTurnPolicy,
  type AssistantTurnPolicy,
  type RequiredToolGroup,
} from "./turn-policy";
import type { AssistantProvider, AssistantProviderMessage, ProviderCompletion } from "./provider";
import {
  AssistantToolError,
  assistantToolDefinitions,
  executeAssistantToolDetailed,
  type AssistantToolExecution,
} from "./tools";

const MAX_PROVIDER_CALLS = 4;
const MAX_TOOL_CALLS_PER_RESPONSE = 4;
const MAX_TOOL_CALLS_TOTAL = 6;
const MAX_HISTORY_CHARACTERS = 12_000;
const MAX_TOOL_VALIDATION_ERRORS = 2;
const EMPTY_RESPONSE_RETRY_PROMPT =
  "Provide the final answer now in plain text. Use verified tool results already present; if none are present and financial data is needed, call an approved tool.";
const REQUIRED_TOOL_RETRY_PROMPT =
  "Required financial lookups are still missing. Call the approved tools needed by the trusted server policy before answering.";

export interface AssistantAnswer {
  content: string;
  model: string;
  finishReason: string;
  promptTokens?: number;
  completionTokens?: number;
  responseMetadata: AssistantResponseMetadata;
  audit: AssistantRunAudit;
}

export interface AssistantIdentity {
  assistantName: string;
  userPreferredName: string;
  responseDetail: "concise" | "standard";
  coachingStyle: "gentle" | "direct";
}

export interface AssistantOrchestrator {
  plan(
    env: Bindings,
    tenantId: string,
    history: AssistantHistoryMessage[],
    message: string,
  ): Promise<AssistantTurnPolicy>;
  answer(
    env: Bindings,
    tenantId: string,
    history: AssistantHistoryMessage[],
    message: string,
    identity: AssistantIdentity,
    policy: AssistantTurnPolicy,
    memory: string,
    telemetry?: AssistantAiTelemetry,
  ): Promise<AssistantAnswer>;
}

function configuredNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function currentDateInTimeZone(timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return `${values.get("year")}-${values.get("month")}-${values.get("day")}`;
}

function boundedHistory(history: AssistantHistoryMessage[]): AssistantHistoryMessage[] {
  const selected: AssistantHistoryMessage[] = [];
  let characters = 0;
  for (const item of [...history].reverse()) {
    const next = item.content.length;
    if (characters + next > MAX_HISTORY_CHARACTERS) break;
    selected.push(item);
    characters += next;
  }
  return selected.reverse();
}

function providerMessages(
  history: AssistantHistoryMessage[],
  message: string,
  identity: AssistantIdentity,
  policy: AssistantTurnPolicy,
  memory: string,
): AssistantProviderMessage[] {
  return [
    {
      role: "system",
      content: buildAssistantSystemPrompt(
        policy.currentDate,
        policy.timeZone,
        identity,
        policy,
        memory,
      ),
    },
    ...boundedHistory(history).map((item) => ({ role: item.role, content: item.content }) as const),
    { role: "user", content: message },
  ];
}

function addUsage(total: AssistantAnswer, completion: ProviderCompletion) {
  total.promptTokens = (total.promptTokens ?? 0) + (completion.usage?.promptTokens ?? 0);
  total.completionTokens =
    (total.completionTokens ?? 0) + (completion.usage?.completionTokens ?? 0);
}

function parseAuditArguments(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return { invalidJson: true };
  }
}

function auditForPolicy(
  policy: AssistantTurnPolicy,
  providerCallCount: number,
  validationStatus: AssistantRunAudit["validationStatus"],
  toolCalls: AssistantAuditToolCall[],
): AssistantRunAudit {
  return {
    promptVersion: ASSISTANT_PROMPT_VERSION,
    compliancePolicyJson: serializeTurnPolicy(policy),
    ...(policy.resolvedPeriod ? { resolvedPeriodJson: JSON.stringify(policy.resolvedPeriod) } : {}),
    requiredToolGroupsJson: JSON.stringify(policy.requiredToolGroups),
    providerCallCount,
    validationStatus,
    toolCalls,
  };
}

function responseMetadata(
  policy: AssistantTurnPolicy,
  executions: readonly AssistantToolExecution[],
): AssistantResponseMetadata {
  const sources = executions
    .map(sourceFromExecution)
    .filter((source): source is NonNullable<typeof source> => source !== null);
  return responseMetadataForPolicy(policy, sources, ASSISTANT_PROMPT_VERSION);
}

export function createAssistantOrchestrator(
  provider: AssistantProvider,
  reader: FinancialReader,
): AssistantOrchestrator {
  return {
    async plan(env, tenantId, history, message) {
      const timeZone = env.ASSISTANT_TIME_ZONE?.trim() || "Asia/Manila";
      const currentDate = currentDateInTimeZone(timeZone);
      const transactionBounds = await reader.getTransactionDateBounds({ env, tenantId });
      return createAssistantTurnPolicy({
        history,
        message,
        currentDate,
        timeZone,
        transactionBounds,
      });
    },

    async answer(env, tenantId, history, message, identity, policy, memory, telemetry) {
      if (policy.deterministicResponse) {
        return {
          content: policy.deterministicResponse,
          model: "zoption-turn-policy",
          finishReason: "policy",
          responseMetadata: responseMetadataForPolicy(policy, [], ASSISTANT_PROMPT_VERSION),
          audit: auditForPolicy(policy, 0, "not_required", []),
        };
      }

      const messages = providerMessages(history, message, identity, policy, memory);
      // A turn can need all four provider calls (tool round, draft, corrective
      // retry) at up to the per-call provider ceiling each, plus tool time, so
      // the overall budget must comfortably exceed 4 x provider timeout.
      const overallTimeoutMs = configuredNumber(env.ASSISTANT_OVERALL_TIMEOUT_MS, 60_000);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort("assistant_timeout"), overallTimeoutMs);
      let totalToolCalls = 0;
      let toolValidationErrors = 0;
      let providerCallCount = 0;
      let answerValidationRetryUsed = false;
      const executions: AssistantToolExecution[] = [];
      const satisfiedGroups = new Set<RequiredToolGroup>();
      const auditToolCalls: AssistantAuditToolCall[] = [];
      const totals: AssistantAnswer = {
        content: "",
        model: env.DEEPSEEK_MODEL?.trim() || "deepseek-v4-flash",
        finishReason: "",
        responseMetadata: responseMetadataForPolicy(policy, [], ASSISTANT_PROMPT_VERSION),
        audit: auditForPolicy(policy, 0, "fallback", []),
      };

      // Every refusal path funnels through here so a total-spend question
      // with good tool data still gets its verified total instead of a
      // refusal when the model drafts keep failing grounding validation.
      const finishFallback = (): AssistantAnswer => {
        const deterministic = deterministicPeriodSummaryAnswer(policy, executions, satisfiedGroups);
        if (deterministic) {
          totals.content = deterministic;
          totals.finishReason = "deterministic";
          totals.responseMetadata = responseMetadata(policy, executions);
          totals.audit = auditForPolicy(policy, providerCallCount, "passed", auditToolCalls);
          return totals;
        }
        totals.content = safeFallback(policy);
        totals.finishReason = "validation_fallback";
        totals.responseMetadata = responseMetadata(policy, executions);
        totals.audit = auditForPolicy(policy, providerCallCount, "fallback", auditToolCalls);
        return totals;
      };

      try {
        for (let invocation = 0; invocation < MAX_PROVIDER_CALLS; invocation += 1) {
          const missingRequiredGroups = policy.requiredToolGroups.filter(
            (group) => !satisfiedGroups.has(group),
          );
          const request = {
            messages,
            tools: assistantToolDefinitions,
            toolChoice:
              missingRequiredGroups.length > 0
                ? ("required" as const)
                : answerValidationRetryUsed
                  ? ("none" as const)
                  : ("auto" as const),
            signal: controller.signal,
          };
          const completion = telemetry
            ? await telemetry.complete("assistant_answer", provider, env, request)
            : await provider.complete(env, request);
          providerCallCount += 1;
          totals.model = completion.model;
          totals.finishReason = completion.finishReason;
          addUsage(totals, completion);

          const toolCalls = completion.message.tool_calls ?? [];
          if (toolCalls.length === 0) {
            const content = canonicalizePesoAmounts(completion.message.content?.trim() ?? "");
            if (!content) {
              if (invocation + 1 < MAX_PROVIDER_CALLS) {
                messages.push({ role: "user", content: EMPTY_RESPONSE_RETRY_PROMPT });
                continue;
              }
              return finishFallback();
            }

            const validation = validateAssistantAnswer(
              content,
              policy,
              executions,
              satisfiedGroups,
            );
            if (validation.valid) {
              totals.content = content;
              totals.responseMetadata = responseMetadata(policy, executions);
              totals.audit = auditForPolicy(policy, providerCallCount, "passed", auditToolCalls);
              return totals;
            }

            console.warn(
              `[assistant-validation] Draft rejected: reasons=[${validation.reasons.join(", ")}] draft=${JSON.stringify(content)}`,
            );

            if (!answerValidationRetryUsed && invocation + 1 < MAX_PROVIDER_CALLS) {
              answerValidationRetryUsed = true;
              messages.push({ role: "assistant", content });
              messages.push({
                role: "user",
                content:
                  missingRequiredGroups.length > 0
                    ? REQUIRED_TOOL_RETRY_PROMPT
                    : correctivePrompt(validation, policy, executions),
              });
              continue;
            }

            console.warn(
              `[assistant-validation] Fallback to safe response for question: ${JSON.stringify(message)}`,
            );

            return finishFallback();
          }

          if (toolCalls.length > MAX_TOOL_CALLS_PER_RESPONSE) {
            throw new HttpError(
              502,
              "assistant_tool_loop_exceeded",
              "The assistant requested too many financial lookups.",
            );
          }
          totalToolCalls += toolCalls.length;
          if (totalToolCalls > MAX_TOOL_CALLS_TOTAL) {
            throw new HttpError(
              502,
              "assistant_tool_loop_exceeded",
              "The assistant requested too many financial lookups.",
            );
          }

          messages.push(completion.message);
          for (const toolCall of toolCalls) {
            const sequence = auditToolCalls.length + 1;
            try {
              const execution = await executeAssistantToolDetailed(
                reader,
                { env, tenantId },
                toolCall.function.name,
                toolCall.function.arguments,
                (name, args) => validateToolArguments(name, args, policy),
              );
              executions.push(execution);
              const group = toolGroupForName(execution.name);
              if (group) satisfiedGroups.add(group);
              auditToolCalls.push({
                sequence,
                toolName: execution.name,
                argumentsJson: sanitizedAuditJson(execution.arguments),
                resultJson: sanitizedAuditJson(execution.result),
              });
              messages.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: execution.content,
              });
            } catch (error) {
              toolValidationErrors += 1;
              const errorCode =
                error instanceof AssistantToolError ? error.message : "financial_lookup_failed";
              auditToolCalls.push({
                sequence,
                toolName: toolCall.function.name,
                argumentsJson: sanitizedAuditJson(parseAuditArguments(toolCall.function.arguments)),
                errorCode,
              });
              if (toolValidationErrors > MAX_TOOL_VALIDATION_ERRORS) {
                throw new HttpError(
                  502,
                  "assistant_tool_error",
                  "The assistant could not complete a valid financial lookup.",
                );
              }
              messages.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: JSON.stringify({
                  error: errorCode,
                  instruction:
                    "Use the trusted server policy dates and a valid approved tool request.",
                }),
              });
            }
          }
        }
      } finally {
        clearTimeout(timeout);
      }

      return finishFallback();
    },
  };
}
