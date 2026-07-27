import { HttpError } from "../errors";
import type { Bindings } from "../types";
import type { AssistantHistoryMessage } from "../db/assistant";
import type { FinancialReader } from "./financial-reader";
import { buildAssistantSystemPrompt } from "./prompt";
import type { AssistantProvider, AssistantProviderMessage, ProviderCompletion } from "./provider";
import { AssistantToolError, assistantToolDefinitions, executeAssistantTool } from "./tools";

const MAX_PROVIDER_CALLS = 3;
const MAX_TOOL_CALLS_PER_RESPONSE = 4;
const MAX_TOOL_CALLS_TOTAL = 6;
const MAX_HISTORY_CHARACTERS = 12_000;
const EMPTY_RESPONSE_RETRY_PROMPT =
  "Provide the final answer now in plain text. Use verified tool results already present; if none are present and financial data is needed, call an approved tool.";

export interface AssistantAnswer {
  content: string;
  model: string;
  finishReason: string;
  promptTokens?: number;
  completionTokens?: number;
}

export interface AssistantIdentity {
  assistantName: string;
  userPreferredName: string;
}

export interface AssistantOrchestrator {
  answer(
    env: Bindings,
    tenantId: string,
    history: AssistantHistoryMessage[],
    message: string,
    identity: AssistantIdentity,
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
  timeZone: string,
  identity: AssistantIdentity,
): AssistantProviderMessage[] {
  return [
    {
      role: "system",
      content: buildAssistantSystemPrompt(currentDateInTimeZone(timeZone), timeZone, identity),
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

export function createAssistantOrchestrator(
  provider: AssistantProvider,
  reader: FinancialReader,
): AssistantOrchestrator {
  return {
    async answer(env, tenantId, history, message, identity) {
      const timeZone = env.ASSISTANT_TIME_ZONE?.trim() || "Asia/Manila";
      const messages = providerMessages(history, message, timeZone, identity);
      const overallTimeoutMs = configuredNumber(env.ASSISTANT_OVERALL_TIMEOUT_MS, 25_000);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort("assistant_timeout"), overallTimeoutMs);
      let totalToolCalls = 0;
      let toolValidationErrors = 0;
      const totals: AssistantAnswer = {
        content: "",
        model: env.DEEPSEEK_MODEL?.trim() || "deepseek-v4-flash",
        finishReason: "",
      };

      try {
        for (let invocation = 0; invocation < MAX_PROVIDER_CALLS; invocation += 1) {
          const completion = await provider.complete(env, {
            messages,
            tools: assistantToolDefinitions,
            signal: controller.signal,
          });
          totals.model = completion.model;
          totals.finishReason = completion.finishReason;
          addUsage(totals, completion);

          const toolCalls = completion.message.tool_calls ?? [];
          if (toolCalls.length === 0) {
            const content = completion.message.content?.trim();
            if (!content) {
              if (invocation + 1 < MAX_PROVIDER_CALLS) {
                messages.push({ role: "user", content: EMPTY_RESPONSE_RETRY_PROMPT });
                continue;
              }
              throw new HttpError(
                502,
                "assistant_provider_error",
                "The assistant returned an empty response.",
              );
            }
            totals.content = content;
            return totals;
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
            let content: string;
            try {
              content = await executeAssistantTool(
                reader,
                { env, tenantId },
                toolCall.function.name,
                toolCall.function.arguments,
              );
            } catch (error) {
              toolValidationErrors += 1;
              if (toolValidationErrors > 1) {
                throw new HttpError(
                  502,
                  "assistant_tool_error",
                  "The assistant could not complete a valid financial lookup.",
                );
              }
              content = JSON.stringify({
                error:
                  error instanceof AssistantToolError
                    ? error.message
                    : "The financial lookup could not be completed.",
              });
            }
            messages.push({ role: "tool", tool_call_id: toolCall.id, content });
          }
        }
      } finally {
        clearTimeout(timeout);
      }

      throw new HttpError(
        502,
        "assistant_tool_loop_exceeded",
        "The assistant could not finish within the lookup limit.",
      );
    },
  };
}
