import type { AssistantSourceMetadata, AssistantToolResultEnvelope } from "@zoption/shared";

import type { AssistantToolExecution } from "./tools";
import type { AssistantTurnPolicy, RequiredToolGroup } from "./turn-policy";

const MONEY_PATTERN = /PHP -?\d{1,3}(?:,\d{3})*\.\d{2}/g;
const BARE_MONEY_PATTERN = /(?<![A-Z\d])(?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2}(?!\d|%)/g;
const PERCENT_PATTERN = /-?\d+(?:\.\d+)?%/g;
const ISO_DATE_PATTERN = /\b\d{4}-\d{2}-\d{2}\b/g;
const COUNT_OR_DURATION_PATTERN =
  /\b\d+(?:\.\d+)?\s+(?:transactions?|records?|categories|debts?|goals?|charges?|days?|months?|years?|payments?)\b/gi;
const SHAMING_PATTERN =
  /\b(?:irresponsible|a failure|bad with money|reckless spender|financially careless)\b/i;
const INTERNAL_TOOL_PATTERN =
  /\b(?:get_account_balances|get_period_summary|get_spending_by_category|get_budget_vs_actual|detect_recurring_charges|detect_spending_anomalies|calculate_debt_payoff|calculate_savings_goal|list_transactions|list_categories)\b/i;
const REGULATED_RECOMMENDATION_PATTERN =
  /\b(?:you should|i recommend|best for you|right choice for you)\b.{0,80}\b(?:buy|sell|invest|allocate|file|deduct|insurance|coverage|retirement|will|trust|legal structure)\b/i;

const TOOL_GROUPS: Record<string, RequiredToolGroup | undefined> = {
  get_account_balances: "account_balance",
  get_period_summary: "period_summary",
  get_spending_by_category: "category_spending",
  get_budget_vs_actual: "budget_comparison",
  list_transactions: "transaction_detail",
  list_categories: "category_list",
  detect_recurring_charges: "recurring",
  detect_spending_anomalies: "anomaly",
  calculate_debt_payoff: "debt_projection",
  calculate_savings_goal: "savings_projection",
};

const SOURCE_LABELS: Record<string, string> = {
  get_account_balances: "Account balances",
  get_period_summary: "Period summary",
  get_spending_by_category: "Spending by category",
  get_budget_vs_actual: "Budget versus actual",
  list_transactions: "Transaction details",
  list_categories: "Categories",
  detect_recurring_charges: "Recurring charges",
  detect_spending_anomalies: "Spending anomalies",
  calculate_debt_payoff: "Debt payoff projection",
  calculate_savings_goal: "Savings goal projection",
};

const SENSITIVE_KEY_PATTERN =
  /(?:^|_)(?:id|tenant|user|notes?|secret|token|credential|password|reasoning)(?:_|$)/;
const MAX_AUDIT_ARRAY_ITEMS = 30;
const MAX_AUDIT_STRING_LENGTH = 240;
const MAX_AUDIT_JSON_LENGTH = 12_000;

export interface AssistantAnswerValidation {
  valid: boolean;
  reasons: string[];
}

const PESO_SIGN_PATTERN = /₱\s*/g;

/**
 * Repairs the most common model formatting slip without weakening grounding:
 * ₱ unambiguously denotes Philippine pesos, so rewrite it to the canonical
 * "PHP " prefix before validation. Amount grounding is still enforced by
 * validateAssistantAnswer — a rewritten amount must match backend data
 * exactly — and $, €, £, ¥ stay rejected.
 */
export function canonicalizePesoAmounts(content: string): string {
  return content.replace(PESO_SIGN_PATTERN, "PHP ");
}

export function toolGroupForName(name: string): RequiredToolGroup | undefined {
  return TOOL_GROUPS[name];
}

export function validateToolArguments(
  name: string,
  args: unknown,
  policy: AssistantTurnPolicy,
): string | null {
  if (!args || typeof args !== "object" || Array.isArray(args)) return "invalid_arguments";
  const values = args as Record<string, unknown>;
  const periodTools = new Set([
    "get_period_summary",
    "get_spending_by_category",
    "get_budget_vs_actual",
    "detect_spending_anomalies",
  ]);

  if (periodTools.has(name) && policy.resolvedPeriod) {
    if (values.from !== policy.resolvedPeriod.from || values.to !== policy.resolvedPeriod.to) {
      return "untrusted_period";
    }
  }
  if (name === "list_transactions" && policy.resolvedPeriod) {
    if (values.from !== policy.resolvedPeriod.from || values.to !== policy.resolvedPeriod.to) {
      return "untrusted_period";
    }
  }
  if (name === "detect_recurring_charges" && values.through !== policy.currentDate) {
    return "untrusted_current_date";
  }
  if (name === "calculate_debt_payoff" && values.startDate !== policy.currentDate) {
    return "untrusted_current_date";
  }
  if (name === "calculate_savings_goal" && values.currentDate !== policy.currentDate) {
    return "untrusted_current_date";
  }
  return null;
}

function isEnvelope(value: unknown): value is AssistantToolResultEnvelope<unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return Boolean(record.source && record.dataQuality && "data" in record);
}

export function sourceFromExecution(
  execution: AssistantToolExecution,
): AssistantSourceMetadata | null {
  if (!isEnvelope(execution.result)) return null;
  const limitations = execution.result.dataQuality.signals.map((signal) => signal.message);
  return {
    label: SOURCE_LABELS[execution.name] ?? "Financial records",
    ...execution.result.source,
    dataQualityStatus: execution.result.dataQuality.status,
    limitations,
  };
}

function collectScalars(value: unknown, strings: Set<string>, numbers: Set<string>): void {
  if (typeof value === "string") {
    strings.add(value);
    for (const match of value.matchAll(/-?\d+(?:\.\d+)?/g)) numbers.add(match[0]);
    return;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    numbers.add(String(value));
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectScalars(item, strings, numbers);
    return;
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value as Record<string, unknown>)) {
      collectScalars(item, strings, numbers);
    }
  }
}

function normalizedPercent(value: string): string {
  return value.replace(/%$/, "").replace(/\.0+$/, "");
}

export function validateAssistantAnswer(
  content: string,
  policy: AssistantTurnPolicy,
  executions: readonly AssistantToolExecution[],
  satisfiedGroups: ReadonlySet<RequiredToolGroup>,
): AssistantAnswerValidation {
  const reasons: string[] = [];
  const requiredMissing = policy.requiredToolGroups.filter((group) => !satisfiedGroups.has(group));
  if (requiredMissing.length > 0) reasons.push("required_tools_missing");

  if (/```|<\/?[a-z][^>]*>|\[[^\]]+\]\([^)]+\)|(^|\n)\s*\|.*\|/i.test(content)) {
    reasons.push("unsupported_format");
  }
  if (
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i.test(content)
  ) {
    reasons.push("internal_identifier");
  }
  if (INTERNAL_TOOL_PATTERN.test(content)) reasons.push("internal_tool_name");
  if (SHAMING_PATTERN.test(content)) reasons.push("shaming_language");
  if (/[₱$€£¥]/.test(content)) reasons.push("unsupported_currency_format");
  if (
    policy.compliance.posture === "restricted_topic_education" &&
    REGULATED_RECOMMENDATION_PATTERN.test(content)
  ) {
    reasons.push("regulated_recommendation");
  }

  const allowedStrings = new Set<string>();
  const allowedNumbers = new Set<string>();
  for (const execution of executions)
    collectScalars(execution.result, allowedStrings, allowedNumbers);
  if (policy.resolvedPeriod) collectScalars(policy.resolvedPeriod, allowedStrings, allowedNumbers);
  collectScalars({ currentDate: policy.currentDate }, allowedStrings, allowedNumbers);

  for (const amount of content.match(MONEY_PATTERN) ?? []) {
    if (!allowedStrings.has(amount)) reasons.push("unsupported_money");
  }
  const contentWithoutMoney = content.replace(MONEY_PATTERN, "");
  if (BARE_MONEY_PATTERN.test(contentWithoutMoney)) reasons.push("bare_money");

  for (const percent of content.match(PERCENT_PATTERN) ?? []) {
    if (!allowedNumbers.has(normalizedPercent(percent))) reasons.push("unsupported_percentage");
  }
  for (const date of content.match(ISO_DATE_PATTERN) ?? []) {
    if (!allowedStrings.has(date)) reasons.push("unsupported_date");
  }
  for (const claim of content.match(COUNT_OR_DURATION_PATTERN) ?? []) {
    const numeric = claim.match(/-?\d+(?:\.\d+)?/)?.[0];
    if (numeric && !allowedNumbers.has(numeric)) reasons.push("unsupported_numeric_claim");
  }

  const filterMiss = executions.some((execution) =>
    JSON.stringify(execution.result).includes('"filterMatched":false'),
  );
  if (
    filterMiss &&
    !/\b(?:not found|no matching|could not find|wasn't found|was not found)\b/i.test(content)
  ) {
    reasons.push("filter_miss_substitution");
  }

  return { valid: reasons.length === 0, reasons: [...new Set(reasons)] };
}

function isSensitiveKey(key: string): boolean {
  const snakeCase = key.replace(/[A-Z]/g, (character) => `_${character.toLowerCase()}`);
  return SENSITIVE_KEY_PATTERN.test(snakeCase.toLowerCase());
}

function sanitizeValue(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[truncated]";
  if (typeof value === "string") {
    return value.length <= MAX_AUDIT_STRING_LENGTH
      ? value
      : `${value.slice(0, MAX_AUDIT_STRING_LENGTH - 1)}…`;
  }
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (Array.isArray(value)) {
    return value.slice(0, MAX_AUDIT_ARRAY_ITEMS).map((item) => sanitizeValue(item, depth + 1));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !isSensitiveKey(key))
        .map(([key, item]) => [key, sanitizeValue(item, depth + 1)]),
    );
  }
  return undefined;
}

export function sanitizedAuditJson(value: unknown): string {
  const serialized = JSON.stringify(sanitizeValue(value));
  if (serialized.length <= MAX_AUDIT_JSON_LENGTH) return serialized;
  return JSON.stringify({
    truncated: true,
    preview: serialized.slice(0, MAX_AUDIT_JSON_LENGTH - 40),
  });
}

const REPAIR_GUIDANCE: ReadonlyArray<readonly [string[], string]> = [
  [
    ["unsupported_currency_format", "bare_money", "unsupported_money"],
    "Write every peso amount exactly as shown, e.g. PHP 1,234.56 — never ₱, $, or bare numbers.",
  ],
  [
    ["unsupported_percentage", "unsupported_numeric_claim", "unsupported_date"],
    "Copy percentages, counts, and dates exactly as shown; never compute or reformat them.",
  ],
  [
    ["required_tools_missing"],
    "Call the approved financial tools for the requested period before answering.",
  ],
  [
    ["unsupported_format", "internal_identifier", "internal_tool_name", "shaming_language"],
    "Use plain text only, with no markdown, HTML, tool names, identifiers, or judgmental language.",
  ],
  [
    ["filter_miss_substitution"],
    "If the requested record was not found, say so plainly instead of substituting other data.",
  ],
  [
    ["regulated_recommendation"],
    "Give general education only, without personalized buy, sell, invest, or coverage recommendations.",
  ],
];

export function correctivePrompt(
  validation: AssistantAnswerValidation,
  policy: AssistantTurnPolicy,
  executions: readonly AssistantToolExecution[],
): string {
  const repairs = REPAIR_GUIDANCE.filter(([codes]) =>
    codes.some((code) => validation.reasons.includes(code)),
  ).map(([, guidance]) => guidance);
  const repairSuffix = repairs.length > 0 ? ` Repair: ${repairs.join(" ")}` : "";
  return `Your draft could not be accepted because: ${validation.reasons.join(", ")}.${repairSuffix} Provide one corrected plain-text final answer. Use only exact facts in this trusted JSON and do not mention tools or validation: ${sanitizedAuditJson(
    {
      resolvedPeriod: policy.resolvedPeriod,
      compliance: policy.compliance,
      results: executions.map((execution) => execution.result),
    },
  )}`;
}

/**
 * Last-resort answer for a single-group total-spend question whose model
 * drafts kept failing grounding validation. Copies the backend-supplied
 * expense total and trusted period verbatim, so the result passes
 * validateAssistantAnswer by construction (verified below before returning).
 * Returns null for every other shape — multi-group questions still need the
 * model to synthesize across tools, and filter misses still need a plain
 * not-found answer rather than a substituted total.
 */
export function deterministicPeriodSummaryAnswer(
  policy: AssistantTurnPolicy,
  executions: readonly AssistantToolExecution[],
  satisfiedGroups: ReadonlySet<RequiredToolGroup>,
): string | null {
  if (policy.requiredToolGroups.length !== 1 || policy.requiredToolGroups[0] !== "period_summary") {
    return null;
  }
  if (!satisfiedGroups.has("period_summary") || !policy.resolvedPeriod) return null;
  if (
    executions.some((execution) =>
      JSON.stringify(execution.result).includes('"filterMatched":false'),
    )
  ) {
    return null;
  }
  const summary = [...executions]
    .reverse()
    .find((execution) => execution.name === "get_period_summary" && isEnvelope(execution.result));
  if (!summary || !isEnvelope(summary.result)) return null;
  if (summary.result.dataQuality.status === "insufficient") return null;
  const data =
    summary.result.data && typeof summary.result.data === "object"
      ? (summary.result.data as Record<string, unknown>)
      : null;
  const expenses = data?.["expenses"];
  if (typeof expenses !== "string" || !/^PHP -?\d{1,3}(?:,\d{3})*\.\d{2}$/.test(expenses)) {
    return null;
  }
  const args =
    summary.arguments && typeof summary.arguments === "object" && !Array.isArray(summary.arguments)
      ? (summary.arguments as Record<string, unknown>)
      : null;
  const accountName = args?.["accountName"];
  const qualifier =
    typeof accountName === "string" && accountName.trim() ? ` for ${accountName.trim()}` : "";
  const content = `From ${policy.resolvedPeriod.from} to ${policy.resolvedPeriod.to}, your recorded expenses${qualifier} were ${expenses}.`;
  return validateAssistantAnswer(content, policy, executions, satisfiedGroups).valid ? content : null;
}

export function safeFallback(policy: AssistantTurnPolicy): string {
  if (policy.requiredToolGroups.length > 0) {
    return "I couldn’t safely verify a complete answer from the available financial records. Please try a narrower question or a specific date range.";
  }
  return "I couldn’t safely verify that response. Please rephrase the question and try again.";
}
