import {
  assistantReplyDrafts,
  type AssistantCompliancePosture,
  type AssistantComplianceTopic,
  type AssistantDateRange,
  type AssistantResponseMetadata,
  type AssistantSourceMetadata,
} from "@zoption/shared";

import type { AssistantHistoryMessage } from "../db/assistant";
import { classifyCompliance } from "./compliance-policy";
import { resolveAssistantPeriod, type TransactionDateBounds } from "./date-range";

/** Recorded on every reply and audit row; bump it when the system prompt's rules change. */
export const ASSISTANT_PROMPT_VERSION = "expert-v7";

export type RequiredToolGroup =
  | "account_balance"
  | "period_summary"
  | "category_spending"
  | "budget_comparison"
  | "transaction_detail"
  | "category_list"
  | "recurring"
  | "anomaly"
  | "debt_projection"
  | "savings_projection"
  | "transaction_entry";

export interface AssistantTurnPolicy {
  currentDate: string;
  timeZone: string;
  compliance: {
    posture: AssistantCompliancePosture;
    topics: AssistantComplianceTopic[];
  };
  resolvedPeriod?: AssistantDateRange;
  requiredToolGroups: RequiredToolGroup[];
  /** The user is creating, changing, or deleting a subscription, goal, or debt. */
  actionFlow?: boolean;
  deterministicResponse?: string;
  disclaimer?: {
    text: string;
    topics: AssistantComplianceTopic[];
  };
}

const PERSONAL_DATA_PATTERN =
  /\b(?:my|mine|i\s+(?:spent|earned|saved|paid|received|overspent)|show me|tell me my|how much did i|what did i|do i have|ko|kong|akin|aking|sa akin|nagastos(?: ko)?|nagasta(?: ko)?|gumastos(?: ako)?|nagbayad(?: ako)?|binayad(?: ko)?|kinita(?: ko)?|naipon(?: ko)?|ipon(?: ko)?|sinahod(?: ko)?|natanggap(?: ko)?|sumobra(?: ang)? gastos(?: ko)?|lagpas sa budget|ipakita(?: mo)?(?: sa akin)?|pakita(?: mo)?|sabihin mo sa akin|magkano(?: ang)?(?: nagastos| nagasta| kinita| naipon| natitira)|meron ba akong?|may(?:roon)? ba akong?|may pera ba ako)\b/i;
const EDUCATION_PATTERN =
  /\b(?:what is|what are|explain|how does|how do|define|meaning of|ano ang ibig sabihin|ano ang|ano ba ang|ipaliwanag|kahulugan ng|paano gumagana)\b/i;

// "Log my lunch", "add an expense", "pa-record ng gastos ko".
const ENTRY_COMMAND_PATTERN =
  /\b(?:log|record|add(?!\s+up)|enter|input|itala|idagdag|ilagay|isulat|i-?log|i-?record|i-?add|pa-?log|pa-?record)\b[^.?!]{0,40}?\b(?:transactions?|expenses?|spending|purchases?|income|payments?|salary|lunch|dinner|breakfast|meal|groceries|fare|gastos|gastusin|binili|bayad|kita|sahod|sweldo|transaksyon|pamasahe)\b/i;
// "I spent 250 at Jollibee", "bumili ako sa 7-Eleven", "nagbayad ako ng kuryente".
const ENTRY_STATEMENT_PATTERN =
  /\b(?:i\s+(?:just\s+|also\s+)?(?:spent|paid|bought|purchased|ate at|went to|withdrew|received|got paid|earned)|(?:gumastos|nagbayad|bumili|kumain|pumunta|nag-?grocery|namalengke|nag-?withdraw|sumahod|nakatanggap|nagastos)\s+ako)\b/i;
// "I have 300 left in GCash", "500 na lang natira sa wallet ko". Only with a money word, so
// "3 months left on my loan" stays a planning question.
const MONEY_CONTEXT_PATTERN =
  /\b(?:php|pesos?|piso|gcash|maya|wallet|cash|bank|account|pitaka|pera|balance|balanse)\b|₱/i;
const REMAINING_STATEMENT_PATTERN =
  /\d[^.?!]{0,40}\b(?:left|remaining|natira|natitira|na lang)\b|\b(?:left|remaining|natira|natitira)\b[^.?!]{0,40}\d/i;
const QUESTION_PATTERN =
  /\?|\b(?:how much|how many|what did|what was|what were|why|did i|magkano|ilan|ano ang|bakit)\b/i;
const POLITE_REQUEST_PATTERN =
  /^\s*(?:(?:can|could|would|will)\s+you|please|pwede(?:\s+mo)?|paki)/i;
// A bare acknowledgement after a draft carries nothing to log.
const ACKNOWLEDGEMENT_PATTERN =
  /^\s*(?:thanks?(?: you)?|thank u|ty|salamat(?: po)?|got it|nice|great|cool|awesome|done)[\s!.]*$/i;
const VAGUE_SPEND_PATTERN = /\b(?:too much|so much|a lot|sobra|ang laki|ang dami)\b/i;

/**
 * A request to log a transaction, or a statement of spending with a figure or a place. Those
 * statements ("I spent 250 at Jollibee") also read as spending questions, so they are decided
 * here first and never demand a reporting period.
 */
function isTransactionEntryRequest(message: string): boolean {
  if (QUESTION_PATTERN.test(message) && !POLITE_REQUEST_PATTERN.test(message)) return false;
  if (ENTRY_COMMAND_PATTERN.test(message)) {
    return !/\b(?:how (?:do|can|to)|paano)\b/i.test(message);
  }
  if (VAGUE_SPEND_PATTERN.test(message)) return false;
  if (ENTRY_STATEMENT_PATTERN.test(message)) {
    return /\d|\b(?:at|sa|from)\s+\S/i.test(message);
  }
  return REMAINING_STATEMENT_PATTERN.test(message) && MONEY_CONTEXT_PATTERN.test(message);
}

// "Add a Netflix subscription", "delete my car loan", "idagdag ang goal na iPhone".
const ACTION_VERB_PATTERN =
  /\b(?:add|create|make|set\s*up|new|change|update|edit|rename|delete|remove|archive|set|cancel|pause|resume|reactivate|mark|adjust|increase|decrease|idagdag|gumawa|gawa|burahin|tanggalin|palitan|baguhin|i-?cancel|i-?delete|i-?update)\b/i;
const ACTION_NOUN_PATTERN =
  /\b(?:subscriptions?|subskripsyon|savings? goals?|goals?|layunin|debts?|loans?|credit cards?|utang|accounts?|wallets?|balances?|categor(?:y|ies)|budgets?|transactions?)\b/i;

// "How do I import a statement?", "paano mag-export ng transactions". Verbs are limited to
// product tasks so "how do I compare to last month" still reads as a records question.
const HELP_PATTERN =
  /\b(?:how (?:do|can|could|would|should) (?:i|we|you)|how to|where (?:do|can|could) i|paano (?:ako |ko )?(?:mag|mo|i-?|maka|mai))\s*(?:\w+\s+){0,2}?(?:add|create|set ?up|change|edit|delete|remove|import|export|upload|cancel|reset|upgrade|connect|install|download|sign|log ?in|enable|disable|turn|switch|find|use|rename|archive|link|delete|mag-?\w+|i-?\w+)\b/i;

/** A how-to question about the app itself. It needs no records, so it never asks for a period. */
function isHelpRequest(message: string): boolean {
  return HELP_PATTERN.test(message);
}

/**
 * A request to create, change, or delete a subscription, goal, or debt. It reads like a
 * records question ("subscription" alone asks for recurring charges), so it is decided here
 * first and never demands a reporting period.
 */
function isActionRequest(message: string): boolean {
  if (/\b(?:how (?:do|can|to)|paano)\b/i.test(message)) return false;
  return ACTION_VERB_PATTERN.test(message) && ACTION_NOUN_PATTERN.test(message);
}

/** The previous reply asked for details or proposed a change, and this message answers it. */
function continuesActionFlow(
  history: readonly AssistantHistoryMessage[],
  message: string,
  posture: AssistantCompliancePosture,
): boolean {
  const previous = history.at(-1);
  if (previous?.role !== "assistant" || !previous.metadata?.assistantActionFlow) return false;
  if (previous.metadata.assistantAction?.status === "done") return false;
  if (posture !== "budgeting_allowed" || EDUCATION_PATTERN.test(message)) return false;
  if (ACKNOWLEDGEMENT_PATTERN.test(message)) return false;
  const asksForRecords =
    QUESTION_PATTERN.test(message) ||
    /\b(?:show|list|compare|tell me|ipakita|pakita|ilista)\b/i.test(message);
  return !(asksForRecords && requiredGroups(message).length > 0);
}

/**
 * The reply before this message was part of logging a transaction that is not saved yet, and
 * this message is an answer to it ("GCash, 300 left") rather than a new question: one that
 * needs other records, asks for an explanation, or touches a regulated topic.
 */
function continuesTransactionEntry(
  history: readonly AssistantHistoryMessage[],
  message: string,
  posture: AssistantCompliancePosture,
): boolean {
  const previous = history.at(-1);
  if (previous?.role !== "assistant" || !previous.metadata?.transactionEntry) return false;
  const drafts = assistantReplyDrafts(previous.metadata) as Array<{ status?: string }>;
  if (drafts.length > 0 && drafts.every((draft) => draft.status === "saved")) return false;
  if (posture !== "budgeting_allowed" || EDUCATION_PATTERN.test(message)) return false;
  if (ACKNOWLEDGEMENT_PATTERN.test(message)) return false;
  const asksForRecords =
    QUESTION_PATTERN.test(message) ||
    /\b(?:show|list|compare|tell me|ipakita|pakita|ilista)\b/i.test(message);
  return !(asksForRecords && requiredGroups(message).length > 0);
}

function requiredGroups(message: string): RequiredToolGroup[] {
  const groups = new Set<RequiredToolGroup>();
  const personalized = PERSONAL_DATA_PATTERN.test(message);

  if (
    /\b(?:account|wallet|cash|bank|credit|bangko|pera|kuwenta|gcash|maya)\b.*\b(?:balances?|balanse|laman)\b|\b(?:current balances?|balanse ng account|balanse ko|pera ko|laman ng (?:bangko|wallet|account|pera|gcash|maya)(?: ko)?)\b/i.test(
      message,
    )
  ) {
    groups.add("account_balance");
  }
  if (
    /\b(?:debt|loan|credit card|utang|pagkakautang)\b/i.test(message) &&
    /\b(?:payoff|pay off|avalanche|snowball|which.*first|how long|interest|bayaran|mabayaran|unahin|alin ang uunahin|interes|gaano katagal)\b/i.test(
      message,
    )
  ) {
    groups.add("debt_projection");
  }
  if (
    /\b(?:savings? goal|target|emergency fund|sinking fund|layunin(?:\s+sa\s+ipon)?|ipon goal)\b/i.test(
      message,
    ) &&
    /\b(?:monthly|per month|contribut|save|reach|by|bawat buwan|kada buwan|buwan-buwan|mag-ipon|maabot|makamit|hulog|iipon|maiipon)\b/i.test(
      message,
    )
  ) {
    groups.add("savings_projection");
  }
  if (
    /\b(?:recurring|repeat(?:ing)?|subscription|regular charge|paulit-ulit|subskripsyon|buwanang bayarin|regular na bayarin)\b/i.test(
      message,
    )
  ) {
    groups.add("recurring");
  }
  if (
    /\b(?:anomal|unusual|outlier|spike|why.*overspend|why.*higher|kakaiba|hindi karaniwan|hindi pangkaraniwan|bakit.*tumaas|bakit.*lumaki|bakit.*sumobra)\b/i.test(
      message,
    )
  ) {
    groups.add("anomaly");
  }
  if (
    /\b(?:budget|badyet|over budget|overspend|sobra sa budget|lagpas sa budget|lumagpas sa budget)\b/i.test(
      message,
    ) &&
    personalized
  ) {
    groups.add("budget_comparison");
  }
  if (
    /\b(?:transactions?|purchases?|charges?|transaksyon|binili|pinamili|gastusin)\b/i.test(
      message,
    ) &&
    /\b(?:list|show|recent|latest|find|which|ipakita|pakita|ilista|lista|pinakabago|huli|kamakailan|hanapin|alin)\b/i.test(
      message,
    )
  ) {
    groups.add("transaction_detail");
  }
  if (
    /\b(?:categories|category list|kategorya|mga kategorya)\b/i.test(message) &&
    /\b(?:list|show|available|have|ipakita|pakita|ilista|mayroon|meron)\b/i.test(message)
  ) {
    groups.add("category_list");
  }
  if (
    personalized &&
    /\b(?:by category|category breakdown|which category|dining|grocer(?:y|ies)|transport|rent|bawat kategorya|kada kategorya|aling kategorya|pagkain|pamamalengke|groseri|transportasyon|upa|where did (?:most of )?my money go|saan napunta ang pera ko|pinakamalaki(?:ng)? (?:gastos|kategorya|pinagkakagastusan)|biggest expense|top expense|highest spend(?:ing)?)\b/i.test(
      message,
    )
  ) {
    groups.add("category_spending");
  }
  if (
    personalized &&
    /\b(?:income|earn(?:ed|ing|s)?|expenses?|spend(?:ing|t)?|net|sav(?:e|ed|ings?)(?: rate)?|pay(?:ments?)?|paid|receive(?:d)?|cash flow|remaining|left|average|kita|kinita|sweldo|sahod|gastos|nagastos|nagasta|ipon|naipon|bayad|nagbayad|binayad|natira|natitira|kabuuan)\b/i.test(
      message,
    )
  ) {
    groups.add("period_summary");
  }
  if (
    groups.has("anomaly") &&
    /\b(?:overspend|over budget|budget|sumobra|lumagpas|badyet|gastos|gastusin)\b/i.test(message)
  ) {
    groups.add("budget_comparison");
    groups.add("category_spending");
  }

  if (EDUCATION_PATTERN.test(message) && !personalized) groups.clear();
  return [...groups];
}

function groupsRequirePeriod(groups: readonly RequiredToolGroup[]): boolean {
  return groups.some((group) =>
    ["period_summary", "category_spending", "budget_comparison", "anomaly"].includes(group),
  );
}

const RETRY_FOLLOWUP_PATTERN =
  /^(please\s+)?(answer|retry|run)\s+(this|that|it)(\s+question)?(\s+again)?[?.!]*$|^(try\s+again|same\s+question|sagutin mo ito|subukan muli|ulit)[?.!]*$/i;

function lastUserMessage(history: readonly AssistantHistoryMessage[]): string | null {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const item = history[index];
    if (item?.role === "user") return item.content;
  }
  return null;
}

/**
 * A bare "answer this question" after a refusal carries no requirements of
 * its own. Treat it as a retry of the previous user question so the same
 * tools re-run instead of serving the generic rephrase refusal. Anything
 * with its own requirements, or with no usable previous question, passes
 * through unchanged.
 */
function retryTargetMessage(history: readonly AssistantHistoryMessage[], message: string): string {
  if (requiredGroups(message).length > 0 || !RETRY_FOLLOWUP_PATTERN.test(message.trim())) {
    return message;
  }
  const previous = lastUserMessage(history);
  return previous && requiredGroups(previous).length > 0 ? previous : message;
}

export function createAssistantTurnPolicy(input: {
  history: readonly AssistantHistoryMessage[];
  message: string;
  currentDate: string;
  timeZone: string;
  transactionBounds: TransactionDateBounds | null;
}): AssistantTurnPolicy {
  const compliance = classifyCompliance(input.message);
  if (compliance.deterministicResponse) {
    return {
      currentDate: input.currentDate,
      timeZone: input.timeZone,
      compliance: { posture: compliance.posture, topics: compliance.topics },
      requiredToolGroups: [],
      deterministicResponse: compliance.deterministicResponse,
      ...(compliance.disclaimer
        ? { disclaimer: { text: compliance.disclaimer, topics: compliance.topics } }
        : {}),
    };
  }

  if (
    isTransactionEntryRequest(input.message) ||
    continuesTransactionEntry(input.history, input.message, compliance.posture)
  ) {
    // A date the user states ("kahapon") is passed along as context; a missing or unclear
    // one never blocks the entry, because the draft falls back to today and is reviewed.
    // The classified posture is kept, so logging an insurance payment still carries its
    // disclaimer and the regulated-recommendation check.
    const period = resolveAssistantPeriod(
      input.history,
      input.message,
      input.currentDate,
      input.transactionBounds,
    );
    return {
      currentDate: input.currentDate,
      timeZone: input.timeZone,
      compliance: { posture: compliance.posture, topics: compliance.topics },
      requiredToolGroups: ["transaction_entry"],
      ...(period.period ? { resolvedPeriod: period.period } : {}),
      ...(compliance.disclaimer
        ? { disclaimer: { text: compliance.disclaimer, topics: compliance.topics } }
        : {}),
    };
  }

  if (isHelpRequest(input.message) && !isTransactionEntryRequest(input.message)) {
    return {
      currentDate: input.currentDate,
      timeZone: input.timeZone,
      compliance: { posture: "general_education", topics: compliance.topics },
      requiredToolGroups: [],
      ...(compliance.disclaimer
        ? { disclaimer: { text: compliance.disclaimer, topics: compliance.topics } }
        : {}),
    };
  }

  if (
    isActionRequest(input.message) ||
    continuesActionFlow(input.history, input.message, compliance.posture)
  ) {
    return {
      currentDate: input.currentDate,
      timeZone: input.timeZone,
      compliance: { posture: compliance.posture, topics: compliance.topics },
      requiredToolGroups: [],
      actionFlow: true,
      ...(compliance.disclaimer
        ? { disclaimer: { text: compliance.disclaimer, topics: compliance.topics } }
        : {}),
    };
  }

  const effectiveMessage = retryTargetMessage(input.history, input.message);
  const groups = requiredGroups(effectiveMessage);
  const period = resolveAssistantPeriod(
    input.history,
    effectiveMessage,
    input.currentDate,
    input.transactionBounds,
    groupsRequirePeriod(groups),
  );
  const posture =
    compliance.posture === "budgeting_allowed" && groups.length === 0
      ? "general_education"
      : compliance.posture;
  const base: AssistantTurnPolicy = {
    currentDate: input.currentDate,
    timeZone: input.timeZone,
    compliance: { posture, topics: compliance.topics },
    requiredToolGroups: groups,
    ...(compliance.disclaimer
      ? { disclaimer: { text: compliance.disclaimer, topics: compliance.topics } }
      : {}),
  };

  if (period.clarification) {
    return { ...base, requiredToolGroups: [], deterministicResponse: period.clarification };
  }
  if (period.deterministicResponse) {
    return { ...base, requiredToolGroups: [], deterministicResponse: period.deterministicResponse };
  }
  return { ...base, ...(period.period ? { resolvedPeriod: period.period } : {}) };
}

export function responseMetadataForPolicy(
  policy: AssistantTurnPolicy,
  sources: AssistantSourceMetadata[] = [],
  promptVersion = ASSISTANT_PROMPT_VERSION,
): AssistantResponseMetadata {
  return {
    promptVersion,
    compliance: policy.compliance,
    ...(policy.resolvedPeriod ? { resolvedPeriod: policy.resolvedPeriod } : {}),
    ...(policy.disclaimer ? { disclaimer: policy.disclaimer } : {}),
    sources,
    ...(policy.requiredToolGroups.includes("transaction_entry") ? { transactionEntry: true } : {}),
    ...(policy.actionFlow ? { assistantActionFlow: true } : {}),
  };
}

export function serializeTurnPolicy(policy: AssistantTurnPolicy): string {
  return JSON.stringify({
    compliance: policy.compliance,
    resolvedPeriod: policy.resolvedPeriod,
    requiredToolGroups: policy.requiredToolGroups,
  });
}
