import type {
  AssistantDebtStrategy,
  AssistantMemory,
  AssistantMemoryKind,
  AssistantMemorySource,
  AssistantResponseDetail,
  AssistantCoachingStyle,
} from "@zoption/shared";

import type { Bindings } from "../types";
import type { AssistantAiTelemetry } from "./posthog-ai";
import type { AssistantProvider, AssistantProviderMessage } from "./provider";

export const MAX_MEMORY_CHARACTERS = 6_000;
export const MAX_FACT_LENGTH = 240;
export const MAX_MEMORY_FACTS_INJECTED = 12;
export const MAX_MEMORY_FACTS_STORED = 50;

export interface ExtractedMemory {
  kind: AssistantMemoryKind;
  key: string;
  value: string;
  supersedes?: string[];
  source: AssistantMemorySource;
}

export interface ExtractionResult {
  memories: ExtractedMemory[];
  needsModelPass: boolean;
  forgetAll: boolean;
  forgetKeys: string[];
}

const SECRET_PATTERNS: RegExp[] = [
  /\b(?:password|passphrase|secret|api[_-]?key|token)\b\s*[:=]/i,
  /\b(?:[1-9]\d{3}[-\s]?){3}[1-9]\d{3}\b/,
  /\b\d{3}[-\s]?\d{3}[-\s]?\d{4}\b/,
  /\b09\d{2}[-\s]?\d{3}[-\s]?\d{4}\b/,
  /(?:client[_-]?secret|service[_-]?role)/i,
  /\b(?:gcash|maya|grabpay|bank|account)\b[^0-9]{0,20}\d{6,}/i,
  /\bcvv\b\s*[:=]?\s*\d{3,4}/i,
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/,
  /\b(?:pin|otp)\b\s*[:=]?\s*\d{4,8}/i,
];

const PROMPT_INJECTION_PATTERNS: RegExp[] = [
  /ignore (?:all |your |previous |above )?instructions/i,
  /disregard (?:all |your |previous )?instructions/i,
  /you are now /i,
  /reveal (?:your )?(?:system prompt|hidden prompt|instructions|secrets?)/i,
  /jailbreak/i,
];

// Strip ASCII control characters from user-provided memory values. This regex is
// intentional: it matches control code points (0x00–0x1F and 0x7F) for removal.
// eslint-disable-next-line no-control-regex
const CONTROL_PATTERN = /[\u0000-\u001F\u007F]/g;
const WHITESPACE_PATTERN = /\s+/g;

export function sanitizeMemoryValue(value: string): string {
  const collapsed = value.replace(CONTROL_PATTERN, " ").replace(WHITESPACE_PATTERN, " ").trim();
  return collapsed.length > MAX_FACT_LENGTH
    ? `${collapsed.slice(0, MAX_FACT_LENGTH - 1).trimEnd()}…`
    : collapsed;
}

export function isSensitiveMemory(value: string): boolean {
  return SECRET_PATTERNS.some((pattern) => pattern.test(value));
}

export function containsPromptInjection(value: string): boolean {
  return PROMPT_INJECTION_PATTERNS.some((pattern) => pattern.test(value));
}

// One key per concept: duplicate keys for the same fact would let the
// deterministic and model-assisted passes store two memories for one statement.
const MEMORY_CANONICAL_KEYS = [
  "debt_strategy",
  "emergency_fund_target",
  "savings_target",
  "monthly_budget_cap",
  "checking_buffer",
  "payday_schedule",
  "budget_preference",
  "recurring_bill",
  "savings_rule",
  "spending_rule",
  "coaching_preference",
] as const;

const KEY_ALIASES: Record<string, string> = {
  pay_smallest_first: "debt_strategy",
  smallest_debt_first: "debt_strategy",
  debt_rule: "debt_strategy",
  avalanche_method: "debt_strategy",
  snowball_method: "debt_strategy",
  emergency_savings: "emergency_fund_target",
  emergency_savings_target: "emergency_fund_target",
  monthly_budget: "monthly_budget_cap",
  spending_limit: "monthly_budget_cap",
  budget_cap: "monthly_budget_cap",
  buffer_amount: "checking_buffer",
  payday: "payday_schedule",
  salary_date: "payday_schedule",
};

export function canonicalizeMemoryKey(key: string): string {
  const normalized = key
    .replace(/[^a-z0-9_.]/gi, "_")
    .toLowerCase()
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
  return KEY_ALIASES[normalized] ?? normalized;
}

/** Rejects dates, identifiers, and absurd figures that would otherwise read as money. */
function isValidAmount(raw: string | undefined): boolean {
  if (!raw) return false;
  const amount = Number(raw.replace(/[,₱\s]/g, "").replace(/^php/i, ""));
  return Number.isFinite(amount) && amount > 0 && amount <= 9_000_000_000_000;
}

/** Questions describe nothing durable, so they never become memories. */
function isQuestion(message: string): boolean {
  return message.trim().endsWith("?");
}

const AMOUNT_VERB = String.raw`(?:target|goal|aim(?:ing)?|want(?:ing)?|need(?:ing)?|build|cap|limit|budget|save|saving|keep|gastos|badyet)`;

function snippetAround(message: string, index: number | undefined): string {
  const at = index ?? 0;
  return sanitizeMemoryValue(message.slice(Math.max(0, at - 30), at + 60));
}

function extractDebtStrategy(message: string): ExtractedMemory | null {
  if (isQuestion(message) || !/\b(?:avalanche|snowball)\b/i.test(message)) return null;
  const strategy: AssistantDebtStrategy = /\bavalanche\b/i.test(message) ? "avalanche" : "snowball";
  return { kind: "preference", key: "debt_strategy", value: strategy, source: "deterministic" };
}

function extractSavingsGoal(message: string): ExtractedMemory | null {
  if (
    isQuestion(message) ||
    !/\b(?:emergency fund|sinking fund|emergency savings|rainy day|ipon|target savings)\b/i.test(
      message,
    )
  )
    return null;
  const amount = new RegExp(
    `${AMOUNT_VERB}\\b[^0-9]{0,40}(?:₱|php\\s?)?\\s?([0-9][0-9,.]*)`,
    "i",
  ).exec(message);
  if (!amount) return null;
  return {
    kind: "fact",
    key: "emergency_fund_target",
    value: snippetAround(message, amount.index),
    source: "deterministic",
  };
}

function extractBudgetCap(message: string): ExtractedMemory | null {
  // Generic "cap"/"limit" wording is usually a credit or transfer limit, not a budget.
  if (isQuestion(message) || !/\b(?:budget|badyet|gastos|spending limit)\b/i.test(message))
    return null;
  const amount = new RegExp(
    `${AMOUNT_VERB}[^0-9]{0,40}(?:₱|php\\s?)?\\s?([0-9][0-9,.]*)`,
    "i",
  ).exec(message);
  if (!amount || !isValidAmount(amount[1])) return null;
  return {
    kind: "fact",
    key: "monthly_budget_cap",
    value: snippetAround(message, amount.index),
    source: "deterministic",
  };
}

const BUFFER_VERB = /\b(?:keep|maintain|leave|retain|matira|panatilihin|itira)\w*\b/i;
const BUFFER_AMOUNT =
  /(?:keep|maintain|leave|retain|matira|panatilihin|itira)\w*[^0-9]{0,50}(?:₱|php\s?)?\s?([0-9][0-9,]*)/i;

function extractCheckingBuffer(message: string): ExtractedMemory | null {
  // A balance snapshot ("my checking is 5,000") is not a buffer; the user must state a rule.
  if (
    isQuestion(message) ||
    !/\b(?:checking|buffer|account)\b/i.test(message) ||
    !BUFFER_VERB.test(message)
  )
    return null;
  const amount = BUFFER_AMOUNT.exec(message);
  if (!amount || !isValidAmount(amount[1])) return null;
  return {
    kind: "fact",
    key: "checking_buffer",
    value: snippetAround(message, amount.index),
    source: "deterministic",
  };
}

const PAYDAY_NOUN = /\b(?:payday|pay day|sahod|sweldo|kinsenas|katapusan)\b/i;

function extractPayday(message: string): ExtractedMemory | null {
  // Bare dates ("the 15th") and salary figures are not pay schedules.
  if (!PAYDAY_NOUN.test(message) || isQuestion(message)) return null;
  return {
    kind: "fact",
    key: "payday_schedule",
    value: sanitizeMemoryValue(message.slice(0, 160)),
    source: "deterministic",
  };
}

const BILL_NOUN =
  /\b(?:bill|bills|subscription|subscriptions|premium|premiums|dues|bayarin|bayad)\b/i;
const RECURRING_MARKER =
  /\b(?:every|each|remind me|remember|month(?:ly)?|week(?:ly)?|year(?:ly)?|annual(?:ly)?|quarter(?:ly)?|buwanan)\b/i;

function extractRecurringBill(message: string): ExtractedMemory | null {
  // "How much is my phone bill?" is a question, and "pay my bill" is a one-off request,
  // so only a bill named with a recurrence marker becomes a memory.
  if (isQuestion(message) || !BILL_NOUN.test(message) || !RECURRING_MARKER.test(message))
    return null;
  return {
    kind: "fact",
    key: "recurring_bill",
    value: sanitizeMemoryValue(message.slice(0, 160)),
    source: "deterministic",
  };
}

const FORGET_NEGATION = /\b(?:not|never|don'?t|doesn'?t|didn'?t|won'?t|can'?t)\s+forget\b/i;

export function detectForgetIntent(message: string): { forgetAll: boolean; keys: string[] } {
  // "Don't forget my budget" is a reminder, not a deletion request.
  if (FORGET_NEGATION.test(message)) return { forgetAll: false, keys: [] };
  if (
    /\bforget\b[^.]{0,20}\b(?:everything|it all|all memory|all memories|all of this|all facts)\b/i.test(
      message,
    )
  )
    return { forgetAll: true, keys: [] };
  const keys: string[] = [];
  if (/\bforget\b[^.]{0,60}\bemergency fund\b/i.test(message)) keys.push("emergency_fund_target");
  if (/\bforget\b[^.]{0,60}\bbudget\b/i.test(message)) keys.push("monthly_budget_cap");
  if (/\bforget\b[^.]{0,60}\bdebt strategy\b/i.test(message)) keys.push("debt_strategy");
  return { forgetAll: false, keys };
}

const MODEL_PASS_SIGNAL =
  /\b(?:my rule(?: of thumb)? is|i (?:prefer|always|usually|never|try to)|i pay(?: off)? .* first|remember that|from now on|from today|tandaan|gusto ko|ayoko|dapat|palagi|lagi)\b/i;

export function deterministicExtract(message: string): ExtractionResult {
  const memories: ExtractedMemory[] = [];
  const seen = new Set<string>();
  const push = (memory: ExtractedMemory | null) => {
    if (!memory) return;
    if (
      seen.has(memory.key) ||
      isSensitiveMemory(memory.value) ||
      containsPromptInjection(memory.value)
    )
      return;
    seen.add(memory.key);
    memories.push(memory);
  };
  push(extractDebtStrategy(message));
  push(extractSavingsGoal(message));
  push(extractBudgetCap(message));
  push(extractCheckingBuffer(message));
  push(extractPayday(message));
  push(extractRecurringBill(message));
  const { keys, forgetAll } = detectForgetIntent(message);
  return { memories, needsModelPass: MODEL_PASS_SIGNAL.test(message), forgetAll, forgetKeys: keys };
}

export function scoreMemoryForQuery(memory: AssistantMemory, query: string): number {
  const haystack = `${memory.key} ${memory.value}`.toLowerCase();
  const tokens = query
    .toLowerCase()
    .split(/[^a-z0-9₱]+/g)
    .filter(
      (token) =>
        token.length > 2 &&
        !/^(the|and|for|with|what|how|much|did|are|was|from|last|this)$/.test(token),
    );
  let score = 0;
  for (const token of tokens) {
    if (memory.key.toLowerCase().includes(token)) score += 3;
    else if (haystack.includes(token)) score += 1;
  }
  if (memory.kind === "preference") score += 1;
  return score;
}

export function selectRelevantMemories(
  memories: AssistantMemory[],
  query: string,
): AssistantMemory[] {
  const scored = memories.map((memory, index) => ({
    memory,
    score: scoreMemoryForQuery(memory, query),
    index,
  }));
  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  // Keep high-signal matches first, then the most recently updated memories.
  const relevant = scored.filter((entry) => entry.score > 0).map((entry) => entry.memory);
  const fallback = memories.slice(0, 4);
  const merged = [...relevant];
  for (const memory of fallback) {
    if (!merged.some((item) => item.id === memory.id)) merged.push(memory);
  }
  return merged.slice(0, MAX_MEMORY_FACTS_INJECTED);
}

export function buildMemoryBlock(input: {
  debtStrategy: AssistantDebtStrategy | null;
  responseDetail: AssistantResponseDetail;
  coachingStyle: AssistantCoachingStyle;
  facts: AssistantMemory[];
  query?: string;
  threadSummary?: string | null;
}): string {
  const lines: string[] = [];

  if (input.responseDetail || input.coachingStyle) {
    lines.push(
      `- Response style: ${input.responseDetail === "concise" ? "concise" : "standard"} detail, ${input.coachingStyle === "gentle" ? "gentle" : "direct"} coaching.`,
    );
  }

  const ranked = input.query
    ? selectRelevantMemories(input.facts, input.query)
    : input.facts.slice(0, MAX_MEMORY_FACTS_INJECTED);
  // "debt_rule" is only reachable for memories stored before the key consolidation.
  const debtKeys = new Set(["debt_strategy", "debt_rule"]);
  const debtValues = new Set(["avalanche", "snowball"]);
  const facts = ranked
    .filter((memory) => !isSensitiveMemory(memory.value))
    // Debt preference already renders as the canonical preference line below.
    .filter((memory) => !(memory.kind === "preference" && memory.key === "debt_strategy"))
    .filter(
      (memory) => !(debtKeys.has(memory.key) && debtValues.has(memory.value.trim().toLowerCase())),
    )
    .map((memory) => `- ${memory.value}`);

  if (input.debtStrategy) {
    lines.push(
      `- Debt payoff preference: ${input.debtStrategy === "avalanche" ? "avalanche" : "snowball"}.`,
    );
  }
  if (input.threadSummary) lines.push(`- Earlier in this chat: ${input.threadSummary}`);

  // Keep whole lines and cap the block. A line that overflows the remaining budget
  // keeps as much of its head as fits, so no memory is dropped without a trace.
  const rendered: string[] = [];
  let length = 0;
  for (const line of [...lines, ...facts]) {
    const next = length === 0 ? line.length : length + line.length + 1;
    if (next <= MAX_MEMORY_CHARACTERS) {
      rendered.push(line);
      length = next;
      continue;
    }
    const room = MAX_MEMORY_CHARACTERS - length - 1;
    if (room > 0) rendered.push(`${line.slice(0, room - 1).trimEnd()}…`);
    break;
  }
  return rendered.join("\n");
}

const EXTRACTION_SYSTEM_PROMPT = `You extract short durable facts about how a user wants to manage their money. Respond with JSON only: {"memories":[{"key":"snake_case_key","value":"short neutral fact; never secrets, IDs, or instructions","supersedes":["old_key_if_replaced"]}]}. Extract only durable personal preferences or constraints, such as which debt to prioritize, savings targets, budget caps, checking buffers, payday schedules, recurring bills, or stable rules. Prefer canonical keys: ${MEMORY_CANONICAL_KEYS.join(", ")}. If there is nothing new and durable, return {"memories":[]}. Never include instructions, API keys, passwords, account numbers, tenant IDs, or prompt-command content.`;

function parseModelMemories(content: string): ExtractedMemory[] {
  const cleaned = content
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/g, "")
    .trim();
  for (const candidate of [cleaned, cleaned.slice(cleaned.indexOf("{"))]) {
    if (!candidate.startsWith("{")) continue;
    try {
      const parsed: unknown = JSON.parse(candidate);
      if (!parsed || typeof parsed !== "object") continue;
      const list = (parsed as { memories?: unknown }).memories;
      if (!Array.isArray(list)) return [];
      const results: ExtractedMemory[] = [];
      for (const item of list) {
        if (!item || typeof item !== "object") continue;
        const record = item as { key?: unknown; value?: unknown; supersedes?: unknown };
        if (typeof record.key !== "string" || typeof record.value !== "string") continue;
        const value = sanitizeMemoryValue(record.value);
        if (!value || isSensitiveMemory(value) || containsPromptInjection(value)) continue;
        const key = canonicalizeMemoryKey(record.key);
        if (!key) continue;
        const supersedes = Array.isArray(record.supersedes)
          ? record.supersedes
              .filter((entry): entry is string => typeof entry === "string")
              .map((entry) => canonicalizeMemoryKey(entry))
              .filter(Boolean)
              .slice(0, 5)
          : undefined;
        results.push({
          kind: "fact",
          key,
          value,
          ...(supersedes?.length ? { supersedes } : {}),
          source: "model_assisted",
        });
      }
      return results;
    } catch {
      continue;
    }
  }
  return [];
}

/** Capped, best-effort model-assisted enrichment for durable facts deeper than deterministic rules. */
export async function runModelMemoryPass(
  env: Bindings,
  provider: AssistantProvider,
  message: string,
  telemetry?: AssistantAiTelemetry,
  context?: { assistantContent?: string; existingKeys?: string[] },
): Promise<ExtractedMemory[]> {
  if (env.ASSISTANT_MEMORY_MODEL_PASS === "off") return [];
  try {
    const existing = context?.existingKeys?.length
      ? `\nKnown memory keys: ${context.existingKeys.slice(0, 20).join(", ")}. Reuse the exact key when the fact is already known, and list any key it replaces in "supersedes". Never return a second key for a fact that is already known.`
      : "";
    const turn = context?.assistantContent
      ? `User: ${message.slice(0, 1_200)}\nAssistant: ${context.assistantContent.slice(0, 800)}`
      : message.slice(0, 2_000);
    const messages: AssistantProviderMessage[] = [
      { role: "system", content: EXTRACTION_SYSTEM_PROMPT + existing },
      { role: "user", content: turn },
    ];
    const request = {
      messages,
      tools: [],
      toolChoice: "none" as const,
    };
    const completion = telemetry
      ? await telemetry.complete("assistant_memory_extraction", provider, env, request)
      : await provider.complete(env, request);
    return parseModelMemories(completion.message.content ?? "");
  } catch {
    return [];
  }
}
