import type { Bindings } from "../types";
import type {
  AssistantProvider,
  AssistantProviderMessage,
  AssistantToolDefinition,
  ProviderCompletion,
  ProviderCompletionRequest,
} from "./provider";

/**
 * Development-only assistant provider. It answers from canned text and never
 * touches the network, so the orchestrator's tool loop, argument validation,
 * and answer validation can be exercised locally and in CI without a paid
 * provider. It is selected only by the explicit flag read in
 * isAssistantStubEnabled and is never reachable in production.
 */
export const STUB_ASSISTANT_PROVIDER = "stub";
export const STUB_ASSISTANT_MODEL = "assistant-stub";

/** Mirrors the orchestrator's per-response tool-call ceiling. */
const MAX_TOOL_CALLS_PER_ROUND = 4;

/**
 * No-argument reads used to exercise the loop on turns whose policy requires no
 * specific group (general education, small talk).
 */
const PROBE_TOOLS = ["list_categories", "get_account_balances"] as const;

/** RequiredToolGroup (turn-policy.ts) to the tool that satisfies it. */
const TOOL_FOR_GROUP: Record<string, string> = {
  account_balance: "get_account_balances",
  period_summary: "get_period_summary",
  category_spending: "get_spending_by_category",
  budget_comparison: "get_budget_vs_actual",
  transaction_detail: "list_transactions",
  category_list: "list_categories",
  recurring: "detect_recurring_charges",
  anomaly: "detect_spending_anomalies",
  debt_projection: "calculate_debt_payoff",
  savings_projection: "calculate_savings_goal",
};

const STUB_HEADER =
  "Offline assistant stub: replies are canned and no external provider was called.";

const STUB_GUIDANCE =
  "General budgeting guidance applies: cover essentials first, keep minimum debt payments current, and put whatever remains toward savings.";

const STUB_NOT_FOUND =
  "I could not find a matching record for that request. Try a different name or a wider date range.";

const POLICY_PATTERN = /TRUSTED SERVER POLICY\n(\{[^\n]*\})/;
const CURRENT_DATE_PATTERN = /Today is (\d{4}-\d{2}-\d{2})/;

/** Env shape for the local-only flag, which stays out of the shared Bindings type. */
type StubBindings = Bindings & { ASSISTANT_PROVIDER?: string };

/**
 * True only when `ASSISTANT_PROVIDER=stub` is set outside production. The
 * production guard uses the same environment signal auth.ts relies on for its
 * local-only dev token, so a stray flag in a deployed environment still
 * resolves the configured provider.
 */
export function isAssistantStubEnabled(env: Bindings): boolean {
  if (env.POSTHOG_AI_ENVIRONMENT === "production") return false;
  return (env as StubBindings).ASSISTANT_PROVIDER?.trim().toLowerCase() === STUB_ASSISTANT_PROVIDER;
}

interface StubTurnPolicy {
  currentDate: string | null;
  resolvedPeriod: { from: string; to: string } | null;
  requiredToolGroups: string[];
}

/**
 * Read the trusted policy the orchestrator embeds in the system prompt. A
 * prompt that does not parse leaves an empty policy; the orchestrator's own
 * validation decides whether the resulting answer is usable.
 */
function readTurnPolicy(messages: readonly AssistantProviderMessage[]): StubTurnPolicy {
  const prompt = messages.find((message) => message.role === "system")?.content ?? "";
  const policy: StubTurnPolicy = {
    currentDate: CURRENT_DATE_PATTERN.exec(prompt)?.[1] ?? null,
    resolvedPeriod: null,
    requiredToolGroups: [],
  };
  const raw = POLICY_PATTERN.exec(prompt)?.[1];
  if (!raw) return policy;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return policy;
    const record = parsed as Record<string, unknown>;
    const groups = record["requiredToolGroups"];
    if (Array.isArray(groups)) {
      policy.requiredToolGroups = groups.filter(
        (group): group is string => typeof group === "string",
      );
    }
    const period = record["resolvedPeriod"];
    if (period && typeof period === "object") {
      const { from, to } = period as Record<string, unknown>;
      if (typeof from === "string" && typeof to === "string") {
        policy.resolvedPeriod = { from, to };
      }
    }
  } catch {
    // Keep the empty policy.
  }
  return policy;
}

/**
 * Arguments that satisfy the orchestrator's validateToolArguments checks, or
 * null when the policy lacks the trusted dates the tool needs.
 */
function toolArguments(name: string, policy: StubTurnPolicy): Record<string, unknown> | null {
  const period = policy.resolvedPeriod;
  switch (name) {
    case "get_account_balances":
    case "list_categories":
      return {};
    case "get_period_summary":
    case "get_spending_by_category":
    case "get_budget_vs_actual":
    case "detect_spending_anomalies":
      return period ? { from: period.from, to: period.to } : null;
    case "list_transactions":
      return period ? { from: period.from, to: period.to } : {};
    case "detect_recurring_charges":
      return policy.currentDate ? { through: policy.currentDate } : null;
    case "calculate_debt_payoff":
      return policy.currentDate ? { strategy: "avalanche", startDate: policy.currentDate } : null;
    case "calculate_savings_goal":
      return policy.currentDate ? { currentDate: policy.currentDate } : null;
    default:
      return null;
  }
}

function requestedToolNames(messages: readonly AssistantProviderMessage[]): Set<string> {
  const names = new Set<string>();
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const call of message.tool_calls ?? []) names.add(call.function.name);
  }
  return names;
}

/**
 * Call every tool group the policy still requires, in policy order, so the
 * orchestrator can satisfy validation in one round. When no group is
 * outstanding, the first call of a turn still probes a no-argument read so
 * dev turns cover the tool path end to end.
 */
function planToolCalls(
  tools: readonly AssistantToolDefinition[],
  alreadyRequested: ReadonlySet<string>,
  policy: StubTurnPolicy,
): Array<{ name: string; arguments: Record<string, unknown> }> {
  const offered = new Set(tools.map((tool) => tool.function.name));
  const planned: Array<{ name: string; arguments: Record<string, unknown> }> = [];
  for (const group of policy.requiredToolGroups) {
    const name = TOOL_FOR_GROUP[group];
    if (!name || !offered.has(name) || alreadyRequested.has(name)) continue;
    const args = toolArguments(name, policy);
    if (args) planned.push({ name, arguments: args });
  }
  if (planned.length > 0) return planned.slice(0, MAX_TOOL_CALLS_PER_ROUND);
  if (alreadyRequested.size > 0) return [];
  const probe = PROBE_TOOLS.find((name) => offered.has(name));
  return probe ? [{ name: probe, arguments: {} }] : [];
}

/**
 * The canned answer stays free of numbers, dates, and tool names so it passes
 * validateAssistantAnswer for every tool shape, except when a tool reported a
 * filter miss, which must be stated plainly.
 */
function finalAnswer(
  messages: readonly AssistantProviderMessage[],
  policy: StubTurnPolicy,
): string {
  const filterMissed = messages.some(
    (message) => message.role === "tool" && message.content.includes('"filterMatched":false'),
  );
  if (filterMissed) return STUB_NOT_FOUND;
  const period = policy.resolvedPeriod;
  return period
    ? `${STUB_HEADER} The trusted period was ${period.from} to ${period.to}. ${STUB_GUIDANCE}`
    : `${STUB_HEADER} ${STUB_GUIDANCE}`;
}

function completeStubTurn(request: ProviderCompletionRequest): ProviderCompletion {
  const policy = readTurnPolicy(request.messages);
  const alreadyRequested = requestedToolNames(request.messages);
  const calls =
    request.toolChoice === "none" ? [] : planToolCalls(request.tools, alreadyRequested, policy);

  if (calls.length === 0) {
    return {
      model: STUB_ASSISTANT_MODEL,
      message: { role: "assistant", content: finalAnswer(request.messages, policy) },
      finishReason: "stop",
    };
  }

  return {
    model: STUB_ASSISTANT_MODEL,
    message: {
      role: "assistant",
      content: null,
      tool_calls: calls.map((call, index) => ({
        id: `stub-call-${alreadyRequested.size + index + 1}`,
        type: "function",
        function: { name: call.name, arguments: JSON.stringify(call.arguments) },
      })),
    },
    finishReason: "tool_calls",
  };
}

export function createAssistantStubProvider(): AssistantProvider {
  return {
    providerName: STUB_ASSISTANT_PROVIDER,
    complete(_env: Bindings, request: ProviderCompletionRequest): Promise<ProviderCompletion> {
      return Promise.resolve(completeStubTurn(request));
    },
  };
}
