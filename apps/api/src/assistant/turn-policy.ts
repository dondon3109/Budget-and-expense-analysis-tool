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
  /\b(?:my|mine|i\s+(?:spent|earned|saved|paid|received|overspent)|show me|tell me my|how much did i|what did i|do i have)\b/i;
const EDUCATION_PATTERN = /\b(?:what is|what are|explain|how does|how do|define|meaning of)\b/i;

function requiredGroups(message: string): RequiredToolGroup[] {
  const groups = new Set<RequiredToolGroup>();
  const personalized = PERSONAL_DATA_PATTERN.test(message);

  if (
    /\b(?:account|wallet|cash|bank|credit)\b.*\bbalances?\b|\bcurrent balances?\b/i.test(message)
  ) {
    groups.add("account_balance");
  }
  if (
    /\b(?:debt|loan|credit card)\b/i.test(message) &&
    /\b(?:payoff|pay off|avalanche|snowball|which.*first|how long|interest)\b/i.test(message)
  ) {
    groups.add("debt_projection");
  }
  if (
    /\b(?:savings? goal|target|emergency fund|sinking fund)\b/i.test(message) &&
    /\b(?:monthly|per month|contribut|save|reach|by)\b/i.test(message)
  ) {
    groups.add("savings_projection");
  }
  if (/\b(?:recurring|repeat(?:ing)?|subscription|regular charge)\b/i.test(message)) {
    groups.add("recurring");
  }
  if (/\b(?:anomal|unusual|outlier|spike|why.*overspend|why.*higher)\b/i.test(message)) {
    groups.add("anomaly");
  }
  if (/\b(?:budget|over budget|overspend)\b/i.test(message) && personalized) {
    groups.add("budget_comparison");
  }
  if (
    /\b(?:transactions?|purchases?|charges?)\b/i.test(message) &&
    /\b(?:list|show|recent|latest|find|which)\b/i.test(message)
  ) {
    groups.add("transaction_detail");
  }
  if (
    /\b(?:categories|category list)\b/i.test(message) &&
    /\b(?:list|show|available|have)\b/i.test(message)
  ) {
    groups.add("category_list");
  }
  if (
    personalized &&
    /\b(?:by category|category breakdown|which category|dining|grocer(?:y|ies)|transport|rent)\b/i.test(
      message,
    )
  ) {
    groups.add("category_spending");
  }
  if (
    personalized &&
    /\b(?:income|earn(?:ed|ing|s)?|expenses?|spend(?:ing|t)?|net|sav(?:e|ed|ings?)(?: rate)?|pay(?:ments?)?|paid|receive(?:d)?|cash flow|remaining|left|average)\b/i.test(
      message,
    )
  ) {
    groups.add("period_summary");
  }
  if (groups.has("anomaly") && /\b(?:overspend|over budget|budget)\b/i.test(message)) {
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

  const groups = requiredGroups(input.message);
  const period = resolveAssistantPeriod(
    input.history,
    input.message,
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
