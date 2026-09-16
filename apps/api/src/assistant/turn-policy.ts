import type {
  AssistantCompliancePosture,
  AssistantComplianceTopic,
  AssistantDateRange,
  AssistantResponseMetadata,
  AssistantSourceMetadata,
} from "@zoption/shared";

import type { AssistantHistoryMessage } from "../db/assistant";
import { classifyCompliance } from "./compliance-policy";
import { resolveAssistantPeriod, type TransactionDateBounds } from "./date-range";

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
  | "savings_projection";

export interface AssistantTurnPolicy {
  currentDate: string;
  timeZone: string;
  compliance: {
    posture: AssistantCompliancePosture;
    topics: AssistantComplianceTopic[];
  };
  resolvedPeriod?: AssistantDateRange;
  requiredToolGroups: RequiredToolGroup[];
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

function requiredGroups(message: string): RequiredToolGroup[] {
  const groups = new Set<RequiredToolGroup>();
  const personalized = PERSONAL_DATA_PATTERN.test(message);

  if (
    /\b(?:account|wallet|cash|bank|credit|bangko|pera|kuwenta)\b.*\b(?:balances?|balanse)\b|\b(?:current balances?|balanse ng account|balanse ko|pera ko)\b/i.test(
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
    /\b(?:monthly|per month|contribut|save|reach|by|bawat buwan|kada buwan|buwan-buwan|mag-ipon|maabot|hulog)\b/i.test(
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
    /\b(?:by category|category breakdown|which category|dining|grocer(?:y|ies)|transport|rent|bawat kategorya|kada kategorya|aling kategorya|pagkain|pamamalengke|groseri|transportasyon|upa)\b/i.test(
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
    /\b(?:overspend|over budget|budget|sumobra|lumagpas|badyet)\b/i.test(message)
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
  promptVersion = "expert-v2",
): AssistantResponseMetadata {
  return {
    promptVersion,
    compliance: policy.compliance,
    ...(policy.resolvedPeriod ? { resolvedPeriod: policy.resolvedPeriod } : {}),
    ...(policy.disclaimer ? { disclaimer: policy.disclaimer } : {}),
    sources,
  };
}

export function serializeTurnPolicy(policy: AssistantTurnPolicy): string {
  return JSON.stringify({
    compliance: policy.compliance,
    resolvedPeriod: policy.resolvedPeriod,
    requiredToolGroups: policy.requiredToolGroups,
  });
}
