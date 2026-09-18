import type { AssistantSourceMetadata, AssistantToolResultEnvelope } from "@zoption/shared";

import type { AssistantToolExecution } from "./tools";
import type { AssistantTurnPolicy, RequiredToolGroup } from "./turn-policy";

// Every numeric token in a final answer, whatever its decoration: an optional sign
// (a minus glued to a preceding digit is a range separator, not a sign), grouped
// thousands, and any number of decimal places.
const NUMERIC_TOKEN_PATTERN = /(?<![\d,])-?\d[\d,]*(?:\.\d+)?/g;
const PERCENT_PATTERN = /-?\d+(?:\.\d+)?%/g;
// Integer slash sequences such as the 50/30/20 budgeting rule are a ratio, not an
// amount: a decimal part anywhere in the sequence disqualifies it.
const RATIO_PATTERN = /(?<![\d.,])\d[\d,]*(?:\/\d[\d,]*)+(?![\d.,])/g;
const ISO_DATE_PATTERN = /\b\d{4}-\d{2}-\d{2}\b/g;
const COUNT_OR_DURATION_PATTERN =
  /\b\d[\d,]*(?:\.\d+)?(?:\s+na)?\s+(?:transactions?|records?|categories|debts?|goals?|charges?|days?|months?|years?|payments?|transaksyon|kategorya|utang|layunin|bayarin|araw|buwan|taon|bayad)\b/gi;
const SHAMING_PATTERN =
  /\b(?:irresponsible|a failure|bad with money|reckless spender|financially careless|iresponsable|bobo sa pera|aksaya sa pera|pabaya sa pera)\b/i;
const INTERNAL_TOOL_PATTERN =
  /\b(?:get_account_balances|get_period_summary|get_spending_by_category|get_budget_vs_actual|detect_recurring_charges|detect_spending_anomalies|calculate_debt_payoff|calculate_savings_goal|list_transactions|list_categories)\b/i;
const REGULATED_RECOMMENDATION_PATTERN =
  /\b(?:you should|i recommend|best for you|right choice for you|dapat kang|inirerekomenda ko|pinakamainam para sa iyo)\b.{0,80}\b(?:buy|sell|invest|allocate|file|deduct|insurance|coverage|retirement|will|trust|legal structure|bumili|ibenta|mamuhunan|mag-invest|seguro|buwis|huling habilin|pensyon)\b/i;

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

const PERIOD_TOOL_NAMES = new Set([
  "get_period_summary",
  "get_spending_by_category",
  "get_budget_vs_actual",
  "detect_spending_anomalies",
  "list_transactions",
]);

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
 * validateAssistantAnswer — a rewritten amount must still trace to a tool
 * result — and $, €, £, ¥ stay rejected.
 */
export function canonicalizePesoAmounts(content: string): string {
  return content.replace(PESO_SIGN_PATTERN, "PHP ");
}

/**
 * The value a numeric token denotes, independent of formatting: "12,345.60",
 * "12345.6" and "012345.600" all normalize to "12345.6".
 */
function normalizedNumber(token: string): string {
  const [whole = "0", fraction = ""] = token.replace(/,/g, "").split(".");
  const sign = whole.startsWith("-") ? "-" : "";
  const digits = (sign ? whole.slice(1) : whole).replace(/^0+(?=\d)/, "");
  const decimals = fraction.replace(/0+$/, "");
  return `${sign}${digits}${decimals ? `.${decimals}` : ""}`;
}

// A money-shaped numeral carries a decimal part or sits next to a currency or
// centavo word. Plain integers in ordinary prose ("3 buckets", the 50/30/20 rule)
// are counts or ratios, and treating them as amounts would refuse general
// education prose the tools never produced a figure for.
const CURRENCY_BEFORE = /(?:\bPHP|\bpesos?|\bcentavos?|₱)\s*-?\s*$/i;
const CURRENCY_AFTER = /^\s*-?\s*(?:\bPHP|\bpesos?|\bcentavos?|₱)/i;

function isMoneyToken(content: string, token: string, index: number): boolean {
  if (token.includes(".")) return true;
  const before = content.slice(Math.max(0, index - 16), index);
  const after = content.slice(index + token.length, index + token.length + 16);
  return CURRENCY_BEFORE.test(before) || CURRENCY_AFTER.test(after);
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

  if (PERIOD_TOOL_NAMES.has(name)) {
    // Fail closed when no period resolved: without a trusted range the model would
    // be choosing its own disclosure window, which is exactly what the trusted
    // policy exists to prevent.
    const period = policy.resolvedPeriod;
    if (!period || values.from !== period.from || values.to !== period.to) {
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
    for (const token of value.match(NUMERIC_TOKEN_PATTERN) ?? []) {
      numbers.add(normalizedNumber(token));
    }
    return;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    numbers.add(normalizedNumber(String(value)));
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

  // Amount grounding is structural: a money-shaped numeral must trace to a tool
  // result, the trusted period, or the current date, whatever its currency
  // decoration or decimal count. Percentages, integer ratios, counts, and dates
  // carry their own rules, so education prose such as the 50/30/20 rule is not
  // read as a peso figure.
  const amountScan = content.replace(PERCENT_PATTERN, "").replace(RATIO_PATTERN, "");
  for (const match of amountScan.matchAll(NUMERIC_TOKEN_PATTERN)) {
    const token = match[0];
    if (!isMoneyToken(amountScan, token, match.index ?? 0)) continue;
    if (!allowedNumbers.has(normalizedNumber(token))) reasons.push("unsupported_money");
  }

  for (const percent of content.match(PERCENT_PATTERN) ?? []) {
    if (!allowedNumbers.has(normalizedNumber(percent.replace(/%$/, "")))) {
      reasons.push("unsupported_percentage");
    }
  }
  for (const date of content.match(ISO_DATE_PATTERN) ?? []) {
    if (!allowedStrings.has(date)) reasons.push("unsupported_date");
  }
  for (const claim of content.match(COUNT_OR_DURATION_PATTERN) ?? []) {
    const numeric = claim.match(/\d[\d,]*(?:\.\d+)?/)?.[0];
    if (numeric && !allowedNumbers.has(normalizedNumber(numeric))) {
      reasons.push("unsupported_numeric_claim");
    }
  }

  const filterMiss = executions.some((execution) =>
    JSON.stringify(execution.result).includes('"filterMatched":false'),
  );
  if (
    filterMiss &&
    !/\b(?:not found|no matching|could not find|wasn't found|was not found|hindi nahanap|walang nahanap|walang tugma)\b/i.test(
      content,
    )
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
    ["unsupported_currency_format", "unsupported_money"],
    "Copy money amounts exactly as shown, e.g. PHP 1,234.56 — never ₱, $, or a number that is not in the tool results.",
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
  return validateAssistantAnswer(content, policy, executions, satisfiedGroups).valid
    ? content
    : null;
}

export function safeFallback(policy: AssistantTurnPolicy): string {
  if (policy.requiredToolGroups.length > 0) {
    return "I couldn’t safely verify a complete answer from the available financial records. Please try a narrower question or a specific date range.";
  }
  return "I couldn’t safely verify that response. Please rephrase the question and try again.";
}
